import { NextResponse } from "next/server";
import { CODE_SESSION_COOKIE } from "@/lib/codeSession";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CODE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
