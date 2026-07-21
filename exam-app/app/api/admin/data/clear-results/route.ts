import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

/**
 * POST /api/admin/data/clear-results
 * body: { confirm: "CLEAR RESULTS" }
 * Permanently deletes EVERY exam attempt, including in-progress ones,
 * and (via cascade) every exam_attempt_questions / exam_answers row.
 * Also resets exam_access.attempts_used back to 0 for every trainee,
 * since their attempt history no longer exists. Requires the caller to
 * send the exact confirmation phrase — this is the most destructive
 * single action in the app.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const { confirm } = await req.json();
  if (confirm !== "CLEAR RESULTS") {
    return NextResponse.json({ error: 'Confirmation phrase did not match. Nothing was deleted.' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { count } = await supabase.from("exam_attempts").select("*", { count: "exact", head: true });

  const { error: deleteErr } = await supabase
    .from("exam_attempts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  await supabase.from("exam_access").update({ attempts_used: 0 }).neq("user_id", "00000000-0000-0000-0000-000000000000");

  await logAudit(guard.profile.id, "all_results_cleared", "exam_attempts", undefined, { deletedCount: count ?? 0 });

  return NextResponse.json({ ok: true, deletedCount: count ?? 0 });
}
