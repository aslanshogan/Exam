import { supabaseAdmin } from "./supabaseAdmin";

export async function logAudit(
  actorProfileId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) {
  const admin = supabaseAdmin();
  const { error } = await admin.from("audit_logs").insert({
    actor_user_id: actorProfileId,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    metadata: metadata ?? null,
  });
  // Audit logging should never break the calling request — log and move on.
  if (error) console.error("Audit log insert failed:", error.message);
}
