# Upgrading to v4.1 — DO THIS FIRST

Several v4.1 fixes need a database update. **Re-run the whole
`supabase/schema.sql` in your Supabase SQL Editor** (Supabase dashboard
→ SQL Editor → paste the file → Run). It's safe to re-run — everything
is guarded with IF NOT EXISTS / idempotent blocks.

This one step fixes three of the errors you saw:

1. **"Could not find the 'is_preview' column of 'exam_attempts'"**
   (Preview Exam failing) — adds the missing column.
2. **"permission denied for table user_theme_settings"** (can't add
   image/video/music) — the old Row Level Security policies were written
   for Supabase Auth (`auth.uid()`), which username-only login never
   sets, so they denied everything. The migration disables that dead RLS;
   access is now enforced in the API layer via the signed session cookie
   + service role.
3. Preview-exam labelling and not-consuming-attempts.

## If "permission denied" persists AFTER re-running the schema

Then your **`SUPABASE_SERVICE_ROLE_KEY` in Vercel is wrong** — this is
common if it accidentally got set to the anon/publishable key. The
service role key is the one that bypasses database security; if it's
actually the anon key, writes get denied.

Fix: Supabase → Settings → API → copy the **`service_role`** secret
(NOT anon, NOT publishable) → paste into Vercel's
`SUPABASE_SERVICE_ROLE_KEY` → redeploy. Verify at **`/api/debug/session`**
(shows your session) and by adding a theme image again.

## Code fixes in v4.1 (no action needed, just FYI)

- **Excel import crash** ("Cannot read properties of undefined (reading
  'match')") — Excel sheets with blank/merged cells produced *sparse*
  arrays; the parser now densifies every row so it can't crash. Import
  and Replace both work now.
- **Questions showed no answers** — the question list now displays all
  four options inline (correct one highlighted), not just the letter.
  Note: if your earlier import crashed, those questions may have no
  answers stored — re-import with "Replace entire question bank" to fix.
- **Preview buttons** — now show the real error if something fails, and
  tolerate the is_preview column being missing (though you should still
  re-run the schema).
