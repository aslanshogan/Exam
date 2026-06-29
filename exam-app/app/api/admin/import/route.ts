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

const OPT_RE = /^\s*([A-Dא-ד])[).]\s*(.+)$/;
const ANS_RE = /(answer|correct answer|תשובה)\s*[:\-]?\s*([A-Dא-ד])/i;
const EXPL_RE = /^(explanation|הסבר)\s*[:\-]?\s*(.*)$/i;
const NUM_PREFIX_RE = /^\s*\d+[).]\s*/;
const HEB_MAP: Record<string, string> = { "א": "A", "ב": "B", "ג": "C", "ד": "D" };

type ParsedQuestion = {
  category: string;
  question: string;
  a: string; b: string; c: string; d: string;
  correct: string;
  explanation: string;
  hint: string;
};

function parseWorkbook(buf: ArrayBuffer) {
  const wb = XLSX.read(buf, { type: "array" });
  const parsed: ParsedQuestion[] = [];
  const problems: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any;

    let curQ: string | null = null;
    let opts: Record<string, string> = {};
    let correct = "";
    let explanation = "";

    const flush = (rowNum: number) => {
      if (curQ && Object.keys(opts).length >= 2) {
        if (!opts["A"] || !opts["B"] || !correct) {
          problems.push(`[${sheetName}] row ~${rowNum}: incomplete (missing A/B or correct answer) — "${curQ.slice(0, 60)}"`);
        } else {
          parsed.push({ category: sheetName.trim(), question: curQ.replace(NUM_PREFIX_RE, "").trim(), a: opts["A"] || "", b: opts["B"] || "", c: opts["C"] || "", d: opts["D"] || "", correct, explanation, hint: `${sheetName}!row${rowNum}` });
        }
      }
      curQ = null; opts = {}; correct = ""; explanation = "";
    };

    rows.forEach((row, idx) => {
      const vals = (row || []).map((v) => (v ?? "").toString().trim()).filter((v) => v !== "");
      if (vals.length === 0) return;
      const leftovers: string[] = [];
      for (const v of vals) {
        const mAns = v.match(ANS_RE);
        const mOpt = v.match(OPT_RE);
        const mExpl = v.match(EXPL_RE);
        if (mAns) {
          const letter = mAns[2].toUpperCase();
          correct = HEB_MAP[letter] || letter;
        } else if (mOpt) {
          let letter = mOpt[1];
          letter = HEB_MAP[letter] || letter;
          opts[letter] = mOpt[2].trim();
        } else if (mExpl) {
          explanation = mExpl[2].trim();
        } else {
          leftovers.push(v);
        }
      }
      if (leftovers.length) {
        const text = leftovers.sort((x, y) => y.length - x.length)[0];
        if (text.length > 3) {
          if (curQ && Object.keys(opts).length >= 2) flush(idx + 1);
          if (curQ === null) curQ = text;
          else if (Object.keys(opts).length === 0) curQ = `${curQ} ${text}`.trim();
        }
      }
    });
    flush(rows.length);
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
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const buf = await file.arrayBuffer();
  const { parsed, problems } = parseWorkbook(buf);

  const validated = parsed.filter((q) => {
    const optionText = { A: q.a, B: q.b, C: q.c, D: q.d }[q.correct as "A" | "B" | "C" | "D"];
    if (!optionText) {
      problems.push(`[${q.hint}] correct answer "${q.correct}" has no matching option — SKIPPED.`);
      return false;
    }
    return true;
  });

  const byCategory = new Map<string, ParsedQuestion[]>();
  for (const q of validated) byCategory.set(q.category, [...(byCategory.get(q.category) || []), q]);
  for (const [cat, qs] of byCategory) {
    if (qs.length < 2) problems.push(`Category "${cat}" has only ${qs.length} valid question(s) — needs at least 2.`);
  }

  const supabase = supabaseAdmin();

  // ---- Optional: wipe the existing question bank first ----------------
  let deletedCount = 0;
  if (replaceAll) {
    const { data: existingIds } = await supabase.from("questions").select("id");
    deletedCount = existingIds?.length ?? 0;
    if (deletedCount > 0) {
      const { error: deleteErr } = await supabase.from("questions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteErr) {
        return NextResponse.json({ error: `Could not clear existing questions: ${deleteErr.message}` }, { status: 500 });
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
