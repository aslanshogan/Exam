import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canReviewResults } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, canReviewResults);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  let query = supabase
    .from("exam_attempts")
    .select("id, trainee_name, started_at, ended_at, score_percent, correct_count, wrong_count, pass_fail")
    .eq("status", "completed")
    .order("started_at", { ascending: false });

  const name = req.nextUrl.searchParams.get("name");
  const pass = req.nextUrl.searchParams.get("pass");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (name) query = query.ilike("trainee_name", `%${name}%`);
  if (pass) query = query.eq("pass_fail", pass.toUpperCase());
  if (from) query = query.gte("started_at", from);
  if (to) query = query.lte("started_at", to);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = ["Exam ID", "Trainee Name", "Date", "Start Time", "End Time", "Score %", "Correct", "Wrong", "Pass/Fail"];
  const lines = [header.join(",")];
  for (const r of rows || []) {
    const started = new Date(r.started_at);
    const ended = r.ended_at ? new Date(r.ended_at) : null;
    lines.push(
      [
        r.id,
        `"${r.trainee_name}"`,
        started.toISOString().slice(0, 10),
        started.toISOString().slice(11, 19),
        ended ? ended.toISOString().slice(11, 19) : "",
        r.score_percent != null ? (r.score_percent * 100).toFixed(1) : "",
        r.correct_count ?? "",
        r.wrong_count ?? "",
        r.pass_fail ?? "",
      ].join(",")
    );
  }

  await logAudit(guard.profile.id, "results_exported", "export", undefined, { rowCount: rows?.length ?? 0 });

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="exam_results.csv"`,
    },
  });
}
