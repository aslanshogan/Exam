# v4.1 — What was checked

This lists every button/flow that was reviewed and hardened in v4.1. For
each one, the code now: handles non-JSON responses safely, shows the
HTTP status + a real error message on screen, shows "Session expired,
please sign in again" on 401 and "You do not have permission" on 403,
and never fails silently. Server routes `console.error` real errors.

> Honest note on testing method: this project can't be `npm run build`
> here (the build sandbox has no npm registry access), so these were
> verified by code review + logic tracing, not a running browser. Please
> run `npm install && npm run build` and click through the checklist
> below once on your deployment. Anything that misbehaves, tell me the
> on-screen error (now guaranteed to be shown) and I can pinpoint it.

## Login / Header
- First-Time Setup — shown only when no active super-admin-with-username
  exists; now fails CLOSED on DB error (won't show setup on a live
  system by mistake). [needs-setup, first-admin]
- "Already have a username? Sign in instead" — always available in setup
  mode, so you're never trapped.
- "First-time setup" link — available from the normal login form too.
- Normal username sign in — case-insensitive, rejects blocked accounts,
  full page reload after success so the cookie reaches the server.
- Sign out — clears the app_session cookie, redirects to /login.
- Header nav + dashboard buttons — whoami calls guarded against non-JSON.

## Admin → Users
- Add User / Edit User / change role / block / activate / soft-delete —
  all via apiFetch with visible errors.
- Cannot block/delete your OWN account (buttons disabled + server guard).
- Cannot block/delete/demote the LAST active super admin (server guard
  returns a clear message).
- Detail page: Save profile (full_name, username, role, active), Save
  exam access, Deactivate, and permanent Delete (Danger Zone, ?hard=true).

## Admin → Questions
- Add / Edit / Save / Delete question, filters, active + always-include
  toggles — all via apiFetch; page-level red error banner on failure.

## Admin → Categories
- Add / edit count / Delete category — via apiFetch with error banner.

## Admin → Import
- Upload + parse validated BEFORE any deletion.
- If the file yields 0 valid questions, import ABORTS and existing
  questions are left untouched (HTTP 422 with a clear message + report).
- Replace-entire-bank only deletes after validation passes; if deletion
  fails, it stops and reports; if a later insert fails, the exact error
  is returned.
- Report shows totalParsed / totalValid / totalImported / duplicates /
  deletedCount / per-row problems.

## Exam Settings / Templates
- Save settings, Preview Exam (admin), Generate shared exam, Assign to
  trainees, Delete template — all via apiFetch with visible success or
  the exact reason it couldn't proceed.

## Exam flow
- Start exam (trainee) / Preview exam (admin) — full page nav into exam.
- Load question, Next/Back, Select answer (now rolls back + warns if the
  save fails instead of silently losing it), Submit, View result.
- Admin preview attempts are flagged is_preview=true and do NOT consume
  any attempt allowance; they're labelled "(Admin Preview)".

## Results
- Results table, admin result detail, delete result, Clear All Results,
  CSV export — delete/clear via apiFetch with visible errors.

## Debug
- GET /api/debug/session — reports cookie presence, verification, and the
  resolved profile. Open to anyone in development; super-admin-only in
  production. Use it if a button says unauthorized.
