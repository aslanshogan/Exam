import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/auth/needs-setup → { needsSetup: boolean }
 *  True only while no active Super Admin with a username exists —
 *  i.e. the first-run window (see /api/auth/first-admin). */
export async function GET() {
  const supabase = supabaseAdmin();
  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .eq("is_active", true)
    .not("username", "is", null);
  return NextResponse.json({ needsSetup: (count ?? 0) === 0 });
}
