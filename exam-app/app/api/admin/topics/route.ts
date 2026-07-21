import { NextRequest, NextResponse } from "next/server";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRAINER_TOPIC_GROUPS } from "@/lib/trainerTopics";
import { ensureCategoryByName } from "@/lib/ensureCategory";

/**
 * Admin management of the AI topic list.
 * GET    → all topics (incl. inactive), ordered.
 * POST   → add one { group_name, topic } (appended to the group).
 * PATCH  → three modes:
 *            { action:"update", id, group_name?, topic?, active? }
 *            { action:"reorder", order:[{id, group_name, sort_order}, ...] }
 *            { action:"seed" }  → populate from the built-in list if empty
 * DELETE → ?id=... removes one.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("trainer_topics")
    .select("id, group_name, topic, sort_order, active")
    .order("group_name", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data || [] });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;
  const body = await req.json().catch(() => ({}));
  const group_name = typeof body.group_name === "string" && body.group_name.trim() ? body.group_name.trim().slice(0, 80) : "General";
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : "";
  if (!topic) return NextResponse.json({ error: "Topic text is required." }, { status: 400 });

  const supabase = supabaseAdmin();
  // Append after the last item in the group.
  const { data: last } = await supabase
    .from("trainer_topics")
    .select("sort_order")
    .eq("group_name", group_name)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("trainer_topics")
    .insert({ group_name, topic, sort_order })
    .select("id, group_name, topic, sort_order, active")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep the question bank in sync: ensure a bank category with the same
  // name exists (created if missing) so questions can be saved under it.
  const cat = await ensureCategoryByName(topic);

  return NextResponse.json({ topic: data, categoryCreated: cat.created, categoryId: cat.id });
}

export async function PATCH(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;
  const body = await req.json().catch(() => ({}));
  const supabase = supabaseAdmin();

  if (body.action === "seed") {
    const { count } = await supabase.from("trainer_topics").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return NextResponse.json({ seeded: 0, message: "Topics already exist; not seeding." });
    const rows: any[] = [];
    TRAINER_TOPIC_GROUPS.forEach((g) => {
      g.topics.forEach((t, i) => rows.push({ group_name: g.group, topic: t, sort_order: i }));
    });
    const { error } = await supabase.from("trainer_topics").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Also ensure a bank category exists for each seeded topic.
    let categoriesCreated = 0;
    for (const r of rows) {
      const c = await ensureCategoryByName(r.topic);
      if (c.created) categoriesCreated++;
    }
    return NextResponse.json({ seeded: rows.length, categoriesCreated });
  }

  if (body.action === "reorder") {
    const order: any[] = Array.isArray(body.order) ? body.order : [];
    // Apply each row's new group + position.
    for (const o of order) {
      if (!o?.id) continue;
      await supabase
        .from("trainer_topics")
        .update({ group_name: String(o.group_name || "General").slice(0, 80), sort_order: Number(o.sort_order) || 0 })
        .eq("id", o.id);
    }
    return NextResponse.json({ ok: true, updated: order.length });
  }

  if (body.action === "update") {
    if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 });
    const patch: any = {};
    if (typeof body.group_name === "string") patch.group_name = body.group_name.trim().slice(0, 80) || "General";
    if (typeof body.topic === "string") patch.topic = body.topic.trim().slice(0, 120);
    if (typeof body.active === "boolean") patch.active = body.active;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    const { error } = await supabase.from("trainer_topics").update(patch).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("trainer_topics").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
