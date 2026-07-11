# Unit Function Exam — Setup & Deployment Guide (v2)

Next.js + TypeScript + Supabase + Tailwind training exam app with:
- **4 user roles** (Super Admin, Question Manager, Exam Reviewer, Trainee)
- **Real accounts** via Supabase Auth, or **access-code login** for trainees
- **Per-user personalization**: colors, background image/video, music — set by Super Admin
- Full exam engine, admin dashboard, Excel import, results/audit logging

This supersedes the v1 guide (kept at `SETUP_v1.md.bak`). If you deployed v1
already, read "Migrating from v1" near the bottom of `supabase/schema.sql`
before running the new schema.

> **v3 update:** added configurable exam size, pinned "always-include"
> questions, and a choice of category-selection strategy — see section 9,
> "Exam configuration." `supabase/schema.sql` has matching "MIGRATING FROM
> v2" notes if you already ran the v2 schema.

---

## 1. What changed from v1

| | v1 | v2 |
|---|---|---|
| Login (everyone) | Type your name, no account | **Username-only** — no password, no email account needed |
| Admin login | Single shared password | Supabase Auth + role (`super_admin`, `question_manager`, `exam_reviewer`) |
| Permissions | All-or-nothing admin | 4 distinct roles + optional per-user overrides |
| Look & feel | One fixed theme | Every user can have their own colors / background image or video / music |
| Accountability | None | `audit_logs` records every admin action |

---

## 2. Supabase setup

1. Create a project at supabase.com (or reuse your v1 project — see migration notes).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → Run.
   This creates `roles`, `profiles`, `user_permissions`, `exam_access`,
   `user_theme_settings`, `audit_logs`, the original exam tables (now
   linked to `profiles` instead of raw Supabase user IDs), every RLS
   policy, and the 5 Storage buckets (`logos`, `background-images`,
   `background-videos`, `music`, `turbine-models`).
3. **Project Settings → API**, copy into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, secret)
4. Generate a random secret that signs the login session cookie:
   ```bash
   openssl rand -hex 32
   ```
   Put it in `.env.local` as `APP_SESSION_SECRET`. (Deployments that
   already set the old `ACCESS_CODE_SECRET` don't need to change
   anything — it's accepted as a fallback.)

### Creating the first Super Admin (no SQL needed anymore)
Login is now by **username only** — no Supabase Auth accounts, no
email/password, no bootstrap SQL. The chicken-and-egg problem is solved
by a built-in first-run screen:

1. Open your deployed site (or `http://localhost:3000`) and go to `/login`.
2. Because no Super Admin exists yet, the login page automatically shows
   **"First-Time Setup"** instead of the normal sign-in form.
3. Enter your full name and choose a username, click
   **Create Admin & Sign In** — you're immediately logged in as Super
   Admin, and this setup screen disappears permanently.
4. Add everyone else from **Admin → Users → + Add User**.

⚠ **Do step 2–3 immediately after deploying.** Until the first admin
exists, anyone who finds the URL could claim that setup screen. Once
one Super Admin exists, the endpoint locks itself off forever.

⚠ **The username IS the credential — there is no password.** Anyone who
knows or guesses a username can log in as that person. For admin
accounts especially, use usernames that can't be guessed (not "admin",
not a first name — treat them like access codes). Trainee usernames can
be simpler since trainees can only take the exam.

**Migrating an existing deployment** (accounts created under the old
email/password system): those profiles have no username yet, so they
can't log in until you give them one. Either give them usernames via
Admin → Users → Edit (once you're in as a Super Admin), or for your own
old admin account, one line of SQL:
```sql
update profiles set username = 'pick-a-username'
where email = 'your-old-login-email@example.com';
```

---

## 3. Local setup

**Requires Node.js 20 or newer** (enforced via `package.json` →
`engines.node`). This isn't arbitrary — the access-code login system
uses the Web Crypto API so the same code runs on both Vercel's Edge
Runtime and Node.js, and that API isn't reliably available without
flags before Node 19. Check your version first:
```bash
node -v
```
If that's below `v20.0.0`, install Node 20 LTS from nodejs.org before continuing.

```bash
cd exam-app
npm install
cp .env.local.example .env.local
# fill in the 4 values from steps above
npm run dev
```
Open http://localhost:3000.

For a slower, fully beginner-friendly walkthrough of all of this
(including exact CMD/Terminal steps, Supabase setup, and deployment),
see `INSTALL_GUIDE.md` in this same folder.

---

## 4. Roles, at a glance

| Role | Questions | Categories/Import | Results | Users | Themes |
|---|---|---|---|---|---|
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Question Manager** | ✅ | ✅ | ❌ | ❌* | ❌ |
| **Exam Reviewer** | ❌ | ❌ | ✅ (view + export) | ❌ | ❌ |
| **Trainee** | ❌ | ❌ | own result only | ❌ | ❌ |

\* A Super Admin can grant a specific Question Manager (or anyone) extra
permissions without changing their role — see `user_permissions` below.

### Fine-grained overrides (optional)
Every permission check (`manage_users`, `manage_questions`,
`manage_results`, `manage_themes`) also looks at the `user_permissions`
table. To let a specific Question Manager also manage users, run:
```sql
insert into user_permissions (user_id, permission_key, allowed, granted_by)
values ('<their-profile-id>', 'manage_users', true, '<your-profile-id>');
```
There's no UI for this yet — it's a deliberately rare, SQL-only escape
hatch so it doesn't get used by accident.

---

## 5. Adding users (`/admin/users`)

Super Admin can:
- **Add a user** — full name, a unique username (their login — no
  password exists), a role, and optionally an email (informational
  only). Usernames are case-insensitive and must be unique.
- **Edit a user** (`/admin/users/[id]`) — change role, deactivate,
  reset password, control exam access (allowed to take? retake allowed?
  max attempts?), and set their personal theme/media.
- **Deactivate vs delete** — both are one-click buttons in the "Danger
  Zone" of the Profile tab on `/admin/users/[id]`:
  - **Deactivate User** — reversible. Immediately blocks login and exam
    access without deleting anything; un-check is just as easy.
    Recommended for normal use (someone leaving the program, a
    mistaken account, etc.).
  - **Delete User** — permanent. Removes their username login,
    theme, and exam-access settings. Requires typing `DELETE USER`
    exactly to confirm. Their exam history is **not** deleted — past
    attempts remain visible on the Results pages under their name as
    it was at the time (`exam_attempts.trainee_name` is a snapshot,
    independent of the account), they just stop being linked to an
    active account. The confirmation prompt tells you up front how
    many attempts that user has on record before you confirm.

### How login works now
One system for everyone: **username-only**. Every user (any role) logs
in by typing the username a Super Admin gave them — no password, no
email account, no Supabase Auth. The username lookup is
case-insensitive, blocked accounts (`is_active = false`) are rejected
at login AND on every request after, and sessions last 8 hours (signed
HTTP-only cookie — see `lib/appSession.ts`). Because the username is
the only credential, give admins non-guessable usernames; trainee
usernames can be simple since a trainee session can only reach the
exam, never `/admin`.

---

## 6. Personalization (`/admin/themes` and per-user "Theme & Media" tab)

Every user can have: background/accent/card/button/text color, an
optional background image, an optional background video (autoplay
muted + loop), and optional music (autoplay-with-fallback). A single
**global default theme** (no user assigned) covers the public Home page
and anyone without a personal override.

### Where themes apply (and where they deliberately don't)
- **Themed (trainee-facing pages):** `/` (Home), `/login`, `/exam`,
  `/result/[id]`. Logged-in users see their own personal theme; the
  Home and Login pages show the **global default theme** before anyone
  is logged in (or for any user with no personal override).
- **NOT themed, by design:** every `/admin/*` page. These intentionally
  keep a fixed navy/white dashboard look regardless of who's logged in
  or what their personal theme says — a Super Admin reviewing results
  or editing 50 questions needs maximum legibility and consistency, not
  a different background video for every admin. If you want this
  changed, the place to do it is wrapping each `/admin/*` page's JSX in
  `<ThemeProvider>` the same way `/exam`'s page does — but we'd
  recommend against it for the reason above.

**Removing media:** every Upload button has a matching **Remove**
button once a file is set (Remove image / Remove video / Remove
music). This doesn't just clear the field — it calls
`/api/admin/media/delete`, which deletes the actual file from Supabase
Storage first, so removed files don't sit around taking up storage
forever. Uploading a *replacement* file (without clicking Remove first)
also deletes the old file automatically once the new one finishes
uploading. Typing a URL in by hand (instead of uploading) and then
clearing it will NOT call Storage — there's nothing of ours to delete
in that case.

**Browser autoplay safety** (already built in, no config needed):
- Background video autoplays **muted** — browsers reliably allow this.
- Music tries to autoplay; if the browser blocks it, a clean "🔊 Tap to
  enable sound" overlay appears. One tap starts playback. Play/pause,
  mute, and a volume slider are always available in a small fixed
  control bar.
- A Super Admin can kill music app-wide instantly from `/admin/themes`
  ("Music globally enabled" toggle) regardless of any user's setting.

**Uploading media**: from any Theme & Media tab, use the "Upload"
buttons next to the image/video/music URL fields — Super Admin only.
Files land in the matching Supabase Storage bucket and the public URL
is filled in automatically. Allowed types/sizes are enforced
server-side (see `lib/mediaValidation.ts`):

| Kind | Types | Max size |
|---|---|---|
| Background image | jpg, png, webp | 10MB |
| Background video | mp4, webm | 80MB |
| Music | mp3, wav, ogg | 25MB |
| Logo | png, svg, jpg, webp | 5MB |
| 3D turbine model | glb | 40MB |

**⚠️ Only upload media you have the rights to use.** Do not upload
copyrighted music or video you don't have permission for — this app
places no licensing restrictions of its own, that responsibility is on
whoever uploads the file.

---

## 7. Importing your question bank

`/admin/import` (Super Admin or Question Manager) or `npm run
import:excel` from the command line. See the in-app import report for
any rows that couldn't be parsed confidently; always review correct
answers after importing.

**Import safety:**
- **Duplicate detection (always on):** before inserting each question,
  it's compared (case/whitespace-normalized) against every existing
  question already in that category, AND against every question
  already queued from earlier in the same file — so re-running an
  import doesn't pile up duplicates, and a question repeated twice
  within one spreadsheet only gets imported once. Skipped duplicates
  are listed in the report, not silently dropped.
- **"Replace entire question bank with this file"** — an explicit
  checkbox on `/admin/import` (or `npm run import:excel -- --replace`
  on the command line). Deletes every existing question first, then
  imports fresh. Categories and category rules are left untouched.
  Requires typing a confirmation phrase before anything is deleted —
  see section 10b, "Data Management," for the same pattern used
  elsewhere for destructive actions.

  **Safety guarantee (v4.1):** the uploaded file is parsed and validated
  BEFORE anything is deleted. If the file produces **0 valid questions**,
  the import aborts and your existing questions are left completely
  untouched (you'll see a clear message and the problem list, HTTP 422).
  If the delete step itself fails, it stops and reports rather than
  half-completing; if a question insert fails after the delete, the exact
  error is returned. So a malformed or wrong file can no longer wipe your
  bank and leave you empty.

---

## 8. Exam access rules (how a trainee gets blocked or allowed)

For each trainee, `exam_access` controls:
- `allowed_to_take` — must be true to even see the Start Exam button.
- `max_attempts` / `attempts_used` — once `attempts_used >= max_attempts`,
  Start Exam is blocked **unless** `allow_retake` is true.
- An inactive **profile** (`is_active = false`) blocks login entirely,
  which blocks the exam too.

Both the Home page (UI) and `/api/exam/start` (server) enforce this
independently — the UI hides the button with a clear reason; the API
re-checks everything regardless of what the UI shows, so this can't be
bypassed by calling the API directly.

---

## 9. Exam configuration (`/admin/exam-settings`)

Super Admin controls the shape of every generated exam from one page:

- **Total Exam Questions** — any number, not just 50.
- **Passing Score** — the authoritative pass/fail threshold (replaces
  the old `app_settings.passing_score`, which is no longer read).
- **Pinned ("always-include") questions** — on `/admin/questions`,
  every question has an **"Always include in every exam"** checkbox
  (`questions.always_include`) and an **"Active question"** checkbox
  (`questions.active`). Inactive questions never appear in any exam,
  pinned or not. Filter the question list by All / Always Included /
  Inactive / by Category right above the table.
- **Category Selection Mode** — choose one:
  - **Fixed Category Rules** — same as before: take exactly N questions
    from each category per `category_rules`. If the rule totals don't
    exactly match "Total Exam Questions," the engine trims or tops up
    randomly to hit the exact total while staying as close to your
    category rules as possible.
  - **Auto-Distribute** — ignores `category_rules` entirely. Every
    active category gets "Default Questions Per Category" as a
    baseline, then any leftover slots are spread round-robin across
    categories that still have unused questions.
- **Include always-include questions** — a master on/off switch for
  the whole pinned-question feature, without un-pinning every question
  individually.
- **Randomize final question order** — if off, pinned questions appear
  first, then the rest in selection order.
- **Allow retakes (global)** — ANDed with each trainee's own retake
  setting (`exam_access.allow_retake`) — see section 8.
- **Show score screen to trainee** / **Show correct answers to
  trainee** — replace the old `app_settings.show_explanations_to_trainee`.
  When "show correct answers" is on, the trainee's result page also
  renders a full answer-by-answer review (question, their answer, the
  correct answer, and the explanation for anything they got wrong).
  Admins and Exam Reviewers always see the full review on
  `/admin/results/[id]` regardless of these trainee-facing toggles.

### How the exam is actually built (`lib/examEngine.ts`)
1. Load `exam_settings`.
2. Gather all **active** `always_include` questions → the mandatory set.
3. If `mandatory_count > total_questions` → block with: *"Too many
   always-include questions. Total exam size is smaller than mandatory
   questions."*
4. `remaining = total_questions − mandatory_count`.
5. Fill `remaining` using whichever Selection Mode is configured, from
   **active, non-mandatory** questions only.
6. No duplicates — mandatory questions are excluded from the random pool.
7. Shuffle the combined list only if "Randomize final question order" is on.

The same validation function (`lib/examValidation.ts`) powers three
places at once, so they can never disagree: the live preview on
`/admin/exam-settings` (updates instantly as you change the form,
before saving), the Admin Dashboard's "Can Generate Exam?" stat, and
the real gate inside `buildRandomExam()` that runs when a trainee
actually clicks Start Exam.

## 9b. Database changes for this feature
- `questions.always_include boolean default false` (new column;
  `alter table ... add column if not exists` makes re-running the
  schema safe on an existing v2 database).
- New `exam_settings` table (single row, id = 1) — see schema.sql for
  the full column list and RLS policies.
- `app_settings.passing_score` and `.show_explanations_to_trainee` are
  now **deprecated** (kept for backward compatibility, no longer read
  anywhere) — see the "MIGRATING FROM v2" note at the bottom of
  `supabase/schema.sql` if you customized them previously.

## 9c. Previewing the exam as an admin

The Home page's "Start Exam" button only appears for **trainees** —
admins are redirected to the dashboard. To test the exam yourself, use
the **"▶ Preview Exam as Admin"** button, available in two places:
the **Dashboard** (top card) and the top of **`/admin/exam-settings`**
(both visible whenever the configuration can build a valid exam). It
generates a real exam under your own account using the current settings
and drops you straight into the full exam flow, so you can confirm
end-to-end that questions appear and answering/submitting works.

Preview attempts are flagged `is_preview = true`, show on the Results
pages with an "(Admin Preview)" label, and — as of v4.1 — do **not**
consume any attempt allowance (yours or anyone's). Delete them from
`/admin/data` or the Results page if you don't want them in your stats.

## 9d. Same exam for multiple trainees (`/admin/exam-templates`)

By default every trainee gets a freshly randomized exam. If instead you
want a whole group to sit the **exact same** questions (e.g. a fair,
comparable cohort exam):

1. Go to **Admin → "Same Exam for Many"**.
2. Give the shared exam a name and click **Generate** — this builds one
   question set right now using your current Exam Settings and snapshots
   it permanently (editing or deleting those questions later in the
   bank won't change this saved exam).
3. Click **Assign** on that template, tick the trainees who should get
   it, and **Save Assignment**.
4. Those trainees now receive this exact question set the next time they
   click Start Exam. Optionally tick "Shuffle order per trainee" when
   creating it so everyone gets the same questions but in a different
   order (mild anti-copying without changing fairness).

Unassigned trainees keep getting fresh random exams. Deleting a template
safely reverts anyone assigned to it back to random generation. Backed
by two new tables (`exam_templates`, `exam_template_questions`) plus
`exam_access.assigned_template_id` — all created by re-running
`supabase/schema.sql`.

## 10. Audit log

Every meaningful admin action is recorded in `audit_logs`: user created
/ deactivated / role changed / password reset, question added/edited/
deleted, category changes, Excel imports, exam result viewed, results
exported, theme changes (per-user or global), and every destructive
action listed below in section 10b. View the most recent 200 at
`/admin/audit` (Super Admin only).

---

## 10a. Why deleting questions/categories/users never fails

Earlier versions of this schema had `exam_attempt_questions` and
`exam_answers` reference the live `questions` table with no cascade
behavior — Postgres' default. That meant deleting a single question,
deleting a category (which cascades to its questions), or using
"Replace entire question bank" would fail with a foreign-key error the
moment *any* exam had ever used one of those questions — which, in
practice, is most questions, most of the time.

**Fixed by snapshotting.** `exam_attempt_questions` now stores a full
copy of each question (category, text, all 4 options, correct answer,
explanation) at the moment the exam is generated — not a live
reference. `question_id` is kept only as an optional traceability link
(nullable, `ON DELETE SET NULL`) and is never relied on to *display*
anything. `exam_answers` is keyed by `(attempt_id, question_number)`
instead of `question_id`, decoupling it from the question bank
entirely. Practically: you can delete a question, delete an entire
category, or replace the whole question bank, at any time, regardless
of exam history — past results are completely unaffected because they
no longer depend on the live `questions` table at all.

The same fix was applied to two related spots found during the same
audit: `audit_logs.actor_user_id` and `user_permissions.granted_by`
now both use `ON DELETE SET NULL` instead of the default blocking
behavior, so deleting a user who once performed a logged admin action
(or once granted someone a permission override) can never fail either.

If you already ran an earlier version of this schema and have real
exam data, see the "MIGRATING TO THE SNAPSHOT ARCHITECTURE" block near
the end of `supabase/schema.sql` before re-running it.

---

## 10b. Data Management (`/admin/data`, Super Admin only)

A central page for the destructive actions in the app, with a backup
reminder banner at the top and a live count of questions, categories,
and exam attempts. Individual delete actions stay on their natural
pages (deleting one question on `/admin/questions`, one category on
`/admin/categories`, one result on `/admin/results`) — `/admin/data` is
where the **bulk/irreversible** ones live, plus a permission boundary
worth knowing:

- **Deleting results is Super-Admin-only, with no override.** Every
  other permission in this app (`manage_questions`, `manage_results`
  for viewing/exporting, `manage_themes`) can be delegated to a
  non-Super-Admin via `user_permissions` (see section 4). Deletion is
  the one exception — an Exam Reviewer can view and export every
  result, but can never delete one, and there's no override flag that
  changes that.
- **"Clear All Results"** (on `/admin/data`) permanently deletes every
  exam attempt — completed and in-progress — and resets every
  trainee's `attempts_used` back to 0. Requires typing `CLEAR RESULTS`
  exactly. Questions, categories, and user accounts are untouched.
- **Deleting a single result** (button on `/admin/results`, per row)
  asks for a normal confirmation (trainee name + date shown), since
  it's a single record rather than everything at once.
- **Deleting a category** (`/admin/categories`) now shows how many
  questions are inside it before you delete, and requires **typing the
  exact category name** to confirm — it cascades and deletes every
  question in that category too.
- **Replacing the whole question bank** via Excel import requires
  typing `DELETE` to confirm (see section 7).

Every one of these is logged to `audit_logs` with exactly what was
deleted (counts, names, IDs) so there's a record even after the data
itself is gone.

---

## 11. Deploying to Vercel

1. Push to GitHub, import into Vercel.
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `APP_SESSION_SECRET`.
3. Deploy — Next.js auto-detected, no build config changes needed.
4. In Supabase **Authentication → URL Configuration**, add your Vercel
   domain to the allowed redirect/site URLs so login works in production.

---

## 12. Testing checklist

**Bootstrapping**
- [ ] Run the v2 SQL schema on a fresh project; confirm 8 new/changed tables + 5 Storage buckets exist
- [ ] Bootstrap your first Super Admin (section 2), log in at `/login`

**User management**
- [ ] Create one user of each role from `/admin/users`
- [ ] Create one trainee from Admin → Users and log in as them with just their username — confirm no password is ever asked for
- [ ] **Repeat the username login test on your real Vercel deployment, not just `npm run dev`.** This exercises `middleware.ts` on Vercel's actual Edge Runtime (local dev does not fully emulate Edge). On the live site: log in with a trainee username → DevTools → Application/Storage → Cookies → confirm an `app_session` cookie was set → confirm `/exam` opens → manually navigate to `/admin` and confirm the trainee is redirected away
- [ ] Block a user (Users → Block), then try logging in as them — confirm the login is rejected immediately
- [ ] Try to Block or Delete your OWN account — confirm the app refuses
- [ ] With only one Super Admin existing, try to block/delete/demote them — confirm the app refuses with the "last active Super Admin" message
- [ ] Try creating two users with usernames "Aslan" and "aslan" — confirm the second is rejected as already taken
- [ ] Deactivate a user, confirm they're immediately blocked from logging in
- [ ] Have that user complete an exam, THEN delete their account (type `DELETE USER` to confirm) — confirm the confirmation prompt showed their attempt count beforehand, the deletion succeeds with no error, and their result still appears on `/admin/results` under their name afterward
- [ ] Reset a user's password, confirm they can log in with the new one
- [ ] Confirm a Question Manager CANNOT see `/admin/users` or `/admin/themes` (redirected)
- [ ] Confirm an Exam Reviewer CANNOT edit questions but CAN view/export results
- [ ] Confirm a Trainee is redirected away from `/admin` entirely

**Exam access**
- [ ] Set a trainee's `allowed_to_take = false`; confirm Start Exam is blocked with a clear message
- [ ] Set `max_attempts = 1`, complete one exam, confirm a second attempt is blocked
- [ ] With the global "Allow retakes" OFF in `/admin/exam-settings`, set a trainee's personal `allow_retake = true` — confirm they're STILL blocked (global switch wins)
- [ ] Turn the global "Allow retakes" ON too — confirm that same trainee can now retake

**Personalization**
- [ ] Set distinct colors for two different trainees; confirm each sees their own on Home/Exam/Result
- [ ] Enable a background video for one user (muted, loop) — confirm it autoplays without a click
- [ ] Enable music with autoplay for one user — confirm either it plays immediately or the "Tap to enable sound" overlay appears, and that tapping starts it
- [ ] Test mute/unmute and the volume slider
- [ ] Toggle "Music globally enabled" off in `/admin/themes`; confirm music stops appearing everywhere regardless of per-user settings
- [ ] Upload a background image and a music file through the admin UI; confirm both play correctly for that user
- [ ] Click "Remove image" on a user's background image — confirm the field clears AND the file disappears from the matching bucket in Supabase Storage (Storage → background-images), not just the UI
- [ ] Code-level confirmation of the error-handling fix (hard to force a real Storage failure manually, since deleting an already-missing file is treated as success): open `components/ThemeEditorForm.tsx` and confirm `handleRemove` checks `result.ok` before clearing the field, and `handleUpload`'s old-file cleanup shows a warning message (not a silent failure) if it can't delete the previous file
- [ ] Upload a new background video over an existing one (without clicking Remove first) — confirm the OLD file is also gone from Storage afterward, not just replaced in the UI
- [ ] Visit `/login` while logged out — confirm it shows the same global default theme colors as the logged-out Home page
- [ ] Visit any `/admin/*` page — confirm it stays the fixed navy/white dashboard look regardless of any user's personal theme (this is intentional — see section 6, "Where themes apply")

**Exam configuration (always-include + total size + selection mode)**
- [ ] Mark 5 questions as "Always include in every exam" on `/admin/questions`
- [ ] Set Total Exam Questions to 50 in `/admin/exam-settings`
- [ ] Start an exam and confirm all 5 marked questions appear
- [ ] Confirm the other 45 questions are drawn randomly (vary between attempts)
- [ ] Change Total Exam Questions to 30 — confirm the dashboard/exam-settings preview shows "Random Questions Needed: 25"
- [ ] Start a new exam and confirm the 5 marked questions still appear plus 25 random ones (30 total)
- [ ] Set Total Exam Questions to 3 (fewer than the 5 mandatory questions) — confirm Start Exam is blocked with: *"Too many always-include questions. Total exam size is smaller than mandatory questions."*
- [ ] Mark one of the always-include questions as Inactive — confirm the exam-settings preview warns it will be skipped, and confirm it does NOT appear in the next generated exam
- [ ] Switch Selection Mode to "Auto-Distribute," save, and confirm a generated exam still totals the configured number of questions with no duplicates
- [ ] Deactivate every question in one category — confirm that category shows "NOT ENOUGH" (fixed mode) or simply contributes 0 questions (auto-distribute mode), and that inactive questions from that category never appear in any generated exam

**Exam + results (same as v1, re-verify with the new auth)**
- [ ] Full exam (any configured size), Back/Next preserve answers, Submit blocked until complete
- [ ] Score screen shows correct %, correct/wrong, Pass/Fail
- [ ] With "Show correct answers to trainee" ON, confirm the trainee's result page shows a full answer-by-answer review
- [ ] With "Show score screen to trainee" OFF, confirm the trainee sees only "Exam Submitted" with no score, while `/admin/results` still shows the full detail
- [ ] `/admin/results` shows the attempt; detail page shows all answers
- [ ] CSV export works

**Audit log**
- [ ] Perform a few admin actions (add question, change role, export results); confirm they appear in `/admin/audit`

**Import safety**
- [ ] Import the same Excel file twice in a row — confirm the second import's report shows the questions as "Duplicates Skipped," not re-imported
- [ ] Check "Replace entire question bank with this file," confirm the typed-confirmation prompt appears, type the wrong text — confirm nothing is deleted
- [ ] Type `DELETE` exactly — confirm all previous questions are gone and only this file's questions remain

**Data Management (`/admin/data`)**
- [ ] Confirm an Exam Reviewer can export results but the Delete button never appears for them on `/admin/results` (Super Admin only)
- [ ] Delete a single result from `/admin/results` — confirm it's gone and the trainee's `attempts_used` did NOT change (only "Clear All Results" resets that)
- [ ] On `/admin/data`, click "Clear All Results," type the wrong phrase — confirm nothing happens
- [ ] Type `CLEAR RESULTS` exactly — confirm every result is deleted and every trainee's attempt count resets to 0
- [ ] **The critical regression test for the snapshot fix:** complete an exam so at least one question has real attempt history, THEN delete that single question from `/admin/questions` — confirm it deletes with no foreign-key error, and the old result's Answer Review still shows the original question text/answers/explanation correctly (not blank, not broken)
- [ ] Same test again, but delete the question's entire CATEGORY instead — confirm no error, and old results referencing that category's questions still display correctly
- [ ] Same test again, but use "Replace entire question bank" on `/admin/import` — confirm no error, and old results from before the replace still display correctly afterward
- [ ] Delete a category with questions in it — confirm the prompt shows the real question count and requires typing the exact category name

---

## 12b. Troubleshooting common setup problems

**"Unknown username, or account is blocked" at login.** Either the
username genuinely doesn't exist (check spelling — though case doesn't
matter), or the account was blocked (Admin → Users shows a red
"Blocked" badge — click Activate). If this is a deployment migrated
from the old email/password system, the old accounts have NO username
yet and can't log in until one is set — see "Migrating an existing
deployment" in section 2.

**The login page shows "First-Time Setup" when it shouldn't (or
doesn't when it should).** That screen appears only while zero active
Super Admins with a username exist. As of v4.1 the check fails CLOSED —
if the database query errors, it will NOT show setup (so a transient
error can't trap you out of normal login). If you still see setup after
you already created an admin:
  1. You can always click **"Already have a username? Sign in instead"**
     on the setup screen — it's never a dead end now.
  2. Confirm your admin actually has a username and is active — visit
     `/api/debug/session` while logged in, or run in Supabase SQL:
     `select username, role_id, is_active from profiles where role_id='super_admin';`
  3. If your super admin was blocked or lost its username, restore it:
     `update profiles set is_active = true where role_id = 'super_admin';`
     (and set a username if it's null:
     `update profiles set username='your-choice' where email='your@email.com';`)

**A button says "Session expired" or "unauthorized" even though you just
logged in.** Open **`/api/debug/session`** in your browser. It tells you
whether the `app_session` cookie exists, whether it verifies, and your
resolved role — which pinpoints the cause (not logged in, cookie not
reaching the server, secret changed between build and runtime, or the
account was blocked). In production this route is Super-Admin-only.

**No questions, no categories, and no way to generate an exam.** These
all share one root cause: questions were never successfully imported.
Open `/admin/questions` — if it's empty, import your bank on
`/admin/import` and check the import report for how many actually
imported (vs were skipped). Categories are auto-created from your Excel
sheet tabs during import, so "no categories" also means "import hasn't
succeeded yet." Once questions exist, generate/preview an exam with the
"▶ Preview This Exam" button on `/admin/exam-settings` (admins don't see
the trainee Home page's Start button — see section 9c).

**Exam settings "not working."** Check the colored box at the top of
`/admin/exam-settings`: if it's red, it tells you exactly why an exam
can't be built yet (usually not enough active questions, or more
always-include questions than the total size). Settings save fine; the
box reflects whether the current question bank can satisfy them.

**Excel import shows many "incomplete / missing option" errors.** See
section 7 — some are genuinely open-ended questions in your source that
have no A/B/C/D options and can't become multiple-choice; others can be
a formatting quirk the parser can't read. The report now names exactly
what's missing per row so you can fix the source spreadsheet and
re-import.

**"Application error: a client-side exception has occurred" / console
shows "Content Security Policy ... blocks the use of eval".** This comes
from the decorative 3D turbine on the Home page — the WebGL/three.js
library it uses compiles shaders in a way that a strict Content Security
Policy (usually injected by a browser extension or a corporate network,
not by this app) blocks. The Home page now wraps that 3D graphic in an
error boundary, so if it's blocked it silently falls back to a static
panel and the app keeps working — it should no longer crash the page.
If you still see this after deploying the latest build, test the site in
an incognito window with extensions disabled to confirm whether an
extension is the source. The exam-taking pages (`/exam`, `/result`)
never used 3D, so the actual exam flow was never affected regardless.

## 13. Known limitations

- **Fixed (read if you have an older copy of this project):** `lib/codeSession.ts` previously used Node's built-in `crypto` module (`createHmac`, `timingSafeEqual`) and `Buffer`. Those are unavailable in Vercel's **Edge Runtime**, which is what `middleware.ts` runs on by default — this would have broken access-code login (and possibly the whole middleware) once deployed to Vercel, even though it worked fine in local `npm run dev`. It now uses the Web Crypto API (`crypto.subtle`) instead, which works identically in both the Edge Runtime and Node.js 20+. This is also why Node 20 LTS is a hard requirement, not just a suggestion — see section 3.1 of `INSTALL_GUIDE.md`.

- Permission overrides (`user_permissions`) are SQL-only — no admin UI yet.
- The "Preview Theme" button in the theme editor shows a sample card/button, not a full live page preview — open the relevant user's Home/Exam page in another tab after saving for a true preview.
- Background-video bandwidth isn't adaptive; keep files reasonably small (well under the 80MB cap) for trainees on slow connections.
- In "Fixed Category Rules" mode, if category rule totals don't match "Total Exam Questions," the engine trims/tops up randomly to hit the exact total — the resulting category balance may drift slightly from your rules. Switch to "Auto-Distribute" if exact total size matters more than exact per-category counts.
- `default_questions_per_category` is only used as a baseline in "Auto-Distribute" mode; it has no effect in "Fixed Category Rules" mode (that mode uses `category_rules.questions_to_take` per category instead).


## 13. AI Knowledge Trainer & AI Question Generator (v4.13–v4.14)

A continuous practice mode at `/trainer` (linked from the home page)
and an admin batch generator at Admin → AI Question Generator. Questions
are generated by the Anthropic Claude API **using its built-in web
search**. Written source URLs are **required and server-enforced**: each
URL is verified against the URLs Claude actually returned from its web
search / citation results, and the admin import route rejects (HTTP 400)
any question lacking a valid written-source URL — nothing is imported
with empty sources. Video links are optional (real YouTube/Vimeo video
pages only; empty is fine). Requires one env var (`ANTHROPIC_API_KEY`)
and one SQL run — full details in **AI_TRAINER_SETUP.md**.
