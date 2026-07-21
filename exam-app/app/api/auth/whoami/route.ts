import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ profile: null });
  return NextResponse.json({
    profile: {
      id: profile.id,
      display_name: profile.display_name,
      role_id: profile.role_id,
      email: profile.email,
    },
  });
}
