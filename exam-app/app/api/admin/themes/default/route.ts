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

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, canManageThemes);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data } = await supabase.from("user_theme_settings").select("*").is("user_id", null).maybeSingle();
  return NextResponse.json({ theme: data });
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, canManageThemes);
  if (guard.response) return guard.response;

  const body = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) {
    if (body[f] !== undefined) update[f] = body[f];
  }

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("user_theme_settings").select("id").is("user_id", null).maybeSingle();

  let result;
  if (existing) {
    result = await supabase.from("user_theme_settings").update(update).eq("id", existing.id).select().single();
  } else {
    result = await supabase.from("user_theme_settings").insert({ user_id: null, ...update }).select().single();
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  await logAudit(guard.profile.id, "theme_changed", "global_default", undefined, body);
  return NextResponse.json({ theme: result.data });
}
