-- =====================================================================
-- UNIT FUNCTION EXAM — SUPABASE SCHEMA (v2)
-- Adds: roles, profiles (Supabase-Auth backed), user_permissions,
--       user_theme_settings (colors + background video/image + music),
--       exam_access (per-user exam permission / attempts / codes),
--       audit_logs.
--
-- This SUPERSEDES the v1 schema (kept at schema_v1_original.sql.bak for
-- reference). Run this on a FRESH Supabase project. If you already ran
-- v1 in production, see the "MIGRATING FROM v1" notes at the bottom
-- before running this file.
-- =====================================================================

create extension if not exists "uuid-ossp";

-- =====================================================================
-- ROLES — fixed lookup table of the 4 roles in the system
-- =====================================================================
create table if not exists roles (
  id text primary key,            -- 'super_admin' | 'question_manager' | 'exam_reviewer' | 'trainee'
  label text not null,
  description text
);
insert into roles (id, label, description) values
  ('super_admin', 'Super Admin', 'Full access to everything: users, questions, results, settings, themes.'),
  ('question_manager', 'Question Manager', 'Manage questions, categories, and Excel import.'),
  ('exam_reviewer', 'Exam Reviewer', 'View and export exam results. Cannot edit questions or manage users.'),
  ('trainee', 'Trainee', 'Takes the exam. Can see own score only.')
on conflict (id) do nothing;

-- =====================================================================
-- PROFILES — one row per Supabase Auth user
-- =====================================================================
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  username text,
  full_name text,
  role_id text not null default 'trainee' references roles(id),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_auth_user on profiles(auth_user_id);
create index if not exists idx_profiles_role on profiles(role_id);

-- =====================================================================
-- USERNAME-ONLY LOGIN SUPPORT (v4)
-- Login is by username alone — no Supabase Auth account needed. The
-- auth_user_id column is kept only for backward compatibility with
-- accounts created under the old email/password system; new users
-- have auth_user_id = NULL. Idempotent guards below make re-running
-- this file safe on an existing database.
-- =====================================================================
alter table profiles add column if not exists username text;
alter table profiles add column if not exists full_name text;
alter table profiles alter column email drop not null;
-- Case-insensitive uniqueness: 'Aslan' and 'aslan' are the same user.
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));
-- Backfill full_name from display_name for pre-existing rows.
update profiles set full_name = display_name where full_name is null;

-- =====================================================================
-- USER PERMISSIONS — optional fine-grained overrides on top of role
-- e.g. let a specific Question Manager also manage users, without
-- promoting them all the way to Super Admin.
-- Recognized permission_key values:
--   'manage_users', 'manage_questions', 'manage_results', 'manage_themes'
-- =====================================================================
create table if not exists user_permissions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  permission_key text not null,
  allowed boolean not null default true,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, permission_key)
);

-- =====================================================================
-- EXAM ACCESS — per-trainee exam permission, attempt limits, and an
-- optional access code / invite token for code-based entry (no email
-- login required for that trainee).
-- =====================================================================
create table if not exists exam_access (
  user_id uuid primary key references profiles(id) on delete cascade,
  allowed_to_take boolean not null default true,
  allow_retake boolean not null default false,
  max_attempts int not null default 1,
  attempts_used int not null default 0,
  access_code text unique,
  invite_token uuid not null default uuid_generate_v4(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- USER THEME SETTINGS — full personalization: colors + background
-- image/video + music, per user. One optional row with user_id = NULL
-- acts as the GLOBAL DEFAULT theme (shown on the public Home page and
-- to any user without a personal theme override).
-- =====================================================================
create table if not exists user_theme_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique references profiles(id) on delete cascade,

  background_color text not null default '#0B1E33',
  accent_color text not null default '#00C389',
  card_color text not null default '#FFFFFF',
  button_color text not null default '#00C389',
  text_color text not null default '#0B1E33',

  background_image_url text,

  background_video_url text,
  background_video_enabled boolean not null default false,
  background_video_muted boolean not null default true,
  background_video_loop boolean not null default true,

  music_url text,
  music_enabled boolean not null default false,
  music_autoplay boolean not null default true,
  music_loop boolean not null default true,
  music_volume int not null default 50 check (music_volume between 0 and 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Only one global-default row (user_id IS NULL) allowed
create unique index if not exists idx_theme_one_default
  on user_theme_settings ((user_id is null)) where (user_id is null);

insert into user_theme_settings (user_id, background_color, accent_color, card_color, button_color, text_color)
select null, '#0B1E33', '#00C389', '#FFFFFF', '#00C389', '#0B1E33'
where not exists (select 1 from user_theme_settings where user_id is null);

-- =====================================================================
-- AUDIT LOGS
-- =====================================================================
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references profiles(id) on delete set null,
  action text not null,            -- e.g. 'user_created', 'role_changed', 'question_added'
  target_type text,                -- e.g. 'profile', 'question', 'exam_attempt', 'theme'
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on audit_logs(created_at desc);
create index if not exists idx_audit_actor on audit_logs(actor_user_id);

-- =====================================================================
-- CATEGORIES / QUESTIONS / CATEGORY_RULES / APP_SETTINGS
-- (unchanged from v1 — included here so this file is a complete,
-- standalone schema)
-- =====================================================================
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references categories(id) on delete cascade,
  question_text text not null,
  answer_a text not null,
  answer_b text not null,
  answer_c text not null,
  answer_d text not null,
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanation text,
  active boolean not null default true,
  always_include boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Idempotent guard in case this is re-run against a database that
-- already had the v1/v2 `questions` table without this column.
alter table questions add column if not exists always_include boolean not null default false;
create index if not exists idx_questions_category on questions(category_id);
create index if not exists idx_questions_active on questions(active);
create index if not exists idx_questions_always_include on questions(always_include) where always_include = true;

create table if not exists category_rules (
  category_id uuid primary key references categories(id) on delete cascade,
  questions_to_take int not null default 2
);

-- app_settings now ONLY holds the global music kill-switch.
-- passing_score / show_explanations_to_trainee / total_questions moved
-- to exam_settings below (kept here as deprecated, unused columns for
-- backward compatibility with any v2 deployment that already ran this
-- file — safe to drop manually once you've confirmed nothing reads them).
create table if not exists app_settings (
  id int primary key default 1,
  passing_score numeric not null default 0.80,
  show_explanations_to_trainee boolean not null default false,
  total_questions int not null default 50,
  music_globally_enabled boolean not null default true,
  constraint single_row check (id = 1)
);
insert into app_settings (id, passing_score, show_explanations_to_trainee, total_questions, music_globally_enabled)
values (1, 0.80, false, 50, true)
on conflict (id) do nothing;

-- =====================================================================
-- EXAM SETTINGS — the authoritative table for exam-building behavior.
-- Single row (id = 1), managed exclusively by Super Admin at
-- /admin/exam-settings.
-- =====================================================================
create table if not exists exam_settings (
  id int primary key default 1,
  total_questions int not null default 50 check (total_questions > 0),
  pass_score numeric not null default 0.80 check (pass_score >= 0 and pass_score <= 1),
  default_questions_per_category int not null default 2 check (default_questions_per_category >= 0),
  selection_mode text not null default 'fixed_category_rules'
    check (selection_mode in ('fixed_category_rules', 'auto_distribute')),
  randomize_question_order boolean not null default true,
  include_always_questions boolean not null default true,
  allow_retake boolean not null default false,
  show_result_to_trainee boolean not null default true,
  show_correct_answers_to_trainee boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint exam_settings_single_row check (id = 1)
);
insert into exam_settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
-- EXAM ATTEMPTS / QUESTIONS / ANSWERS
-- attempt rows now reference profiles(id) directly (every trainee has
-- a profile once they have an account, including code-based trainees)
-- =====================================================================
create table if not exists exam_attempts (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  trainee_name text not null,        -- snapshot, in case profile is later renamed/deleted
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  score_percent numeric,
  correct_count int,
  wrong_count int,
  pass_fail text check (pass_fail in ('PASS','FAIL')),
  status text not null default 'in_progress' check (status in ('in_progress','completed'))
);
create index if not exists idx_attempts_profile on exam_attempts(profile_id);
create index if not exists idx_attempts_status on exam_attempts(status);
create index if not exists idx_attempts_started on exam_attempts(started_at desc);

-- Admin exam previews (Super Admin taking the exam to test it) are
-- flagged so they can be excluded from / labelled distinctly in trainee
-- statistics. Guarded so schema.sql stays re-runnable.
alter table exam_attempts add column if not exists is_preview boolean not null default false;

-- ---------------------------------------------------------------------
-- EXAM ATTEMPT QUESTIONS — a SNAPSHOT of each question as it appeared
-- at exam time, not a live reference. question_id is kept ONLY as an
-- optional traceability link back to the live question (nullable,
-- ON DELETE SET NULL) — nothing in the app ever relies on it for
-- DISPLAYING a past exam; every field needed to show the question,
-- options, correct answer, and explanation is duplicated here at
-- insert time. This is deliberate: it means editing, deactivating, or
-- deleting a question later (or replacing the whole question bank)
-- can NEVER break, corrupt, or block deletion of a past exam result.
-- ---------------------------------------------------------------------
create table if not exists exam_attempt_questions (
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_number int not null,
  question_id uuid references questions(id) on delete set null,
  category_name text not null,
  question_text text not null,
  answer_a text not null,
  answer_b text not null,
  answer_c text not null,
  answer_d text not null,
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanation text,
  primary key (attempt_id, question_number)
);
create index if not exists idx_eaq_attempt on exam_attempt_questions(attempt_id);

-- ---------------------------------------------------------------------
-- EXAM ANSWERS — keyed by (attempt_id, question_number), NOT
-- question_id. question_number is the stable identifier for "the Nth
-- question of THIS attempt" and is defined the moment the attempt is
-- created (see exam_attempt_questions above) — it never depends on the
-- live questions table, so recording or reading an answer is
-- completely unaffected by anything happening to the question bank.
-- ---------------------------------------------------------------------
create table if not exists exam_answers (
  attempt_id uuid not null,
  question_number int not null,
  selected_answer text check (selected_answer in ('A','B','C','D')),
  answered_at timestamptz default now(),
  primary key (attempt_id, question_number),
  foreign key (attempt_id, question_number)
    references exam_attempt_questions(attempt_id, question_number) on delete cascade
);
create index if not exists idx_answers_attempt on exam_answers(attempt_id);

create or replace function increment_attempts_used(p_user_id uuid) returns void as $$
  update exam_access set attempts_used = attempts_used + 1, updated_at = now() where user_id = p_user_id;
$$ language sql security definer;

-- =====================================================================
-- EXAM TEMPLATES — "give the same exam to multiple trainees." A
-- Super Admin generates ONE question set (using the normal engine —
-- same always-include + selection-mode logic as everything else), it's
-- snapshotted here exactly like exam_attempt_questions, and then
-- assigned to one or more trainees via exam_access.assigned_template_id.
-- When an assigned trainee clicks Start Exam, they get THIS exact
-- question set instead of a fresh random one (see /api/exam/start).
-- =====================================================================
create table if not exists exam_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  shuffle_order_per_trainee boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists exam_template_questions (
  template_id uuid not null references exam_templates(id) on delete cascade,
  question_number int not null,
  question_id uuid references questions(id) on delete set null,
  category_name text not null,
  question_text text not null,
  answer_a text not null,
  answer_b text not null,
  answer_c text not null,
  answer_d text not null,
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanation text,
  primary key (template_id, question_number)
);
create index if not exists idx_etq_template on exam_template_questions(template_id);

-- Points a trainee at a specific template instead of fresh-random
-- generation. NULL (the default) = normal random behavior, unchanged.
alter table exam_access add column if not exists assigned_template_id uuid references exam_templates(id) on delete set null;

-- =====================================================================
-- HELPER FUNCTIONS — role & permission checks (used by RLS policies)
-- =====================================================================
create or replace function my_profile() returns profiles as $$
  select * from profiles where auth_user_id = auth.uid();
$$ language sql security definer stable;

create or replace function my_role() returns text as $$
  select role_id from profiles where auth_user_id = auth.uid();
$$ language sql security definer stable;

create or replace function has_override(perm text) returns boolean as $$
  select exists (
    select 1 from user_permissions up
    join profiles p on p.id = up.user_id
    where p.auth_user_id = auth.uid() and up.permission_key = perm and up.allowed = true
  );
$$ language sql security definer stable;

create or replace function is_super_admin() returns boolean as $$
  select my_role() = 'super_admin';
$$ language sql security definer stable;

create or replace function can_manage_users() returns boolean as $$
  select is_super_admin() or has_override('manage_users');
$$ language sql security definer stable;

create or replace function can_manage_questions() returns boolean as $$
  select my_role() in ('super_admin', 'question_manager') or has_override('manage_questions');
$$ language sql security definer stable;

create or replace function can_review_results() returns boolean as $$
  select my_role() in ('super_admin', 'exam_reviewer') or has_override('manage_results');
$$ language sql security definer stable;

create or replace function can_manage_themes() returns boolean as $$
  select is_super_admin() or has_override('manage_themes');
$$ language sql security definer stable;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table profiles enable row level security;
alter table user_permissions enable row level security;
alter table exam_access enable row level security;
alter table user_theme_settings enable row level security;
alter table audit_logs enable row level security;
alter table categories enable row level security;
alter table questions enable row level security;
alter table category_rules enable row level security;
alter table app_settings enable row level security;
alter table exam_settings enable row level security;
alter table exam_attempts enable row level security;
alter table exam_attempt_questions enable row level security;
alter table exam_templates enable row level security;
alter table exam_template_questions enable row level security;
alter table exam_answers enable row level security;

-- ---- profiles -----------------------------------------------------
drop policy if exists "profiles_self_read" on profiles;
create policy "profiles_self_read" on profiles for select
  using (auth_user_id = auth.uid() or can_manage_users());
drop policy if exists "profiles_admin_write" on profiles;
create policy "profiles_admin_write" on profiles for all
  using (can_manage_users()) with check (can_manage_users());

-- ---- user_permissions ----------------------------------------------
drop policy if exists "perms_super_admin_only" on user_permissions;
create policy "perms_super_admin_only" on user_permissions for all
  using (is_super_admin()) with check (is_super_admin());

-- ---- exam_access ------------------------------------------------------
drop policy if exists "exam_access_self_read" on exam_access;
create policy "exam_access_self_read" on exam_access for select
  using (
    exists (select 1 from profiles p where p.id = user_id and p.auth_user_id = auth.uid())
    or can_manage_users()
  );
drop policy if exists "exam_access_admin_write" on exam_access;
create policy "exam_access_admin_write" on exam_access for all
  using (can_manage_users()) with check (can_manage_users());

-- ---- user_theme_settings --------------------------------------------
drop policy if exists "theme_self_read" on user_theme_settings;
create policy "theme_self_read" on user_theme_settings for select
  using (
    user_id is null  -- global default theme is publicly readable
    or exists (select 1 from profiles p where p.id = user_id and p.auth_user_id = auth.uid())
    or can_manage_themes()
  );
drop policy if exists "theme_admin_write" on user_theme_settings;
create policy "theme_admin_write" on user_theme_settings for all
  using (can_manage_themes()) with check (can_manage_themes());

-- ---- audit_logs -------------------------------------------------------
drop policy if exists "audit_super_admin_read" on audit_logs;
create policy "audit_super_admin_read" on audit_logs for select
  using (is_super_admin());
drop policy if exists "audit_insert_any_admin" on audit_logs;
create policy "audit_insert_any_admin" on audit_logs for insert
  with check (can_manage_users() or can_manage_questions() or can_review_results() or can_manage_themes());

-- ---- categories / questions / category_rules / app_settings ----------
drop policy if exists "categories_read_all" on categories;
create policy "categories_read_all" on categories for select using (true);
drop policy if exists "categories_write" on categories;
create policy "categories_write" on categories for all
  using (can_manage_questions()) with check (can_manage_questions());

drop policy if exists "questions_read_active_or_manager" on questions;
create policy "questions_read_active_or_manager" on questions for select
  using (active = true or can_manage_questions() or can_review_results());
drop policy if exists "questions_write" on questions;
create policy "questions_write" on questions for all
  using (can_manage_questions()) with check (can_manage_questions());

drop policy if exists "rules_read_all" on category_rules;
create policy "rules_read_all" on category_rules for select using (true);
drop policy if exists "rules_write" on category_rules;
create policy "rules_write" on category_rules for all
  using (can_manage_questions()) with check (can_manage_questions());

drop policy if exists "settings_read_all" on app_settings;
create policy "settings_read_all" on app_settings for select using (true);
drop policy if exists "settings_write" on app_settings;
create policy "settings_write" on app_settings for all
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists "exam_settings_read_all" on exam_settings;
create policy "exam_settings_read_all" on exam_settings for select using (true);
drop policy if exists "exam_settings_write" on exam_settings;
create policy "exam_settings_write" on exam_settings for all
  using (is_super_admin()) with check (is_super_admin());

-- ---- exam_attempts / exam_attempt_questions / exam_answers -----------
-- Trainees see only their OWN attempts. Super Admin and Exam Reviewer
-- see all attempts (read-only for reviewers; full access for admin).
drop policy if exists "attempts_read" on exam_attempts;
create policy "attempts_read" on exam_attempts for select
  using (
    exists (select 1 from profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
    or can_review_results()
  );
drop policy if exists "attempts_insert_own" on exam_attempts;
create policy "attempts_insert_own" on exam_attempts for insert
  with check (exists (select 1 from profiles p where p.id = profile_id and p.auth_user_id = auth.uid()));
drop policy if exists "attempts_update_own_or_admin" on exam_attempts;
create policy "attempts_update_own_or_admin" on exam_attempts for update
  using (
    exists (select 1 from profiles p where p.id = profile_id and p.auth_user_id = auth.uid())
    or is_super_admin()
  );

drop policy if exists "eaq_read" on exam_attempt_questions;
create policy "eaq_read" on exam_attempt_questions for select
  using (
    exists (
      select 1 from exam_attempts a join profiles p on p.id = a.profile_id
      where a.id = attempt_id and p.auth_user_id = auth.uid()
    ) or can_review_results()
  );
drop policy if exists "eaq_insert_own" on exam_attempt_questions;
create policy "eaq_insert_own" on exam_attempt_questions for insert
  with check (
    exists (
      select 1 from exam_attempts a join profiles p on p.id = a.profile_id
      where a.id = attempt_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "answers_read" on exam_answers;
create policy "answers_read" on exam_answers for select
  using (
    exists (
      select 1 from exam_attempts a join profiles p on p.id = a.profile_id
      where a.id = attempt_id and p.auth_user_id = auth.uid()
    ) or can_review_results()
  );
drop policy if exists "answers_write_own" on exam_answers;
create policy "answers_write_own" on exam_answers for all
  using (
    exists (
      select 1 from exam_attempts a join profiles p on p.id = a.profile_id
      where a.id = attempt_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from exam_attempts a join profiles p on p.id = a.profile_id
      where a.id = attempt_id and p.auth_user_id = auth.uid()
    )
  );

-- ---- exam_templates / exam_template_questions: Super Admin only -----
drop policy if exists "templates_super_admin_only" on exam_templates;
create policy "templates_super_admin_only" on exam_templates for all
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists "template_questions_super_admin_only" on exam_template_questions;
create policy "template_questions_super_admin_only" on exam_template_questions for all
  using (is_super_admin()) with check (is_super_admin());

-- =====================================================================
-- STORAGE BUCKETS + POLICIES
-- Five buckets, all public-READ (so <img>/<video>/<audio> tags can load
-- assigned media directly), write-restricted to Super Admin only.
-- =====================================================================
insert into storage.buckets (id, name, public)
values
  ('logos', 'logos', true),
  ('background-images', 'background-images', true),
  ('background-videos', 'background-videos', true),
  ('music', 'music', true),
  ('turbine-models', 'turbine-models', true)
on conflict (id) do nothing;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects for select
  using (bucket_id in ('logos','background-images','background-videos','music','turbine-models'));

drop policy if exists "media_super_admin_write" on storage.objects;
create policy "media_super_admin_write" on storage.objects for insert
  with check (
    bucket_id in ('logos','background-images','background-videos','music','turbine-models')
    and is_super_admin()
  );
drop policy if exists "media_super_admin_update" on storage.objects;
create policy "media_super_admin_update" on storage.objects for update
  using (
    bucket_id in ('logos','background-images','background-videos','music','turbine-models')
    and is_super_admin()
  );
drop policy if exists "media_super_admin_delete" on storage.objects;
create policy "media_super_admin_delete" on storage.objects for delete
  using (
    bucket_id in ('logos','background-images','background-videos','music','turbine-models')
    and is_super_admin()
  );

-- =====================================================================
-- NOTES
-- =====================================================================
-- 1. ALL writes from this app actually happen server-side via the
--    SUPABASE_SERVICE_ROLE_KEY (see lib/supabaseAdmin.ts), which
--    bypasses RLS. Every server route re-checks the caller's role in
--    application code (see lib/requireRole.ts) before writing. RLS
--    above is defense-in-depth for any direct client queries (e.g. the
--    ThemeProvider reading the user's own theme) and for Storage.
-- 2. To create your first Super Admin: sign up a user any way you like
--    (Supabase Auth dashboard, or POST /api/admin/users once you've
--    temporarily relaxed the check — see SETUP.md "Bootstrapping the
--    first Super Admin"), then run:
--      update profiles set role_id = 'super_admin' where email = 'you@example.com';
--
-- =====================================================================
-- MIGRATING FROM v1
-- =====================================================================
-- If you already have v1 data (exam_attempts.user_id referencing
-- auth.users directly, no profiles/roles), you'll need to:
--   1. Backfill a `profiles` row for every existing auth user.
--   2. Add and populate `exam_attempts.profile_id` from the old
--      `user_id` column (matching profiles.auth_user_id = old user_id).
--   3. Drop the old `user_id` column once verified.
-- This is a one-time manual migration — write a small script or run
-- ad-hoc SQL in the Supabase SQL editor; there's no automatic path
-- because v1 never required accounts for trainees at all.
--
-- =====================================================================
-- MIGRATING FROM v2 (re-running this file is safe and sufficient)
-- =====================================================================
-- v3 adds `questions.always_include` (via `alter table ... add column
-- if not exists`, safe to re-run) and the new `exam_settings` table.
-- Just re-running this entire file against your existing v2 database
-- is enough — every statement is idempotent (`if not exists` /
-- `on conflict do nothing` / `create or replace function`, and every
-- `create policy` is preceded by a matching `drop policy if exists`).
-- The only manual step: app_settings.
-- passing_score and show_explanations_to_trainee are now DEPRECATED
-- (superseded by exam_settings.pass_score and
-- .show_correct_answers_to_trainee) — the app no longer reads them,
-- but if you had customized them in v2, copy those values into
-- exam_settings once after migrating:
--   update exam_settings set
--     pass_score = (select passing_score from app_settings where id = 1),
--     show_correct_answers_to_trainee = (select show_explanations_to_trainee from app_settings where id = 1)
--   where id = 1;
--
-- =====================================================================
-- MIGRATING TO THE SNAPSHOT ARCHITECTURE (exam_attempt_questions /
-- exam_answers) — run this ONCE if you already have data using the
-- OLD structure (exam_attempt_questions with only question_id, no
-- snapshot columns; exam_answers keyed by question_id).
-- =====================================================================
-- WHY: the old structure had exam_attempt_questions.question_id and
-- exam_answers.question_id referencing questions(id) with NO cascade
-- behavior at all (Postgres default = block the delete). That meant
-- deleting a single question, deleting a category, or using "Replace
-- entire question bank" would fail with a foreign-key error the moment
-- ANY exam had ever used one of those questions — which, realistically,
-- is most questions, most of the time. The fix: snapshot every field
-- needed to DISPLAY a past exam directly into exam_attempt_questions at
-- the moment the exam is generated, so historical results never again
-- depend on the live questions table existing or being unchanged.
--
-- If you have NO real exam attempts you care about yet (e.g. you've
-- only been testing locally), the simplest path is far easier than the
-- migration below — just run:
--   drop table if exists exam_answers cascade;
--   drop table if exists exam_attempt_questions cascade;
-- then re-run this entire schema.sql file, which recreates both tables
-- in the new shape automatically.
--
-- If you DO have real attempts to preserve, run this once (in order):
--
-- -- Step 1: add the new snapshot columns (nullable for now)
-- alter table exam_attempt_questions add column if not exists category_name text;
-- alter table exam_attempt_questions add column if not exists question_text text;
-- alter table exam_attempt_questions add column if not exists answer_a text;
-- alter table exam_attempt_questions add column if not exists answer_b text;
-- alter table exam_attempt_questions add column if not exists answer_c text;
-- alter table exam_attempt_questions add column if not exists answer_d text;
-- alter table exam_attempt_questions add column if not exists correct_answer text;
-- alter table exam_attempt_questions add column if not exists explanation text;
--
-- -- Step 2: backfill from the LIVE questions table — do this BEFORE
-- -- deleting/replacing any questions, or there will be nothing left to
-- -- backfill from for those rows.
-- update exam_attempt_questions eaq
-- set category_name = c.name, question_text = q.question_text,
--     answer_a = q.answer_a, answer_b = q.answer_b, answer_c = q.answer_c, answer_d = q.answer_d,
--     correct_answer = q.correct_answer, explanation = q.explanation
-- from questions q join categories c on c.id = q.category_id
-- where eaq.question_id = q.id and eaq.question_text is null;
--
-- -- Any rows where the question was ALREADY deleted before you ran
-- -- this migration can't be backfilled — fill in a placeholder so the
-- -- columns can become NOT NULL:
-- update exam_attempt_questions set
--   category_name = coalesce(category_name, 'Unknown'),
--   question_text = coalesce(question_text, '(question no longer available)'),
--   answer_a = coalesce(answer_a, ''), answer_b = coalesce(answer_b, ''),
--   answer_c = coalesce(answer_c, ''), answer_d = coalesce(answer_d, ''),
--   correct_answer = coalesce(correct_answer, 'A')
-- where question_text is null;
--
-- -- Step 3: make the snapshot columns required, and relax the
-- -- question_id FK so it can never block a delete again
-- alter table exam_attempt_questions alter column category_name set not null;
-- alter table exam_attempt_questions alter column question_text set not null;
-- alter table exam_attempt_questions alter column answer_a set not null;
-- alter table exam_attempt_questions alter column answer_b set not null;
-- alter table exam_attempt_questions alter column answer_c set not null;
-- alter table exam_attempt_questions alter column answer_d set not null;
-- alter table exam_attempt_questions alter column correct_answer set not null;
-- alter table exam_attempt_questions drop constraint if exists exam_attempt_questions_question_id_fkey;
-- alter table exam_attempt_questions alter column question_id drop not null;
-- alter table exam_attempt_questions add constraint exam_attempt_questions_question_id_fkey
--   foreign key (question_id) references questions(id) on delete set null;
--
-- -- Step 4: re-key exam_answers from question_id to question_number
-- alter table exam_answers add column if not exists question_number int;
-- update exam_answers ea set question_number = eaq.question_number
-- from exam_attempt_questions eaq
-- where ea.attempt_id = eaq.attempt_id and ea.question_id = eaq.question_id and ea.question_number is null;
-- alter table exam_answers drop constraint if exists exam_answers_pkey;
-- alter table exam_answers alter column question_number set not null;
-- alter table exam_answers add primary key (attempt_id, question_number);
-- alter table exam_answers drop column if exists question_id;
-- alter table exam_answers add constraint exam_answers_attempt_question_fkey
--   foreign key (attempt_id, question_number) references exam_attempt_questions(attempt_id, question_number) on delete cascade;
--
-- After this migration, re-running the rest of this schema.sql file
-- (the CREATE TABLE IF NOT EXISTS statements for these two tables) is
-- a no-op and safe, since the tables already exist in the new shape.
--
-- =====================================================================
-- MIGRATING TO USERNAME-ONLY LOGIN (v4)
-- =====================================================================
-- Re-running this whole file adds profiles.username / profiles.full_name
-- and the case-insensitive unique index (all idempotent). After that:
--   * NEW deployments: just open /login — a first-run screen creates
--     the first Super Admin through the website. No SQL.
--   * EXISTING deployments (accounts made under the old email/password
--     system): those rows have username = NULL and cannot log in until
--     one is set. For your own admin account, one line:
--       update profiles set username = 'pick-a-username'
--       where email = 'your-old-login-email@example.com';
--     Then log in with that username and set everyone else's username
--     from Admin -> Users -> Edit.
-- Supabase Auth (auth.users) is no longer used for login at all; the
-- auth_user_id column remains only as an inert legacy reference.
--
-- =====================================================================
-- v4.1 — RLS REALIGNMENT FOR USERNAME-ONLY LOGIN + is_preview column
-- =====================================================================
-- IMPORTANT: run this whole file again in the Supabase SQL Editor after
-- upgrading to v4.1. It adds exam_attempts.is_preview (needed for admin
-- exam preview) and fixes a real problem: the original Row Level
-- Security policies were written against Supabase Auth (auth.uid()).
-- Username-only login never sets auth.uid(), so those policies evaluate
-- as "deny" for any non-service-role client — which is why writes could
-- fail with "permission denied for table user_theme_settings" etc.
--
-- All privileged access now goes through server API routes using the
-- SERVICE ROLE key (which bypasses RLS), with access controlled by the
-- signed app-session cookie in the app layer. So we (a) guarantee the
-- service_role and postgres roles retain full table access, and (b)
-- replace the auth.uid()-based policies with simple public-READ /
-- service-role-WRITE policies. This is safe because the anon key is
-- only ever used client-side for public reads; every write is performed
-- server-side with the service role after the API has checked the
-- user's role.
--
-- NOTE: if you ALSO get "permission denied" after running this, your
-- SUPABASE_SERVICE_ROLE_KEY in Vercel is almost certainly wrong (often
-- it's actually the anon/publishable key by mistake). Re-copy the
-- **service_role** key from Supabase → Settings → API into Vercel and
-- redeploy. Confirm at /api/debug/session.

-- 1) Make sure the column for admin exam preview exists.
alter table exam_attempts add column if not exists is_preview boolean not null default false;

-- 2) Guarantee the service_role can touch every table (belt-and-suspenders;
--    service_role normally bypasses RLS, but explicit grants avoid any
--    "permission denied" surprises from stripped default privileges).
grant usage on schema public to service_role, anon, authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- 3) Disable RLS on app tables. Under username-only login, ALL access
--    is enforced in the API layer (signed app-session cookie → service
--    role). The old auth.uid()-based policies are meaningless now and
--    were causing "permission denied". Disabling RLS is safe here
--    because: the anon key is never used to write (every write is a
--    server route using the service role after an auth check), and the
--    tables contain training-exam data, not secrets. If you later
--    re-introduce Supabase Auth you can re-enable RLS with fresh
--    policies.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','roles','user_permissions','categories','category_rules',
    'questions','exam_settings','exam_access','app_settings',
    'exam_attempts','exam_attempt_questions','exam_answers',
    'exam_templates','exam_template_questions','user_theme_settings','audit_logs'
  ] loop
    execute format('alter table public.%I disable row level security;', t);
  end loop;
end $$;
--
-- =====================================================================
-- v4.13 — AI KNOWLEDGE TRAINER
-- =====================================================================
-- Continuous one-by-one AI practice sessions. Each user has at most one
-- ACTIVE session; every question and answer is stored so progress and
-- score survive exits ("Continue Last Session"). Safe to re-run.

create table if not exists trainer_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  category text not null,
  difficulty text not null default 'medium',
  correct_count int not null default 0,
  wrong_count int not null default 0,
  status text not null default 'active',  -- 'active' | 'ended'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_trainer_sessions_profile on trainer_sessions(profile_id, status);

create table if not exists trainer_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references trainer_sessions(id) on delete cascade,
  question_number int not null,
  question_text text not null,
  answer_a text not null,
  answer_b text not null,
  answer_c text not null,
  answer_d text not null,
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanation text,
  sources text,
  video_search text,
  selected_answer text check (selected_answer in ('A','B','C','D')),
  is_correct boolean,
  asked_at timestamptz default now(),
  unique (session_id, question_number)
);
create index if not exists idx_trainer_questions_session on trainer_questions(session_id);

alter table trainer_sessions disable row level security;
alter table trainer_questions disable row level security;
grant all privileges on table trainer_sessions to service_role;
grant all privileges on table trainer_questions to service_role;
--
-- =====================================================================
-- v4.14 — REAL INTERNET SOURCES FOR AI QUESTIONS
-- =====================================================================
-- Safe to re-run (all guarded). Adds AI metadata to the real question
-- bank, and structured source/video/difficulty columns to the trainer.

-- questions: AI metadata for imported AI questions
alter table questions add column if not exists source_type text not null default 'manual';
alter table questions add column if not exists sources jsonb;
alter table questions add column if not exists video_sources jsonb;
alter table questions add column if not exists ai_generated boolean not null default false;
alter table questions add column if not exists subcategory text;
alter table questions add column if not exists difficulty text;

-- trainer_questions: structured data (legacy text columns sources /
-- video_search are kept for compatibility; new code writes both)
alter table trainer_questions add column if not exists category text;
alter table trainer_questions add column if not exists subcategory text;
alter table trainer_questions add column if not exists difficulty text;
alter table trainer_questions add column if not exists sources_json jsonb;
alter table trainer_questions add column if not exists video_sources jsonb;
alter table trainer_questions add column if not exists source_type text default 'internet';
alter table trainer_questions add column if not exists ai_generated boolean default true;
