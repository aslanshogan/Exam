import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRAINER_TOPIC_GROUPS } from "@/lib/trainerTopics";

/**
 * GET /api/trainer/topics
 * Returns active topics grouped for the dropdowns:
 *   [{ group: "Hydro & Turbines", topics: ["Francis Turbine", ...] }, ...]
 * Falls back to the built-in list if the table is empty or missing, so
 * the dropdowns always have content.
 */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("trainer_topics")
      .select("group_name, topic, sort_order, active")
      .eq("active", true)
      .order("group_name", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return NextResponse.json({ groups: TRAINER_TOPIC_GROUPS, source: "builtin" });
    }

    // Group in first-seen order, preserving sort within each group.
    const map = new Map<string, string[]>();
    for (const r of data) {
      if (!map.has(r.group_name)) map.set(r.group_name, []);
      map.get(r.group_name)!.push(r.topic);
    }
    const groups = Array.from(map.entries()).map(([group, topics]) => ({ group, topics }));
    return NextResponse.json({ groups, source: "db" });
  } catch {
    return NextResponse.json({ groups: TRAINER_TOPIC_GROUPS, source: "builtin" });
  }
}
