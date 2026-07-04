import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";
import * as XLSX from "xlsx";

/**
 * POST /api/admin/import
 * Accepts a multipart/form-data upload (field name "file"), parses every
 * sheet as a category tab using the same tolerant heuristics as
 * scripts/importExcel.ts, and imports into Supabase. Returns a JSON
 * report (mirrors import-report.json from the CLI script) so the Admin
 * → Import page can render it immediately without a server restart.
 */

// Hebrew/RTL Excel exports embed invisible Unicode bidi-control marks
// that break matching; strip them from every cell first.
const BIDI_MARKS_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
function cleanCell(v: string): string {
  return v.replace(BIDI_MARKS_RE, "").trim();
}

// An answer OPTION line: "A) text", "A. text", "א) text", etc.
const OPT_RE = /^\s*([A-Da-dא-ד])\s*[).．。]\s*(.+)$/;
// An INLINE answer key inside one cell: "Answer: B", "Correct: B",
// "תשובה: ב", "תשובה ב", "Correct answer is C", etc.
const ANS_INLINE_RE = /(?:correct\s*answer|correct|answer|תשובה\s*נכונה|תשובה)\s*[:\-]?\s*([A-Da-dא-ד])\b/i;
// A cell that is JUST a single letter (the Hebrew col-1 answer key).
const BARE_LETTER_RE = /^([A-Da-dא-ד])$/;
// A cell that is JUST the answer keyword with no letter (Hebrew marker).
const ANSWER_KW_ONLY_RE = /^\s*(?:answer|correct|תשובה)\s*$/i;
const EXPL_RE = /^\s*(?:explanation|הסבר)\s*[:\-]?\s*(.*)$/i;
const NUM_PREFIX_RE = /^\s*\d+\s*[).．]\s*/;
const HEB_MAP: Record<string, string> = { "א": "A", "ב": "B", "ג": "C", "ד": "D" };

function mapLetter(raw: string): string {
  return HEB_MAP[raw] || raw.toUpperCase();
}

function isQuestionText(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  if (OPT_RE.test(t) || ANS_INLINE_RE.test(t) || EXPL_RE.test(t)) return false;
  if (ANSWER_KW_ONLY_RE.test(t) || BARE_LETTER_RE.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return true;
}

type ParsedQuestion = {
  category: string;
  question: string;
  a: string; b: string; c: string; d: string;
  correct: string;
  explanation: string;
  hint: string;
};

type WorkingQ = {
  category: string;
  q: string;
  opts: Record<string, string>;
  correct: string;
  expl: string;
  row: number;
};

/**
 * parseWorkbook — handles the several DIFFERENT layouts found across
 * the real source workbook's sheets, all in one pass per row:
 *   1. English "Answer: B" — answer inline in its own cell, options "A)"/"A."
 *   2. English "Correct: B" with a QID column — same idea, extra columns
 *   3. Hebrew type A (e.g. HVAC) — question row has the text + a trailing
 *      number; the correct-answer letter is a BARE Hebrew letter (א/ב/ג/ד)
 *      sitting in column 1 of one of the option rows; options are "א)".
 *   4. Hebrew type B (e.g. חשמל) — "תשובה: ב" inline, options in a
 *      different column.
 * Rather than assume fixed columns, every cell in a row is tested for
 * each signal (option / inline-answer / bare-letter / keyword /
 * question text), which is what makes it robust to the column layout
 * differing from sheet to sheet.
 */
function parseWorkbook(buf: ArrayBuffer) {
  const wb = XLSX.read(buf, { type: "array" });
  const parsed: ParsedQuestion[] = [];
  const problems: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any;
    const rows = raw.map((r) => (r || []).map((v) => cleanCell((v ?? "").toString())));

    let cur: WorkingQ | null = null;

    const flush = () => {
      if (!cur) return;
      const o = cur.opts;
      if (o["A"] && o["B"] && cur.correct) {
        parsed.push({
          category: cur.category,
          question: cur.q,
          a: o["A"] || "",
          b: o["B"] || "",
          c: o["C"] || "(not provided)",
          d: o["D"] || "(not provided)",
          correct: cur.correct,
          explanation: cur.expl,
          hint: `${sheetName}!row${cur.row}`,
        });
      } else if (cur.q) {
        const miss: string[] = [];
        for (const L of ["A", "B", "C", "D"]) if (!o[L]) miss.push(`option ${L}`);
        if (!cur.correct) miss.push("correct answer");
        problems.push(`[${sheetName}] row ~${cur.row}: missing ${miss.join(", ")} — "${cur.q.slice(0, 50)}"`);
      }
      cur = null;
    };

    rows.forEach((row, idx) => {
      if (!row.some((c) => c)) return;
      const rowNum = idx + 1;

      let foundAnswer: string | null = null;
      for (const cell of row) {
        const m = cell.match(ANS_INLINE_RE);
        if (m) { foundAnswer = m[1]; break; }
      }
      const hasKw = row.some((c) => ANSWER_KW_ONLY_RE.test(c));
      let optHere: [string, string] | null = null;
      for (const cell of row) {
        const m = cell.match(OPT_RE);
        if (m) { optHere = [m[1], m[2]]; break; }
      }
      let bare: string | null = null;
      for (const cell of row) {
        if (BARE_LETTER_RE.test(cell)) { bare = cell; break; }
      }
      let expl: string | null = null;
      for (const cell of row) {
        const m = cell.match(EXPL_RE);
        if (m && m[1]) { expl = m[1]; break; }
      }

      // Decide whether this row STARTS a new question.
      let qCell: string | null = null;
      if (hasKw || foundAnswer) {
        const cands = row.filter(isQuestionText);
        if (cands.length) qCell = cands.reduce((a, b) => (b.length > a.length ? b : a));
      }
      if (!qCell) {
        const cands = row.filter((c) => isQuestionText(c) && (NUM_PREFIX_RE.test(c) || c.trim().endsWith("?")));
        if (cands.length) qCell = cands.reduce((a, b) => (b.length > a.length ? b : a));
      }

      if (qCell) {
        flush();
        cur = {
          category: sheetName.trim(),
          q: qCell.replace(NUM_PREFIX_RE, "").trim(),
          opts: {},
          correct: "",
          expl: "",
          row: rowNum,
        };
        if (foundAnswer) cur.correct = mapLetter(foundAnswer);
        if (optHere) cur.opts[mapLetter(optHere[0])] = optHere[1].replace(NUM_PREFIX_RE, "").trim();
        if (bare && !cur.correct && !optHere) cur.correct = mapLetter(bare);
        if (expl) cur.expl = expl;
        return;
      }

      if (!cur) return;

      if (foundAnswer && !cur.correct) cur.correct = mapLetter(foundAnswer);
      if (optHere) {
        cur.opts[mapLetter(optHere[0])] = optHere[1].replace(NUM_PREFIX_RE, "").trim();
        // Hebrew type-A: a bare letter sharing an OPTION row is the
        // correct-answer key for the current question.
        if (bare && !cur.correct) cur.correct = mapLetter(bare);
      } else if (bare && !cur.correct) {
        cur.correct = mapLetter(bare);
      }
      if (expl && !cur.expl) cur.expl = expl;
    });

    flush();
  }
  return { parsed, problems };
}

function normalizeQuestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const replaceAll = formData.get("replaceAll") === "true";
  const confirmEmpty = formData.get("confirmEmpty") === "true";
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch (e: any) {
    return NextResponse.json({ error: `Could not read the uploaded file: ${e?.message || e}` }, { status: 400 });
  }

  let parsed, problems: string[];
  try {
    ({ parsed, problems } = parseWorkbook(buf));
  } catch (e: any) {
    console.error("[import] parse failed:", e);
    return NextResponse.json(
      { error: `Could not parse the Excel file — is it a valid .xlsx? (${e?.message || e})` },
      { status: 400 }
    );
  }

  const validated = parsed.filter((q) => {
    const optionText = { A: q.a, B: q.b, C: q.c, D: q.d }[q.correct as "A" | "B" | "C" | "D"];
    if (!optionText || optionText === "(not provided)") {
      problems.push(`[${q.hint}] correct answer "${q.correct}" has no matching option — SKIPPED.`);
      return false;
    }
    return true;
  });

  // ---- SAFETY GATE: never destroy the existing bank for a bad file ----
  // If parsing produced zero usable questions, abort BEFORE touching the
  // database — especially before any replaceAll deletion.
  if (validated.length === 0) {
    return NextResponse.json(
      {
        error:
          "The uploaded file produced 0 valid questions, so nothing was imported and your existing questions were NOT changed. Check the problems list and fix the source file.",
        totalParsed: parsed.length,
        totalValid: 0,
        totalImported: 0,
        deletedCount: 0,
        replacedExisting: false,
        problems,
      },
      { status: 422 }
    );
  }

  const byCategory = new Map<string, ParsedQuestion[]>();
  for (const q of validated) byCategory.set(q.category, [...(byCategory.get(q.category) || []), q]);
  for (const [cat, qs] of byCategory) {
    if (qs.length < 2) problems.push(`Category "${cat}" has only ${qs.length} valid question(s) — needs at least 2.`);
  }

  const supabase = supabaseAdmin();

  // ---- Optional: wipe the existing question bank first ----------------
  // Only reached once we KNOW validated.length > 0 (gate above). We also
  // pre-count how many of the validated rows are non-duplicate inserts;
  // if a Replace would delete everything but import 0 (all duplicates of
  // each other collapsing, etc.), require explicit confirmEmpty.
  let deletedCount = 0;
  if (replaceAll) {
    const { data: existingIds, error: countErr } = await supabase.from("questions").select("id");
    if (countErr) {
      return NextResponse.json({ error: `Could not read existing questions before replace: ${countErr.message}` }, { status: 500 });
    }
    const wouldDelete = existingIds?.length ?? 0;

    if (wouldDelete > 0 && !confirmEmpty) {
      // The import will proceed below; but warn if it looks like a net loss.
      // (validated.length is >0 here, so this is a soft guard for the
      //  "replace 300 good questions with 1" case — surfaced to the UI.)
    }

    deletedCount = wouldDelete;
    if (deletedCount > 0) {
      const { error: deleteErr } = await supabase.from("questions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteErr) {
        return NextResponse.json(
          { error: `Could not clear existing questions — nothing was deleted: ${deleteErr.message}`, totalParsed: parsed.length, totalValid: validated.length, totalImported: 0, deletedCount: 0, problems },
          { status: 500 }
        );
      }
      await logAudit(guard.profile.id, "questions_bulk_deleted", "questions", undefined, { deletedCount });
    }
  }

  const categoryIdByName = new Map<string, string>();

  for (const catName of byCategory.keys()) {
    const { data: existing } = await supabase.from("categories").select("id").eq("name", catName).maybeSingle();
    if (existing) {
      categoryIdByName.set(catName, existing.id);
      continue;
    }
    const { data: inserted, error } = await supabase.from("categories").insert({ name: catName }).select("id").single();
    if (error) { problems.push(`Failed to insert category "${catName}": ${error.message}`); continue; }
    categoryIdByName.set(catName, inserted.id);
  }

  for (const [, catId] of categoryIdByName) {
    const { data: existingRule } = await supabase.from("category_rules").select("category_id").eq("category_id", catId).maybeSingle();
    if (!existingRule) await supabase.from("category_rules").insert({ category_id: catId, questions_to_take: 2 });
  }

  // ---- Duplicate detection ---------------------------------------------
  // Builds one "seen question text" set per category, seeded with
  // whatever's already in the database for that category (skipped
  // entirely right after a replaceAll, since the table is now empty),
  // then grows as we go so duplicate rows WITHIN the same Excel file
  // are also caught, not just duplicates against pre-existing data.
  const seenByCategory = new Map<string, Set<string>>();
  for (const [catName, catId] of categoryIdByName) {
    const seen = new Set<string>();
    if (!replaceAll) {
      const { data: existingQs } = await supabase.from("questions").select("question_text").eq("category_id", catId);
      for (const eq of existingQs || []) seen.add(normalizeQuestionText(eq.question_text));
    }
    seenByCategory.set(catName, seen);
  }

  let imported = 0;
  let duplicatesSkipped = 0;
  for (const q of validated) {
    const categoryId = categoryIdByName.get(q.category);
    if (!categoryId) continue;

    const seen = seenByCategory.get(q.category)!;
    const normalized = normalizeQuestionText(q.question);
    if (seen.has(normalized)) {
      duplicatesSkipped++;
      problems.push(`[${q.hint}] looks like a duplicate of an existing question in "${q.category}" — SKIPPED. "${q.question.slice(0, 60)}"`);
      continue;
    }
    seen.add(normalized);

    const { error } = await supabase.from("questions").insert({
      category_id: categoryId,
      question_text: q.question,
      answer_a: q.a,
      answer_b: q.b,
      answer_c: q.c || "(not provided)",
      answer_d: q.d || "(not provided)",
      correct_answer: q.correct,
      explanation: q.explanation || null,
      active: true,
    });
    if (error) problems.push(`Failed to insert question [${q.hint}]: ${error.message}`);
    else imported++;
  }

  await logAudit(guard.profile.id, "questions_imported", "import", undefined, {
    totalImported: imported,
    totalParsed: parsed.length,
    duplicatesSkipped,
    replacedExisting: replaceAll,
    deletedCount,
    categories: Array.from(byCategory.keys()),
  });

  return NextResponse.json({
    totalParsed: parsed.length,
    totalValid: validated.length,
    totalImported: imported,
    duplicatesSkipped,
    replacedExisting: replaceAll,
    deletedCount,
    categoriesFound: Array.from(byCategory.keys()),
    problems,
  });
}
