/**
 * scripts/importExcel.ts
 * ---------------------------------------------------------------------
 * Reads the original Excel question bank and imports it into Supabase:
 *   categories, questions, category_rules.
 *
 * USAGE:
 *   1. Put your source file at:  ./data/source-questions.xlsx
 *      (any name is fine — change SOURCE_FILE below)
 *   2. Set env vars (see .env.local.example):
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *        SUPABASE_SERVICE_ROLE_KEY=...
 *   3. Run:  npm run import:excel
 *      Or to wipe the existing question bank first:
 *           npm run import:excel -- --replace
 *
 * SAFETY: by default this only ever ADDS questions, and skips anything
 * that looks like a duplicate of a question already in the same
 * category (or a duplicate within the file itself) — it normalizes
 * whitespace/case and compares question text. Pass --replace to delete
 * every existing question first (categories and category_rules are
 * left alone) — you'll be asked to confirm before anything is deleted.
 *
 * The script is intentionally tolerant of messy formatting (mixed
 * English/Hebrew, "Answer:" vs "Correct answer:" vs "תשובה", options
 * written as "A)" or "A." etc.) because the source file used several
 * different layouts per category tab. Every row it could NOT confidently
 * parse is reported at the end instead of silently imported wrong.
 * ---------------------------------------------------------------------
 */
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const SOURCE_FILE = path.join(process.cwd(), "data", "source-questions.xlsx");
const REPLACE_MODE = process.argv.includes("--replace");

function normalizeQuestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase() === "YES");
    });
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type ParsedQuestion = {
  category: string;
  question: string;
  a: string;
  b: string;
  c: string;
  d: string;
  correct: string; // "A" | "B" | "C" | "D" | ""
  explanation: string;
  sourceRowHint: string;
};

const BIDI_MARKS_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
function cleanCell(v: string): string {
  return v.replace(BIDI_MARKS_RE, "").trim();
}

const OPT_RE = /^\s*([A-Da-dא-ד])\s*[).．。]\s*(.+)$/;
const ANS_INLINE_RE = /(?:correct\s*answer|correct|answer|תשובה\s*נכונה|תשובה)\s*[:\-]?\s*([A-Da-dא-ד])\b/i;
const BARE_LETTER_RE = /^([A-Da-dא-ד])$/;
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

type WorkingQ = {
  category: string;
  q: string;
  opts: Record<string, string>;
  correct: string;
  expl: string;
  row: number;
};

/**
 * Handles the several different per-sheet layouts in the real source
 * workbook (English "Answer: B" / "Correct: B", Hebrew bare-letter
 * answer key in column 1, Hebrew "תשובה: ב" inline). Tests every cell
 * in a row for each signal rather than assuming fixed columns. Kept in
 * sync with the identical parser in app/api/admin/import/route.ts.
 */
function parseWorkbook(filePath: string): { parsed: ParsedQuestion[]; problems: string[] } {
  const wb = XLSX.readFile(filePath);
  const parsed: ParsedQuestion[] = [];
  const problems: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any;
    const rows = raw.map((r) => {
      const src = r || [];
      return Array.from({ length: src.length }, (_, i) => cleanCell((src[i] ?? "").toString()));
    });

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
          sourceRowHint: `${sheetName}!row${cur.row}`,
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

async function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    console.error(`Source file not found at ${SOURCE_FILE}. Put your .xlsx there first.`);
    process.exit(1);
  }

  const { parsed, problems } = parseWorkbook(SOURCE_FILE);

  // Validate correct answers actually match an option letter that has text
  const validated: ParsedQuestion[] = [];
  for (const q of parsed) {
    const optionText = { A: q.a, B: q.b, C: q.c, D: q.d }[q.correct as "A" | "B" | "C" | "D"];
    if (!optionText || optionText === "(not provided)") {
      problems.push(
        `[${q.sourceRowHint}] correct answer "${q.correct}" has no matching option text — SKIPPED. Question: "${q.question.slice(0, 60)}..."`
      );
      continue;
    }
    validated.push(q);
  }

  // Group by category, report categories with < 2 questions
  const byCategory = new Map<string, ParsedQuestion[]>();
  for (const q of validated) {
    byCategory.set(q.category, [...(byCategory.get(q.category) || []), q]);
  }
  for (const [cat, qs] of byCategory) {
    if (qs.length < 2) {
      problems.push(`Category "${cat}" has only ${qs.length} valid question(s) — needs at least 2.`);
    }
  }

  console.log(`Parsed ${validated.length} valid questions across ${byCategory.size} categories.`);
  console.log(`${problems.length} problem(s) found (see import-report.json for full detail).`);

  // ---- Optional: wipe the existing question bank first -----------------
  let deletedCount = 0;
  if (REPLACE_MODE) {
    const { count } = await supabase.from("questions").select("*", { count: "exact", head: true });
    deletedCount = count ?? 0;
    console.log(`\n--replace was passed: this will permanently DELETE all ${deletedCount} existing question(s).`);
    const ok = await confirm('Type "YES" (all caps) to confirm, anything else cancels: ');
    if (!ok) {
      console.log("Cancelled. No changes were made.");
      process.exit(0);
    }
    if (deletedCount > 0) {
      const { error: deleteErr } = await supabase.from("questions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteErr) {
        console.error(`Failed to delete existing questions: ${deleteErr.message}`);
        process.exit(1);
      }
      console.log(`Deleted ${deletedCount} existing question(s).`);
    }
  }

  // ---- Write categories ----
  const categoryIdByName = new Map<string, string>();
  for (const catName of byCategory.keys()) {
    const { data: existing } = await supabase.from("categories").select("id").eq("name", catName).maybeSingle();
    if (existing) {
      categoryIdByName.set(catName, existing.id);
      continue;
    }
    const { data: inserted, error } = await supabase
      .from("categories")
      .insert({ name: catName })
      .select("id")
      .single();
    if (error) {
      problems.push(`Failed to insert category "${catName}": ${error.message}`);
      continue;
    }
    categoryIdByName.set(catName, inserted.id);
  }

  // ---- Write category_rules (default 2 each, only if not already set) ----
  for (const [catName, catId] of categoryIdByName) {
    const { data: existingRule } = await supabase
      .from("category_rules")
      .select("category_id")
      .eq("category_id", catId)
      .maybeSingle();
    if (!existingRule) {
      await supabase.from("category_rules").insert({ category_id: catId, questions_to_take: 2 });
    }
  }

  // ---- Duplicate detection (skipped seeding from DB right after a
  //      --replace, since the table is now empty) ------------------------
  const seenByCategory = new Map<string, Set<string>>();
  for (const [catName, catId] of categoryIdByName) {
    const seen = new Set<string>();
    if (!REPLACE_MODE) {
      const { data: existingQs } = await supabase.from("questions").select("question_text").eq("category_id", catId);
      for (const eq of existingQs || []) seen.add(normalizeQuestionText(eq.question_text));
    }
    seenByCategory.set(catName, seen);
  }

  // ---- Write questions ----
  let imported = 0;
  let duplicatesSkipped = 0;
  for (const q of validated) {
    const categoryId = categoryIdByName.get(q.category);
    if (!categoryId) continue;

    const seen = seenByCategory.get(q.category)!;
    const normalized = normalizeQuestionText(q.question);
    if (seen.has(normalized)) {
      duplicatesSkipped++;
      problems.push(`[${q.sourceRowHint}] looks like a duplicate of an existing question in "${q.category}" — SKIPPED.`);
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
    if (error) {
      problems.push(`Failed to insert question [${q.sourceRowHint}]: ${error.message}`);
    } else {
      imported++;
    }
  }

  console.log(`Imported ${imported} questions into Supabase. Skipped ${duplicatesSkipped} likely duplicate(s).`);

  fs.writeFileSync(
    path.join(process.cwd(), "import-report.json"),
    JSON.stringify(
      {
        totalParsed: parsed.length,
        totalValid: validated.length,
        totalImported: imported,
        duplicatesSkipped,
        replacedExisting: REPLACE_MODE,
        deletedCount,
        categoriesFound: Array.from(byCategory.keys()),
        problems,
      },
      null,
      2
    )
  );
  console.log("Full report written to import-report.json — review it, fix your source file, and re-run if needed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
