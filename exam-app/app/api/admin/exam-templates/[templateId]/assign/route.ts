import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

/**
 * POST /api/admin/exam-templates/[templateId]/assign
 * body: { userIds: string[], action: "assign" | "unassign" }
 * Sets (or clears) exam_access.assigned_template_id for each given
 * trainee. Does NOT touch attempts_used or allowed_to_take — this only
 * controls WHICH questions they'll get next time they start an exam,
 * not whether they're allowed to.
 */
export async function POST(req: NextRequest, { params }: { params: { templateId: string } }) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const { userIds, action } = await req.json();
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "userIds (a non-empty array) is required." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const newValue = action === "unassign" ? null : params.templateId;

  const { error } = await supabase
    .from("exam_access")
    .update({ assigned_template_id: newValue, updated_at: new Date().toISOString() })
    .in("user_id", userIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, action === "unassign" ? "exam_template_unassigned" : "exam_template_assigned", "exam_template", params.templateId, {
    userIds,
  });

  return NextResponse.json({ ok: true, count: userIds.length });
}
