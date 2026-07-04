import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("category_rules")
    .select("category_id, questions_to_take, categories(id, name)");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data });
}

// Add a new category (+ default rule of 2 questions)
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const { name, questions_to_take } = await req.json();
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: category, error: catErr } = await supabase
    .from("categories")
    .insert({ name })
    .select("id")
    .single();
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

  const { error: ruleErr } = await supabase
    .from("category_rules")
    .insert({ category_id: category.id, questions_to_take: questions_to_take ?? 2 });
  if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 });

  await logAudit(guard.profile.id, "category_added", "category", category.id, { name });
  return NextResponse.json({ ok: true, categoryId: category.id });
}

// Update questions_to_take for a category
export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const { category_id, questions_to_take } = await req.json();
  if (!category_id || questions_to_take == null) {
    return NextResponse.json({ error: "category_id and questions_to_take are required." }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("category_rules")
    .update({ questions_to_take })
    .eq("category_id", category_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "category_rule_updated", "category", category_id, { questions_to_take });
  return NextResponse.json({ ok: true });
}

// Delete a category (cascades to its questions and rule)
export async function DELETE(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const categoryId = req.nextUrl.searchParams.get("category_id");
  if (!categoryId) return NextResponse.json({ error: "category_id is required." }, { status: 400 });
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "category_deleted", "category", categoryId);
  return NextResponse.json({ ok: true });
}
