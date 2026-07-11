import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/auth/needs-setup → { needsSetup: boolean, error?: string }
 * ---------------------------------------------------------------------
 * True ONLY while no active Super Admin with a username exists — the
 * first-run window (see /api/auth/first-admin).
 *
 * CRITICAL SAFETY RULE: if the database query errors (or returns a
 * null count), we must NOT report needsSetup:true. Doing so would show
 * the First-Time Setup screen on a live system that already has an
 * admin — trapping the real admin out of the normal login form. On any
 * uncertainty we fail CLOSED (needsSetup:false) and surface an error.
 */
export async function GET() {
  const supabase = supabaseAdmin();
  const { count, error } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .eq("is_active", true)
    .not("username", "is", null);

  if (error) {
    console.error("[needs-setup] Supabase error while counting super admins:", error);
    return NextResponse.json({ needsSetup: false, error: "Could not check setup state" }, { status: 200 });
  }

  if (count === null || count === undefined) {
    console.error("[needs-setup] Supabase returned null count with no error — treating as setup-complete for safety.");
    return NextResponse.json({ needsSetup: false, error: "Could not check setup state" }, { status: 200 });
  }

  return NextResponse.json({ needsSetup: count === 0 });
}
