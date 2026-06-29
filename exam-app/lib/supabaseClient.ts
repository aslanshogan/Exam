import { createBrowserClient } from "@supabase/ssr";

// Public, browser-safe client (uses anon key, respects Row Level Security).
// Uses @supabase/ssr's createBrowserClient (not the plain supabase-js
// client) so the session is also stored in cookies, not just
// localStorage — that's what allows middleware.ts and Server Components
// to see "who is logged in" on every request.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey);
