import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

export async function DELETE(req: NextRequest, { params }: { params: { templateId: string } }) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  // Any trainee currently assigned this template falls back to normal
  // random generation automatically (assigned_template_id -> SET NULL
  // via the FK), they are not left broken.
  const { error } = await supabase.from("exam_templates").delete().eq("id", params.templateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "exam_template_deleted", "exam_template", params.templateId);
  return NextResponse.json({ ok: true });
}
