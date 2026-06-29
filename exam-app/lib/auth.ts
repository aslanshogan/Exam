import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "./supabaseServerClient";
import { supabaseAdmin } from "./supabaseAdmin";
import { verifyCodeSession, CODE_SESSION_COOKIE } from "./codeSession";

export type RoleId = "super_admin" | "question_manager" | "exam_reviewer" | "trainee";

export type CurrentProfile = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  display_name: string;
  role_id: RoleId;
  is_active: boolean;
};

/**
 * Resolves the current caller's profile from EITHER a real Supabase Auth
 * session (admins, and trainees who have email+password accounts) OR a
 * signed access-code cookie (trainees who logged in with a code — see
 * lib/codeSession.ts). Code-session users are always treated as role
 * 'trainee' regardless of what's in the database, as a safety backstop.
 */
export async function getCurrentProfile(req: NextRequest): Promise<CurrentProfile | null> {
  // 1. Try a real Supabase Auth session first
  const supabase = supabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (authData?.user) {
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, auth_user_id, email, display_name, role_id, is_active")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (profile) return profile as CurrentProfile;
    return null;
  }

  // 2. Fall back to access-code cookie session (trainees only)
  const codeCookie = req.cookies.get(CODE_SESSION_COOKIE)?.value;
  const profileId = await verifyCodeSession(codeCookie);
  if (profileId) {
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, auth_user_id, email, display_name, role_id, is_active")
      .eq("id", profileId)
      .maybeSingle();
    if (profile) return { ...profile, role_id: "trainee" } as CurrentProfile;
  }

  return null;
}

/**
 * Permission helpers mirroring the SQL functions in supabase/schema.sql
 * (can_manage_users / can_manage_questions / can_review_results /
 * can_manage_themes). Re-implemented in application code because all
 * writes go through the service-role key, which bypasses RLS — these
 * checks are the real enforcement layer for that key.
 */
async function hasOverride(profileId: string, permissionKey: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("user_permissions")
    .select("allowed")
    .eq("user_id", profileId)
    .eq("permission_key", permissionKey)
    .maybeSingle();
  return !!data?.allowed;
}

export async function canManageUsers(p: CurrentProfile): Promise<boolean> {
  if (p.role_id === "super_admin") return true;
  return hasOverride(p.id, "manage_users");
}
export async function canManageQuestions(p: CurrentProfile): Promise<boolean> {
  if (p.role_id === "super_admin" || p.role_id === "question_manager") return true;
  return hasOverride(p.id, "manage_questions");
}
export async function canReviewResults(p: CurrentProfile): Promise<boolean> {
  if (p.role_id === "super_admin" || p.role_id === "exam_reviewer") return true;
  return hasOverride(p.id, "manage_results");
}
export async function canManageThemes(p: CurrentProfile): Promise<boolean> {
  if (p.role_id === "super_admin") return true;
  return hasOverride(p.id, "manage_themes");
}

/**
 * requirePermission — call at the top of an API route handler.
 *   const guard = await requirePermission(req, canManageUsers);
 *   if (guard.response) return guard.response;
 *   const { profile } = guard;
 */
export async function requirePermission(
  req: NextRequest,
  check: (p: CurrentProfile) => Promise<boolean>
): Promise<{ profile: CurrentProfile; response: null } | { profile: null; response: NextResponse }> {
  const profile = await getCurrentProfile(req);
  if (!profile) {
    return { profile: null, response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  if (!profile.is_active) {
    return { profile: null, response: NextResponse.json({ error: "Account is inactive." }, { status: 403 }) };
  }
  const allowed = await check(profile);
  if (!allowed) {
    return { profile: null, response: NextResponse.json({ error: "Not authorized." }, { status: 403 }) };
  }
  return { profile, response: null };
}
