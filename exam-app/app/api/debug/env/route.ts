import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/debug/env
 * ---------------------------------------------------------------------
 * Diagnoses the #1 cause of "permission denied for table ..." errors:
 * the SUPABASE_SERVICE_ROLE_KEY env var actually containing the ANON
 * key by mistake. Supabase keys are JWTs whose payload has a "role"
 * claim ("anon" vs "service_role"). This decodes ONLY that claim from
 * each key (never returns the keys themselves) and does a live write
 * test to a scratch table via the service client.
 *
 * Safe to expose: it reveals no secrets, only which KIND of key is
 * loaded and whether env vars are present.
 */
function jwtRole(key: string | undefined): string {
  if (!key) return "MISSING";
  const parts = key.split(".");
  if (parts.length !== 3) return "not-a-JWT (maybe a newer publishable/secret key — this app needs the classic anon + service_role JWT keys)";
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return payload.role || "unknown-role";
  } catch {
    return "undecodable";
  }
}

export async function GET() {
  const urlPresent = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const anonRole = jwtRole(anonKey);
  const serviceRole = jwtRole(serviceKey);

  // Live write test: insert+delete a throwaway audit row via the service
  // client. If the service key is really the anon key, this fails with
  // "permission denied" (RLS) — exactly the error the user is seeing.
  let writeTest = "not run";
  try {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("exam_attempts")
      .insert({ trainee_name: "__debug_write_test__", status: "in_progress" })
      .select("id")
      .single();
    if (error) {
      writeTest = `FAILED: ${error.message}`;
    } else {
      // clean up the test row
      await supabase.from("exam_attempts").delete().eq("trainee_name", "__debug_write_test__");
      writeTest = "OK — service client can write to exam_attempts";
    }
  } catch (e: any) {
    writeTest = `ERROR: ${e?.message || e}`;
  }

  const diagnosis =
    serviceRole !== "service_role"
      ? `PROBLEM: SUPABASE_SERVICE_ROLE_KEY is '${serviceRole}', not 'service_role'. This is why you get "permission denied". Copy the service_role secret from Supabase → Settings → API into this variable and redeploy.`
      : anonRole !== "anon"
      ? `Heads up: NEXT_PUBLIC_SUPABASE_ANON_KEY is '${anonRole}', not 'anon'. Login/reads may still work, but set it to the anon/public key.`
      : "Keys look correct (service_role + anon). If you still see permission-denied, re-run supabase/schema.sql to disable the old RLS policies.";

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL_present: urlPresent,
    anonKey_present: !!anonKey,
    anonKey_role: anonRole,
    serviceKey_present: !!serviceKey,
    serviceKey_role: serviceRole,
    serviceClient_writeTest: writeTest,
    diagnosis,
  });
}
