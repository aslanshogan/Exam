import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  let query = supabase.from("questions").select("*, categories(name)").order("created_at", { ascending: false });

  const filter = req.nextUrl.searchParams.get("filter"); // all | always_include | inactive
  const categoryId = req.nextUrl.searchParams.get("category_id");

  if (filter === "always_include") query = query.eq("always_include", true);
  if (filter === "inactive") query = query.eq("active", false);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const body = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("questions")
    .insert({
      category_id: body.category_id,
      question_text: body.question_text,
      answer_a: body.answer_a,
      answer_b: body.answer_b,
      answer_c: body.answer_c,
      answer_d: body.answer_d,
      correct_answer: body.correct_answer,
      explanation: body.explanation || null,
      active: body.active ?? true,
      always_include: body.always_include ?? false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "question_added", "question", data.id, { question_text: body.question_text });
  return NextResponse.json({ question: data });
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("questions")
    .update({
      category_id: body.category_id,
      question_text: body.question_text,
      answer_a: body.answer_a,
      answer_b: body.answer_b,
      answer_c: body.answer_c,
      answer_d: body.answer_d,
      correct_answer: body.correct_answer,
      explanation: body.explanation || null,
      active: body.active,
      always_include: body.always_include ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "question_edited", "question", body.id);
  return NextResponse.json({ question: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "question_deleted", "question", id);
  return NextResponse.json({ ok: true });
}
