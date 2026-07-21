import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Ensure a bank category with the given name exists. Returns its id.
 * - If a category with that name already exists, returns the existing id
 *   (case-insensitive match) — never creates a duplicate.
 * - Otherwise creates the category AND its default category_rule (so it
 *   behaves like categories made in Admin → Categories).
 * Used so that adding an AI topic can auto-create the matching bank
 * category, keeping the topic list and the question bank in sync.
 */
export async function ensureCategoryByName(name: string): Promise<{ id: string | null; created: boolean; error?: string }> {
  const clean = (name || "").trim();
  if (!clean) return { id: null, created: false, error: "empty name" };

  const supabase = supabaseAdmin();

  // Existing? (case-insensitive)
  const { data: existing } = await supabase
    .from("categories")
    .select("id, name")
    .ilike("name", clean)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { id: existing.id, created: false };

  // Create category
  const { data: cat, error: catErr } = await supabase
    .from("categories")
    .insert({ name: clean })
    .select("id")
    .single();
  if (catErr || !cat) return { id: null, created: false, error: catErr?.message || "insert failed" };

  // Default rule (mirrors the manual category-create flow)
  await supabase.from("category_rules").insert({ category_id: cat.id, questions_to_take: 2 });

  return { id: cat.id, created: true };
}
