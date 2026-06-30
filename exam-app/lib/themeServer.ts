import { supabaseAdmin } from "./supabaseAdmin";
import { ThemeSettings, FALLBACK_THEME } from "./themeTypes";

/**
 * getThemeForUser
 * ---------------------------------------------------------------------
 * Returns the personal theme for `profileId`, falling back to the
 * global default theme row (user_id IS NULL), falling back further to
 * FALLBACK_THEME if even that row is missing. Used by every protected
 * page (Home, Exam, Result, Admin) to feed <ThemeProvider>.
 */
export async function getThemeForUser(profileId: string | null): Promise<ThemeSettings> {
  const admin = supabaseAdmin();

  if (profileId) {
    const { data } = await admin
      .from("user_theme_settings")
      .select(
        "user_id, background_color, accent_color, card_color, button_color, text_color, background_image_url, background_video_url, background_video_enabled, background_video_muted, background_video_loop, music_url, music_enabled, music_autoplay, music_loop, music_volume"
      )
      .eq("user_id", profileId)
      .maybeSingle();
    if (data) return data as ThemeSettings;
  }

  const { data: defaultTheme } = await admin
    .from("user_theme_settings")
    .select(
      "user_id, background_color, accent_color, card_color, button_color, text_color, background_image_url, background_video_url, background_video_enabled, background_video_muted, background_video_loop, music_url, music_enabled, music_autoplay, music_loop, music_volume"
    )
    .is("user_id", null)
    .maybeSingle();

  return (defaultTheme as ThemeSettings) ?? FALLBACK_THEME;
}

/**
 * getServerSideProfile
 * ---------------------------------------------------------------------
 * For use in Server Components (pages). Reads the Supabase Auth session
 * cookie (no access-code fallback here — Server Components can't easily
 * branch on a custom cookie + redirect the same way middleware can; the
 * access-code path is fully handled by middleware.ts redirecting into a
 * real flow before the page renders).
 */
export async function getServerSideProfile() {
  const { supabaseServerClient } = await import("./supabaseServerClient");
  const supabase = supabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const admin = supabaseAdmin();

  if (authData?.user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, auth_user_id, email, display_name, role_id, is_active")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    return profile ?? null;
  }

  // Fall back to access-code session (trainees only — see lib/codeSession.ts)
  const { cookies } = await import("next/headers");
  const { verifyCodeSession, CODE_SESSION_COOKIE } = await import("./codeSession");
  const codeCookie = cookies().get(CODE_SESSION_COOKIE)?.value;
  const profileId = await verifyCodeSession(codeCookie);
  if (!profileId) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, auth_user_id, email, display_name, role_id, is_active")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;
  return { ...profile, role_id: "trainee" as const };
}
