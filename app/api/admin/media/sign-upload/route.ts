import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageThemes } from "@/lib/auth";
import { BUCKET_BY_KIND, validateMediaFile, MediaKind } from "@/lib/mediaValidation";

/**
 * POST /api/admin/media/sign-upload
 * body: { kind, filename, size }
 * ---------------------------------------------------------------------
 * Returns a short-lived SIGNED UPLOAD URL for Supabase Storage so the
 * browser can upload the file DIRECTLY to Storage, bypassing the Vercel
 * serverless function (which caps request bodies at ~4.5 MB and rejects
 * larger files with FUNCTION_PAYLOAD_TOO_LARGE). Only a tiny JSON
 * request passes through Vercel here — never the file bytes — so large
 * videos/images work. We still validate extension + size limits first.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageThemes);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as MediaKind | undefined;
  const filename = typeof body.filename === "string" ? body.filename : "";
  const size = typeof body.size === "number" ? body.size : 0;

  if (!kind || !BUCKET_BY_KIND[kind] || !filename) {
    return NextResponse.json({ error: "kind and filename are required." }, { status: 400 });
  }

  const validationError = validateMediaFile(kind, filename, size);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const bucket = BUCKET_BY_KIND[kind];
  const ext = filename.split(".").pop();
  const path = `${guard.profile.id}/${Date.now()}.${ext}`;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error) {
    console.error("[sign-upload] could not create signed url:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);

  return NextResponse.json({
    bucket,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: publicUrlData.publicUrl,
  });
}
