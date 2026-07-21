import { NextRequest, NextResponse } from "next/server";
import { verifyAppSession, APP_SESSION_COOKIE } from "./lib/appSession";

/**
 * middleware — username-only login edition
 * ---------------------------------------------------------------------
 * One session type: the signed app-session cookie set by
 * /api/auth/login (see lib/appSession.ts). The cookie carries the
 * profile id and the role AT LOGIN TIME; middleware uses that role
 * claim purely for ROUTING (which pages you can reach). Every API
 * route and server page then re-loads the profile fresh from the
 * database (lib/auth.ts), so a block (is_active=false) or a role
 * change is enforced on the very next data access even if this
 * routing layer still lets the page shell load.
 *
 * Runs on Vercel's Edge Runtime — lib/appSession.ts uses only the Web
 * Crypto API for exactly that reason.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const session = await verifyAppSession(req.cookies.get(APP_SESSION_COOKIE)?.value);

  // ---- /exam, /result, /trainer: any logged-in role ----------------
  if (pathname.startsWith("/exam") || pathname.startsWith("/result") || pathname.startsWith("/trainer")) {
    if (!session) return redirectToLogin(req, pathname);
    return NextResponse.next();
  }

  // ---- /admin/*: any admin-capable role, with per-area gating ------
  if (pathname.startsWith("/admin")) {
    if (!session) return redirectToLogin(req, pathname);
    if (session.role === "trainee") return redirectToLogin(req, pathname, "forbidden");

    if (
      pathname.startsWith("/admin/users") ||
      pathname.startsWith("/admin/themes") ||
      pathname.startsWith("/admin/audit") ||
      pathname.startsWith("/admin/exam-settings") ||
      pathname.startsWith("/admin/exam-templates") ||
      pathname.startsWith("/admin/data")
    ) {
      if (session.role !== "super_admin") {
        return NextResponse.redirect(new URL("/admin?error=forbidden", req.url));
      }
    }
    if (
      pathname.startsWith("/admin/questions") ||
      pathname.startsWith("/admin/categories") ||
      pathname.startsWith("/admin/import") ||
      pathname.startsWith("/admin/ai-generator") ||
      pathname.startsWith("/admin/topics")
    ) {
      if (session.role !== "super_admin" && session.role !== "question_manager") {
        return NextResponse.redirect(new URL("/admin?error=forbidden", req.url));
      }
    }
    if (pathname.startsWith("/admin/results")) {
      if (session.role !== "super_admin" && session.role !== "exam_reviewer") {
        return NextResponse.redirect(new URL("/admin?error=forbidden", req.url));
      }
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest, next: string, reason?: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", next);
  if (reason) url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/exam/:path*", "/result/:path*", "/trainer/:path*"],
};
