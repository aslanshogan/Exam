import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, async (p) => p.role_id === "super_admin");
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, target_type, target_id, metadata, created_at, profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data });
}
