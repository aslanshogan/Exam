import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageThemes } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";
import { BUCKET_BY_KIND, validateMediaFile, MediaKind } from "@/lib/mediaValidation";

/**
 * POST /api/admin/media/upload
 * multipart/form-data: { file: File, kind: "logo"|"background-image"|"background-video"|"music"|"turbine-model" }
 * Only Super Admin (or someone explicitly granted the "manage_themes"
 * override) can upload. Validates extension + size before ever touching
 * Storage. Returns { url } — the public URL to store on a
 * user_theme_settings row (or /public/logo.png for the global logo).
 *
 * IMPORTANT: only upload files you have the rights to use. Do not
 * upload copyrighted music or video without permission — see SETUP.md.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageThemes);
  if (guard.response) return guard.response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const kind = formData.get("kind") as MediaKind | null;

  if (!file || !kind || !BUCKET_BY_KIND[kind]) {
    return NextResponse.json({ error: "file and a valid kind are required." }, { status: 400 });
  }

  const validationError = validateMediaFile(kind, file.name, file.size);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const bucket = BUCKET_BY_KIND[kind];
  const ext = file.name.split(".").pop();
  const path = `${guard.profile.id}/${Date.now()}.${ext}`;

  const supabase = supabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);

  await logAudit(guard.profile.id, "media_uploaded", "media", path, { kind, bucket, filename: file.name });

  return NextResponse.json({ url: publicUrlData.publicUrl });
}
