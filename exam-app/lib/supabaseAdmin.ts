import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY client using the service role key. Never import this in a
// "use client" component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
// Used by API routes for admin actions (import, question management, exam
// scoring) that need to bypass Row Level Security safely on the server.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
