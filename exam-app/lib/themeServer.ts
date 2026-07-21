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
 * For use in Server Components (pages). Reads the app-session cookie
 * set by username login (see lib/appSession.ts) and loads the profile
 * fresh from the database. Returns null for anonymous visitors or
 * blocked accounts.
 */
export async function getServerSideProfile() {
  const { cookies } = await import("next/headers");
  const { verifyAppSession, APP_SESSION_COOKIE } = await import("./appSession");

  const session = await verifyAppSession(cookies().get(APP_SESSION_COOKIE)?.value);
  if (!session) return null;

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, auth_user_id, email, display_name, username, full_name, role_id, is_active")
    .eq("id", session.profileId)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return profile;
}
