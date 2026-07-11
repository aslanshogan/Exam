import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/trainer/categories — category names for any logged-in user. */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data } = await supabase.from("categories").select("name").order("name");
  return NextResponse.json({ categories: (data || []).map((c) => c.name) });
}
