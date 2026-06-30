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
export type ProfileLookupResult =
  | { status: "ok"; profile: CurrentProfile }
  | { status: "no_session" }
  | { status: "no_profile_row"; authEmail: string | null }
  | { status: "inactive"; profile: CurrentProfile };

/**
 * getCurrentProfile — convenience wrapper that collapses
 * getCurrentProfileDetailed() down to just the profile (or null), for
 * call sites that don't need to distinguish WHY it failed.
 */
export async function getCurrentProfile(req: NextRequest): Promise<CurrentProfile | null> {
  const result = await getCurrentProfileDetailed(req);
  return result.status === "ok" || result.status === "inactive" ? result.profile : null;
}

/**
 * getCurrentProfileDetailed
 * ---------------------------------------------------------------------
 * Same lookup as getCurrentProfile, but reports WHY it failed instead
 * of collapsing everything to null. "Not authenticated" alone isn't
 * actionable — this lets API routes return a specific, useful error:
 *   - "no_session": no Supabase Auth session AND no access-code cookie
 *     were found at all. Usually means: not logged in, the session
 *     cookie expired, or (if this keeps happening right after a
 *     successful login) a cookie-domain/env-var mismatch between where
 *     the person logged in and where this request landed.
 *   - "no_profile_row": a real Supabase Auth session WAS found, but no
 *     row in `profiles` has a matching auth_user_id. This is the #1
 *     cause of "Not authenticated" right after setup — almost always
 *     means the "bootstrap your first Super Admin" SQL (SETUP.md
 *     section 2) was never run, or was run for a different email than
 *     the one actually used to create the Supabase Auth user.
 *   - "inactive": a profile row exists but is_active = false.
 */
export async function getCurrentProfileDetailed(req: NextRequest): Promise<ProfileLookupResult> {
  const supabase = supabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (authData?.user) {
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, auth_user_id, email, display_name, role_id, is_active")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (!profile) return { status: "no_profile_row", authEmail: authData.user.email ?? null };
    if (!profile.is_active) return { status: "inactive", profile: profile as CurrentProfile };
    return { status: "ok", profile: profile as CurrentProfile };
  }

  // Fall back to access-code cookie session (trainees only)
  const codeCookie = req.cookies.get(CODE_SESSION_COOKIE)?.value;
  const profileId = await verifyCodeSession(codeCookie);
  if (profileId) {
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, auth_user_id, email, display_name, role_id, is_active")
      .eq("id", profileId)
      .maybeSingle();
    if (profile) {
      const p = { ...profile, role_id: "trainee" as const };
      return p.is_active ? { status: "ok", profile: p } : { status: "inactive", profile: p };
    }
  }

  return { status: "no_session" };
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
  const result = await getCurrentProfileDetailed(req);

  if (result.status === "no_session") {
    return {
      profile: null,
      response: NextResponse.json(
        { error: "No login session found. Try logging out and back in at /login — if this keeps happening right after logging in, your session cookie likely isn't reaching the server (check that you're using the live site's own URL, not a preview/different domain)." },
        { status: 401 }
      ),
    };
  }
  if (result.status === "no_profile_row") {
    return {
      profile: null,
      response: NextResponse.json(
        {
          error: `You're logged in as ${result.authEmail ?? "this account"}, but no matching row exists in the profiles table. This almost always means the "bootstrap your first Super Admin" SQL (SETUP.md section 2) was never run, or was run for a different email. Run in Supabase SQL Editor: select * from profiles where email = '${result.authEmail ?? "YOUR-EMAIL"}'; — if it returns nothing, re-run the bootstrap insert statements with this exact email.`,
        },
        { status: 401 }
      ),
    };
  }
  if (result.status === "inactive") {
    return { profile: null, response: NextResponse.json({ error: "Account is inactive." }, { status: 403 }) };
  }

  const allowed = await check(result.profile);
  if (!allowed) {
    return {
      profile: null,
      response: NextResponse.json(
        { error: `Your account (role: ${result.profile.role_id}) doesn't have permission for this action.` },
        { status: 403 }
      ),
    };
  }
  return { profile: result.profile, response: null };
}
