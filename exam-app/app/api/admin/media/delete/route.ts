import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageThemes } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";
import { parseStorageUrl } from "@/lib/mediaValidation";

/**
 * POST /api/admin/media/delete
 * body: { url: string }
 * Deletes the actual file from Supabase Storage that a theme field's
 * URL points to. Silently does nothing (still returns ok) if the URL
 * isn't recognized as one of our own storage buckets (e.g. it was a
 * hand-typed external URL rather than an uploaded file) — there's
 * nothing of ours to delete in that case, which is not an error.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageThemes);
  if (guard.response) return guard.response;

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "url is required." }, { status: 400 });

  const parsed = parseStorageUrl(url);
  if (!parsed) {
    // Not one of our uploaded files (e.g. an external URL was typed in
    // manually) — nothing to delete, but not an error condition.
    return NextResponse.json({ ok: true, deleted: false });
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(guard.profile.id, "media_deleted", "media", parsed.path, { bucket: parsed.bucket });
  return NextResponse.json({ ok: true, deleted: true });
}
