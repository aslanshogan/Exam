import ThemeProvider from "@/components/ThemeProvider";
import LoginFormWrapper from "@/components/LoginForm";
import { getThemeForUser } from "@/lib/themeServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * /login uses the GLOBAL DEFAULT theme (same one shown on the Home page
 * before anyone is logged in) — we don't know who's signing in yet, so
 * a personal per-user theme isn't possible here. This intentionally
 * matches the pre-login Home page experience for visual consistency.
 *
 * Admin pages, by contrast, deliberately do NOT use per-user theming —
 * see the note in SETUP.md section 6 ("Personalization") for why.
 */
export default async function LoginPage() {
  const theme = await getThemeForUser(null);
  const admin = supabaseAdmin();
  const { data: settings } = await admin.from("app_settings").select("music_globally_enabled").eq("id", 1).single();

  return (
    <ThemeProvider initialTheme={theme} musicGloballyEnabled={settings?.music_globally_enabled ?? true}>
      <LoginFormWrapper />
    </ThemeProvider>
  );
}
