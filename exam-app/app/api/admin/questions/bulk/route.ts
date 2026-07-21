import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

/**
 * POST /api/admin/questions/bulk
 * body: { ids: string[], set: { always_include?: boolean, active?: boolean } }
 * ---------------------------------------------------------------------
 * Applies the same change to many questions at once, so you can select a
 * batch and mark them all "always include" (or active/inactive) without
 * editing each one. Only the fields present in `set` are changed.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const set = body.set || {};

  if (ids.length === 0) {
    return NextResponse.json({ error: "No questions selected." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof set.always_include === "boolean") update.always_include = set.always_include;
  if (typeof set.active === "boolean") update.active = set.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("questions").update(update).in("id", ids);
  if (error) {
    console.error("[questions/bulk] update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(guard.profile.id, "questions_bulk_updated", "questions", undefined, {
    count: ids.length,
    set: update,
  });

  return NextResponse.json({ ok: true, updated: ids.length });
}
