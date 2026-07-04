import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "./supabaseAdmin";
import { verifyAppSession, APP_SESSION_COOKIE } from "./appSession";

export type RoleId = "super_admin" | "question_manager" | "exam_reviewer" | "trainee";

export type CurrentProfile = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  display_name: string;
  username?: string | null;
  full_name?: string | null;
  role_id: RoleId;
  is_active: boolean;
};

/**
 * Resolves the current caller's profile from the signed app-session
 * cookie set by username login (/api/auth/login — see lib/appSession.ts).
 * The cookie carries the profile id; the profile itself (role,
 * is_active, names) is ALWAYS re-loaded fresh from the database here,
 * so blocking a user or changing their role takes effect on their very
 * next request — the cookie is only proof of who they logged in as,
 * never a cache of their permissions.
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
 * of collapsing everything to null:
 *   - "no_session": no valid app-session cookie. Not logged in, the
 *     cookie expired (8h), or the signature didn't verify (e.g.
 *     APP_SESSION_SECRET changed since they logged in).
 *   - "no_profile_row": the cookie is valid but its profile id no
 *     longer exists in `profiles` — the account was deleted after they
 *     logged in.
 *   - "inactive": a profile row exists but is_active = false (the
 *     account was blocked). Enforced here on EVERY request, so a block
 *     takes effect immediately regardless of the cookie's validity.
 */
export async function getCurrentProfileDetailed(req: NextRequest): Promise<ProfileLookupResult> {
  const session = await verifyAppSession(req.cookies.get(APP_SESSION_COOKIE)?.value);
  if (!session) return { status: "no_session" };

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, auth_user_id, email, display_name, username, full_name, role_id, is_active")
    .eq("id", session.profileId)
    .maybeSingle();

  if (!profile) return { status: "no_profile_row", authEmail: null };
  if (!profile.is_active) return { status: "inactive", profile: profile as CurrentProfile };
  return { status: "ok", profile: profile as CurrentProfile };
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
        { error: "No login session found. Please log in at /login with your username. Sessions last 8 hours — if yours expired, just log in again." },
        { status: 401 }
      ),
    };
  }
  if (result.status === "no_profile_row") {
    return {
      profile: null,
      response: NextResponse.json(
        { error: "Your account no longer exists — it may have been deleted. Contact your administrator." },
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
