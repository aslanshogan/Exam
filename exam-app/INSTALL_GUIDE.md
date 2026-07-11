# Unit Function Exam App — Complete Beginner Installation Guide

> **IMPORTANT UPDATE — login changed to username-only.** This guide's
> installation steps (unzip, Node.js, Supabase project, env variables,
> GitHub/Vercel) are still correct, but anything below about
> email+password login, "Auto Confirm User", access codes, or the
> "bootstrap the first Super Admin" SQL is now OBSOLETE. There are no
> passwords anymore: the very first time you open `/login`, the app
> shows a **First-Time Setup** screen that creates your Super Admin
> account right in the browser — no SQL. After that you add everyone
> else from Admin → Users. Full details: **SETUP.md section 2**. Also
> note the env variable `ACCESS_CODE_SECRET` is now called
> `APP_SESSION_SECRET` (the old name still works as a fallback).

This guide assumes you have never used Node.js, Git, Supabase, or Vercel
before. Every command is exact. Every step tells you which folder you
need to be in. Follow it top to bottom.

**A note before you start:** I inspected the project files directly.
Confirmed facts used in this guide:
- It's a **Next.js 14.2.5** app (React 18.3.1 + TypeScript 5.5.4)
- It uses **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) for the
  database, login, and file storage
- Styling is **Tailwind CSS**
- There is no `yarn.lock` or `pnpm-lock.yaml` in the project — only
  `package.json` — so it's built to be installed with **npm**
- While checking the database file (`supabase/schema.sql`) for this
  guide, I found that 30 security-policy statements would have failed
  if you ever ran the file a second time on the same database. **I
  fixed this** — every policy now has a matching "remove old version
  first" line, so the whole file is genuinely safe to run as many
  times as you want. The corrected file is in the project zip linked
  at the end of this guide.

---

## Table of Contents
1. [Unzip the project](#1-unzip-the-project)
2. [Open the project folder in a terminal](#2-open-the-project-folder-in-a-terminal)
3. [Install the required software](#3-install-the-required-software)
4. [Run the project locally](#4-run-the-project-locally)
5. [Set up Supabase](#5-set-up-supabase)
6. [Test the new exam-configuration features](#6-test-the-new-exam-configuration-features)
7. [Deploy to GitHub and Vercel](#7-deploy-to-github-and-vercel)
8. [Common errors and fixes](#8-common-errors-and-fixes)
9. [Final checklists](#9-final-checklists)

---

## 1. Unzip the project

You have a file called `unit-function-exam-app-v3.zip`.

**On Windows:**
1. Find the zip file in your **Downloads** folder (or wherever you saved it).
2. Right-click it → **Extract All...**
3. Choose a simple destination you'll remember, for example: `C:\Projects\`
4. Click **Extract**.
5. You will now have a folder: `C:\Projects\exam-app`

**On Mac:**
1. Find the zip file in **Downloads**.
2. Double-click it. macOS automatically creates a folder named `exam-app` next to it.
3. Drag that `exam-app` folder somewhere you'll remember, e.g. your home folder.

From here on, "the project folder" means this `exam-app` folder.

---

## 2. Open the project folder in a terminal

**On Windows (CMD):**
1. Open the `exam-app` folder in File Explorer so you can see its contents (you should see files like `package.json`, `README.md`, folders like `app`, `lib`, `supabase`).
2. Click once on the address bar at the top of File Explorer (where the folder path is shown).
3. Type `cmd` and press **Enter**.
4. A black Command Prompt window opens, already inside the `exam-app` folder.
5. Confirm by typing:
   ```
   dir
   ```
   You should see `package.json` listed. If you see that, you're in the right place.

**On Mac (Terminal):**
1. Open the **Terminal** app (press Cmd+Space, type "Terminal", press Enter).
2. Type `cd ` (with a space after it), then drag the `exam-app` folder from Finder into the Terminal window — it will paste the full path automatically.
3. Press **Enter**.
4. Confirm by typing:
   ```
   ls
   ```
   You should see `package.json` listed.

**From this point on, every command in this guide must be run with this same terminal window, inside the `exam-app` folder, unless I say otherwise.**

---

## 3. Install the required software

Install these in order, before touching the project again.

### 3.1 Node.js (required)
This project needs **Node.js version 20 (LTS) or newer** — install exactly
this, don't substitute an older version. (Technical reason, in case you're
curious: the login system uses the standard Web Crypto API so the same
code works both locally and on Vercel's Edge Runtime. That API is only
guaranteed to be available without extra flags from Node 19 onward, so
Node 20 LTS is the safe floor, not just a suggestion.)

1. Go to **https://nodejs.org**
2. Download the version labeled **LTS** (currently 20.x).
3. Run the installer, click Next through all the default options.
4. **Restart your computer** after installing (this guarantees Windows
   picks up the new PATH settings — skipping this is the #1 cause of
   "node is not recognized" errors).
5. Open a **new** CMD/Terminal window (not the old one) and check it worked:
   ```
   node -v
   ```
   You should see something like `v20.x.x`. Then check npm (it installs
   automatically with Node):
   ```
   npm -v
   ```
   You should see something like `10.x.x`.

### 3.2 Git (only needed for step 7, deploying to GitHub/Vercel)
You don't need this to run the app on your own computer. You DO need
it to upload the project to GitHub later.

1. Go to **https://git-scm.com/downloads**
2. Download and install for your operating system (default options are fine).
3. Restart your terminal, then check it worked:
   ```
   git --version
   ```
   You should see something like `git version 2.4x.x`.

### 3.3 Supabase account (required)
This is the database/login service the app depends on — the app will
not run at all without it.

1. Go to **https://supabase.com**
2. Click **Start your project** / **Sign Up** and create a free account
   (you can sign up with GitHub or email).
3. Once logged in, click **New Project**.
4. Give it a name (e.g. "unit-function-exam"), set a database password
   (write this down somewhere safe — it's different from your Supabase
   login password), pick the region closest to you, and click
   **Create new project**.
5. Wait 1–2 minutes while Supabase sets it up.

### 3.4 Vercel account (only needed for step 7, deploying online)
1. Go to **https://vercel.com**
2. Click **Sign Up**, and choose **Continue with GitHub** (this makes
   step 7 much easier later — use the same GitHub account you'll push
   your code to).

---

## 4. Run the project locally

Make sure your terminal is still open **inside the `exam-app` folder**
(see step 2). Every command below assumes that.

### 4.1 Install dependencies
```
npm install
```
This downloads everything the project needs into a new `node_modules`
folder. It can take 1–3 minutes and will print a lot of text — that's
normal. Wait until you see your cursor blink on an empty line again.

### 4.2 Create your `.env.local` file
This project reads its Supabase connection details from a file called
`.env.local`, which does **not** come with the zip (it contains secrets,
so it's deliberately left out). A template is provided.

**On Windows (CMD):**
```
copy .env.local.example .env.local
```
**On Mac (Terminal):**
```
cp .env.local.example .env.local
```

Now open `.env.local` in a text editor (right-click → Open with →
Notepad on Windows, or any code editor like VS Code/Notepad). You'll
fill in the 4 values inside it in step 5 — leave it open for now.

### 4.3 Generate the one secret value you create yourself
One of the 4 values (`ACCESS_CODE_SECRET`) isn't from Supabase — it's a
random password you make up. Generate a secure one with this command
(it works because Node.js is already installed):
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
This prints a long random string like `a93f...e21c`. Copy it and paste
it into `.env.local` as the value for `ACCESS_CODE_SECRET`. Keep the
other 3 values as placeholders for now — you'll fill them in step 5.

### 4.4 Run the database schema
You can't do this yet — it has to be run **inside Supabase**, not in
your terminal. Skip ahead to **section 5** now, then come back here.

### 4.5 Start the app locally
Once `.env.local` is fully filled in (after section 5):
```
npm run dev
```
Wait for a line that says something like:
```
- Local: http://localhost:3000
```
Open your web browser and go to **http://localhost:3000**. You should
see the "Unit Function Exam" home page.

To stop the app later, click into the terminal window and press
**Ctrl+C**.

---

## 5. Set up Supabase

### 5.1 Find your Project URL and keys
1. In your Supabase project, click the **gear/Settings icon** in the
   bottom-left sidebar → **API**.
2. You'll see a section called **Project URL** — copy it. Paste it into
   `.env.local` as the value for `NEXT_PUBLIC_SUPABASE_URL`.
3. Below that, **Project API keys**, you'll see two keys:
   - **`anon` `public`** → copy this into `.env.local` as
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - **`service_role`** (click "Reveal" to see it — keep this one
     secret, never share it or put it in a public place) → copy this
     into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`.

Your `.env.local` should now have all 4 values filled in, with no
quotes around them, looking like this (values shortened for example):
```
NEXT_PUBLIC_SUPABASE_URL=https://abcxyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
ACCESS_CODE_SECRET=a93f7e0c2b...
```
Save the file.

### 5.2 Run `supabase/schema.sql`
This creates every table, security rule, and starter setting the app needs.

1. In Supabase, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. On your computer, open the file `supabase/schema.sql` from inside
   the project folder (any text editor), select all the text
   (Ctrl+A / Cmd+A), and copy it (Ctrl+C / Cmd+C).
4. Paste it into the Supabase SQL Editor box.
5. Click **Run** (bottom-right, or Ctrl+Enter).
6. You should see "Success. No rows returned" (or similar). If you see
   a red error instead, see section 8.

**Is it safe to run this more than once?** Yes. Every single statement
in this file is written so that re-running it does nothing destructive
— it either says "create this only if it doesn't already exist," or
(for the security rules) "remove the old version first, then recreate
it." You can paste and run the whole file again any time without
fear of duplicating or breaking anything.

### 5.3 Create your first Super Admin (you, the owner)
There's no signup form for this — you have to create the very first
admin account by hand, once.

1. In Supabase, click **Authentication** in the left sidebar → **Users**.
2. Click **Add user** → **Create new user**.
3. Enter your email and a password, and **check the box** that says
   something like "Auto Confirm User" (so you don't need to click an
   email confirmation link). Click **Create user**.
4. Go back to **SQL Editor** → **New query**, paste this in (replace
   `you@example.com` with the exact email you just used, and `Your Name`
   with whatever name you want shown in the app):
   ```sql
   insert into profiles (auth_user_id, email, display_name, role_id, is_active)
   select id, email, 'Your Name', 'super_admin', true
   from auth.users where email = 'you@example.com';

   insert into exam_access (user_id, allowed_to_take)
   select id, true from profiles where email = 'you@example.com';
   ```
5. Click **Run**.

### 5.4 Now go back and finish step 4
Back in your terminal (still inside `exam-app`), run:
```
npm run dev
```
Open **http://localhost:3000**, click **Sign In**, and log in with the
email and password you just created. You should land on `/admin`.

---

## 6. Test the new exam-configuration features

Do these in order, while logged in as your Super Admin account from 5.3.

### 6.1 Always-include and active questions (`/admin/questions`)
1. Go to **http://localhost:3000/admin/questions**.
2. Pick any existing question and click **Edit**.
3. Tick the checkbox **"Always include in every exam"**, click **Save Changes**.
4. Do this for 4 more questions (5 total).
5. Use the filter dropdown above the table and choose **"Always Included Questions"** — confirm exactly those 5 appear.
6. Switch the filter to **"Inactive Questions"** — should be empty unless you've deactivated any.
7. Edit one question and untick **"Active question"**, save. Switch the filter to "Inactive Questions" again — confirm it now shows that one question.

### 6.2 Exam settings and validation (`/admin/exam-settings`)
1. Go to **http://localhost:3000/admin/exam-settings**.
2. At the top you'll see a green or red box — this is the live
   validation preview. With 5 pinned questions and a sensible total
   (e.g. 50), it should say **"This configuration can build a full exam."**
3. Change **Total Exam Questions** to `30`, don't save yet — watch the
   box update instantly to show "Random fill needed: 25" (30 − 5 pinned = 25).
4. Click **Save Exam Settings**.
5. Now change **Total Exam Questions** to `3` (fewer than your 5 pinned
   questions) and click Save. The box should turn red and show exactly
   this message: **"Too many always-include questions. Total exam size
   is smaller than mandatory questions."** This confirms the validation works.
6. Set **Total Exam Questions** back to `30` (or `50`) before continuing.

### 6.3 Generate a real exam and confirm the numbers
1. Log out (top-right "Log Out"), and log in as (or create, via
   `/admin/users`) a **Trainee** account.
2. On the Home page, click **Start Exam**.
3. Click through to the end — count the questions shown ("Question 1
   of 30," etc.) — it should exactly match what you set in 6.2.
4. As Super Admin, check `/admin/results` afterward — the attempt should
   be there with the correct total.

### 6.4 Retake settings (global switch + per-trainee switch)
1. As Super Admin, go to `/admin/exam-settings` and make sure **"Allow
   retakes (global master switch)"** is **OFF**. Save.
2. Go to `/admin/users` → click that trainee → **Exam Access** tab →
   turn **"Allow retake"** ON for them personally → Save.
3. Log in as that trainee and try **Start Exam** again (after they've
   already completed one). It should be **blocked** — because the
   global switch is off, the personal setting doesn't matter.
4. Now go back to `/admin/exam-settings`, turn the global switch **ON**,
   save. Try Start Exam as the trainee again — it should now be **allowed**.

### 6.5 Trainee result page answer review
1. As Super Admin, go to `/admin/exam-settings`, turn **"Show correct
   answers / explanations to trainee"** ON, save.
2. Log in as the trainee, finish (or revisit) their result page —
   you should now see a full "Answer Review" list at the bottom showing
   each question, their answer, and the correct answer.
3. Turn that setting back OFF, save, and confirm the review section
   disappears for the trainee (admins still always see full detail on
   `/admin/results/[id]` regardless of this setting).

---

## 7. Deploy to GitHub and Vercel

Do this from the same terminal, inside the `exam-app` folder.

### 7.1 One-time Git setup (skip if you've used Git before)
```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 7.2 Create the GitHub repository
1. Go to **https://github.com** and log in.
2. Click the **+** icon (top-right) → **New repository**.
3. Name it (e.g. `unit-function-exam`), leave it **Private** (recommended,
   since this contains a real training system), do **not** check "Add a README" — leave everything else default.
4. Click **Create repository**. Keep this page open — you'll need the URL shown under "...or push an existing repository from the command line."

### 7.3 Upload the project
Still inside the `exam-app` folder in your terminal:
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/unit-function-exam.git
git push -u origin main
```
Replace the URL on the `git remote add origin` line with the exact URL
GitHub showed you in step 7.2. If a browser window pops up asking you
to log into GitHub, do so.

**Important:** `.env.local` is deliberately excluded from this upload
(see `.gitignore` in the project) — your secret keys never get pushed
to GitHub. You'll re-enter them directly in Vercel in the next step.

### 7.4 Connect the repo to Vercel
1. Go to **https://vercel.com** and log in (with GitHub).
2. Click **Add New...** → **Project**.
3. Find your `unit-function-exam` repo in the list and click **Import**.
4. Vercel auto-detects Next.js — leave the build settings as default.

### 7.5 Add environment variables in Vercel
1. Before clicking Deploy, find the **Environment Variables** section
   on the same import screen (or afterward: **Project → Settings →
   Environment Variables**).
2. Add all 4, one at a time — same names and values as your local `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ACCESS_CODE_SECRET`
3. Click **Deploy**.
4. Wait 1–3 minutes. When it finishes, click **Visit** to open your live app.

### 7.6 Allow your live domain to log in
1. Copy the `https://your-project.vercel.app` URL Vercel gave you.
2. In Supabase: **Authentication → URL Configuration**.
3. Add that URL to **Site URL** and to **Redirect URLs**. Save.

### 7.7 Redeploying after you make changes
Any time you edit project files locally and want those changes live:
```
git add .
git commit -m "describe what you changed"
git push
```
Vercel automatically detects the push and redeploys within a minute or
two — no extra steps needed. You can watch progress on vercel.com under
your project's **Deployments** tab.

---

## 8. Common errors and fixes

**`npm install` fails / shows red errors**
- Make sure you're inside the `exam-app` folder (`dir` or `ls` should show `package.json`).
- Delete the `node_modules` folder and the `package-lock.json` file if present, then run `npm install` again.
- Check your internet connection — npm needs to download packages.
- If you see permission errors on Mac, try closing and reopening Terminal rather than using `sudo`.

**`'node' is not recognized as an internal or external command`**
- Node.js isn't installed, or your computer hasn't picked up the install yet.
- Reinstall from nodejs.org, then **restart your computer** (not just the terminal), then open a brand-new CMD window and try `node -v` again.

**".env.local missing" or the app says it can't find Supabase settings**
- The file must be named exactly `.env.local` — not `.env.local.txt` and not `env.local`. On Windows, File Explorer may hide the real extension; in CMD, run `dir /a` inside the folder to see the true filename.
- It must sit directly inside `exam-app`, next to `package.json` — not inside `app/` or any subfolder.
- After creating or editing it, you must **restart** `npm run dev` (stop with Ctrl+C, run `npm run dev` again) — environment variables are only read when the server starts.

**Supabase keys wrong (login fails, blank/broken pages, "Invalid API key")**
- Go back to Supabase → Settings → API and re-copy the Project URL and both keys exactly — no extra spaces, no quotation marks.
- Make sure you copied the **anon/public** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the **service_role** key into `SUPABASE_SERVICE_ROLE_KEY` — swapping these causes confusing permission errors.

**Vercel build fails**
- Click into the failed deployment → **View Build Logs** to see the actual error.
- The most common cause is a missing or misspelled environment variable — recheck all 4 names exactly match (case-sensitive) under Project → Settings → Environment Variables, then redeploy (Deployments tab → "..." menu → Redeploy).

**"relation does not exist" / database table missing**
- This means `supabase/schema.sql` was never run, or was run against a different Supabase project than the one in your `.env.local`.
- Double-check the `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` matches the project you ran the SQL in (Settings → API → Project URL).
- Re-run the entire `supabase/schema.sql` file in that project's SQL Editor — it's safe to run again (see section 5.2).

**App opens fine, but clicking "Start Exam" fails or shows an error**
- Log in as Super Admin and check `/admin/exam-settings` — the colored box at the top will tell you exactly what's missing (not enough active questions, a category running short, or too many pinned questions for the total size).
- Check `/admin/questions` — make sure you have enough **Active** questions overall, and per category if using "Fixed Category Rules" mode.
- Make sure the trainee account has `allowed_to_take` turned on (`/admin/users` → that user → Exam Access tab).

---

## 9. Final checklists

### Local install checklist
- [ ] Unzipped the project — folder is named `exam-app`
- [ ] Opened a terminal **inside** `exam-app` (confirmed with `dir`/`ls` showing `package.json`)
- [ ] Installed Node.js 20 LTS, restarted computer, confirmed with `node -v` and `npm -v`
- [ ] Ran `npm install` inside `exam-app` with no red errors
- [ ] Copied `.env.local.example` to `.env.local`
- [ ] Generated `ACCESS_CODE_SECRET` with the `node -e ...` command and pasted it in
- [ ] Filled in all 4 values in `.env.local` (after completing the Supabase checklist below)
- [ ] Ran `npm run dev` and successfully opened `http://localhost:3000`
- [ ] Logged in successfully as Super Admin

### Supabase checklist
- [ ] Created a free Supabase account and a new project
- [ ] Copied Project URL into `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Copied the `anon` `public` key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Revealed and copied the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Ran the full `supabase/schema.sql` file once in the SQL Editor with no red errors
- [ ] Created one user under Authentication → Users (with "Auto Confirm" checked)
- [ ] Ran the two `insert into profiles ... / insert into exam_access ...` statements to make that user Super Admin
- [ ] Confirmed login works locally with that account

### Vercel deployment checklist
- [ ] Installed Git, set `user.name` / `user.email`
- [ ] Created a private GitHub repository
- [ ] Ran `git init`, `add`, `commit`, `branch -M main`, `remote add origin`, `push -u origin main`
- [ ] Confirmed `.env.local` was NOT uploaded to GitHub (it's git-ignored)
- [ ] Imported the repo into a new Vercel project
- [ ] Added all 4 environment variables in Vercel before/after first deploy
- [ ] Deployment succeeded — visited the live `.vercel.app` URL
- [ ] Added the live URL to Supabase Authentication → URL Configuration (Site URL + Redirect URLs)
- [ ] Logged in successfully on the live site
- [ ] Confirmed `git push` after a future change triggers an automatic redeploy
