import { NextResponse } from "next/server";
import { APP_SESSION_COOKIE } from "@/lib/appSession";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  return res;
}
