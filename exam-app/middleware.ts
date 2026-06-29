import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { verifyCodeSession, CODE_SESSION_COOKIE } from "./lib/codeSession";

/**
 * middleware
 * ---------------------------------------------------------------------
 * Two parallel session types are accepted:
 *  1. A real Supabase Auth session (admins, and any trainee with an
 *     email+password account) — refreshed here so it never expires
 *     mid-exam.
 *  2. A signed access-code cookie (trainees who entered an access code
 *     instead of logging in — see lib/codeSession.ts). This ONLY grants
 *     access to /exam and /result, never /admin.
 *
 * Role-based gating for /admin/* sub-areas happens here using
 * profiles.role_id looked up via the user's own session (RLS policy
 * "profiles_self_read" allows reading your own row with the anon key).
 * Fine-grained permission OVERRIDES (user_permissions table) are NOT
 * checked here — only in the API routes / pages themselves (see
 * lib/auth.ts) — because that requires a service-role lookup we'd
 * rather not do on every single request for performance reasons.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: authData } = await supabase.auth.getUser();
  const hasRealSession = !!authData?.user;

  const codeProfileId = await verifyCodeSession(req.cookies.get(CODE_SESSION_COOKIE)?.value);
  const hasCodeSession = !!codeProfileId;

  // ---- /exam and /result: need EITHER session type ----------------
  if (pathname.startsWith("/exam") || pathname.startsWith("/result")) {
    if (!hasRealSession && !hasCodeSession) {
      return redirectToLogin(req, pathname);
    }
    return res;
  }

  // ---- /admin/*: needs a REAL session with an admin-capable role ---
  if (pathname.startsWith("/admin")) {
    if (!hasRealSession) return redirectToLogin(req, pathname);

    // Look up role using the user's own session (RLS self-read policy)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role_id, is_active")
      .eq("auth_user_id", authData!.user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return redirectToLogin(req, pathname, "inactive");
    }
    if (profile.role_id === "trainee") {
      return redirectToLogin(req, pathname, "forbidden");
    }

    if (
      pathname.startsWith("/admin/users") ||
      pathname.startsWith("/admin/themes") ||
      pathname.startsWith("/admin/audit") ||
      pathname.startsWith("/admin/exam-settings") ||
      pathname.startsWith("/admin/data")
    ) {
      if (profile.role_id !== "super_admin") {
        return NextResponse.redirect(new URL("/admin?error=forbidden", req.url));
      }
    }
    if (
      pathname.startsWith("/admin/questions") ||
      pathname.startsWith("/admin/categories") ||
      pathname.startsWith("/admin/import")
    ) {
      if (profile.role_id !== "super_admin" && profile.role_id !== "question_manager") {
        return NextResponse.redirect(new URL("/admin?error=forbidden", req.url));
      }
    }
    if (pathname.startsWith("/admin/results")) {
      if (profile.role_id !== "super_admin" && profile.role_id !== "exam_reviewer") {
        return NextResponse.redirect(new URL("/admin?error=forbidden", req.url));
      }
    }
    return res;
  }

  return res;
}

function redirectToLogin(req: NextRequest, next: string, reason?: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", next);
  if (reason) url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/exam/:path*", "/result/:path*"],
};
