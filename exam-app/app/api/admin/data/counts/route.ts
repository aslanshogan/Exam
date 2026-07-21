import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const [{ count: totalQuestions }, { count: totalCategories }, { count: totalAttempts }, { count: completedAttempts }] =
    await Promise.all([
      supabase.from("questions").select("*", { count: "exact", head: true }),
      supabase.from("categories").select("*", { count: "exact", head: true }),
      supabase.from("exam_attempts").select("*", { count: "exact", head: true }),
      supabase.from("exam_attempts").select("*", { count: "exact", head: true }).eq("status", "completed"),
    ]);

  return NextResponse.json({
    totalQuestions: totalQuestions ?? 0,
    totalCategories: totalCategories ?? 0,
    totalAttempts: totalAttempts ?? 0,
    completedAttempts: completedAttempts ?? 0,
  });
}
