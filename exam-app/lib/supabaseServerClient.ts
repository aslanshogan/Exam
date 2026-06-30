import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Session-aware Supabase client for use in Server Components, Route
 * Handlers, and Server Actions. Reads/writes the Supabase Auth cookies
 * so `supabase.auth.getUser()` reflects whoever is actually logged in
 * on this request — unlike lib/supabaseAdmin.ts (service role, no
 * session) or lib/supabaseClient.ts (browser only).
 */
export function supabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component (not a Route Handler) — safe to
            // ignore, middleware.ts is responsible for refreshing the session.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // see note above
          }
        },
      },
    }
  );
}
