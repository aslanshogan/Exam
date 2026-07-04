# Unit Function Exam — Web App

Modern training/exam web app (Next.js + TypeScript + Supabase + Tailwind),
replacing the original Excel-based exam. v2 adds 4 user roles (Super Admin,
Question Manager, Exam Reviewer, Trainee), real login (email/password or
access codes), and per-user personalization (colors, background image/video,
music).

**Start here → [SETUP.md](./SETUP.md)** for full install, Supabase schema,
roles/permissions, personalization, Excel import, Vercel deployment, and a
complete testing checklist.

**Never used Node.js/Git/Supabase/Vercel before?** Use
[INSTALL_GUIDE.md](./INSTALL_GUIDE.md) instead — same information, but
written as an exact, step-by-step, beginner-friendly walkthrough with no
assumed knowledge.

Quick start (requires Node.js **20+** — see `package.json` → `engines`):
```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase keys
npm run dev
```
Then see SETUP.md section 2 ("Bootstrapping the first Super Admin") — you
need that one manual step before you can log in for the first time.
