import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageThemes } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

const FIELDS = [
  "background_color",
  "accent_color",
  "card_color",
  "button_color",
  "text_color",
  "background_image_url",
  "background_video_url",
  "background_video_enabled",
  "background_video_muted",
  "background_video_loop",
  "music_url",
  "music_enabled",
  "music_autoplay",
  "music_loop",
  "music_volume",
];

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requirePermission(req, canManageThemes);
  if (guard.response) return guard.response;

  const body = await req.json();
  const update: Record<string, unknown> = { user_id: params.userId, updated_at: new Date().toISOString() };
  for (const f of FIELDS) {
    if (body[f] !== undefined) update[f] = body[f];
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("user_theme_settings")
    .upsert(update, { onConflict: "user_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "theme_changed", "profile", params.userId, body);
  return NextResponse.json({ theme: data });
}
