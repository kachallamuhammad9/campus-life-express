-- ============================================================
-- 0026_vendor_applications.sql
-- PHASE 4E.1 — VENDOR REGISTRATION INTAKE (REPAIR)
-- Target: existing production table, project bdjfkuddpupqaswzkrth
--
-- VERIFIED PRODUCTION FACTS (row count = 0):
--   Columns: id uuid pk, legacy_key text null unique, business_name text not null,
--     slug text not null (unique index), category_slug text not null,
--     campus_slug text not null, location text not null, contact_name text not null,
--     phone_number text null, email text null, description text null,
--     status text not null default 'PENDING', rejection_reason text null,
--     reviewed_by uuid null -> profiles(id), vendor_id uuid null -> vendors(id),
--     created_at / updated_at timestamptz not null default now()
--   Status CHECK: PENDING | APPROVED | REJECTED; REJECTED requires rejection_reason
--
-- COLUMN REUSE (no duplicate columns):
--   business_name, contact_name, phone_number, location, category_slug,
--   reviewed_by (reused; no reviewed_by_user_id), rejection_reason (kept)
-- ADDITIVE: application_number, campus_id, whatsapp_number, submitted_at,
--   reviewed_at, review_notes
--
-- SAFETY: table never dropped; no rows deleted; production row count = 0.
-- ============================================================

-- 0. Guard: the table must exist (we never create/destructively recreate it)
do $$
begin
  if to_regclass('public.vendor_applications') is null then
    raise exception '0026: public.vendor_applications does not exist; refusing to create a new table — deploy the original creation migration first.';
  end if;
end $$;

-- 1. Lifecycle enum (only if missing)
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'vendor_application_status' and n.nspname = 'public') then
    create type public.vendor_application_status as enum (
      'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFORMATION'
    );
  end if;
end $$;

-- 2. ADDITIVE columns on the EXISTING table (production column names preserved)
alter table public.vendor_applications
  add column if not exists application_number text,
  add column if not exists campus_id uuid,
  add column if not exists whatsapp_number text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text;

-- 3. Per-year counter table (private; only RPC helpers touch it)
create table if not exists public.vendor_application_counters (
  year int primary key,
  last_seq bigint not null default 0
);
revoke all on public.vendor_application_counters from public, anon, authenticated;

-- 4. Seed counter for the current year (table has 0 rows -> start cleanly at 0)
insert into public.vendor_application_counters (year, last_seq)
values (extract(year from now())::int, 0)
on conflict (year) do nothing;

-- 5. Replace legacy TEXT status model with the 5-state enum.
--    Row count = 0, so conversion is safe. Old CHECK constraints (status
--    lifecycle and REJECTED->rejection_reason) are dropped and rebuilt.
do $$
declare
  r record;
begin
  -- 5a. drop legacy status CHECK constraint first, then rejection_reason CHECK
  alter table public.vendor_applications
    drop constraint if exists vendor_applications_status_check;
-- old legacy CHECK constraints tied to status / rejection_reason
  for r in
    select conname from pg_constraint
    where conrelid = 'public.vendor_applications'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%status%'
           or pg_get_constraintdef(oid) ilike '%rejection_reason%')
  loop
    execute format('alter table public.vendor_applications drop constraint if exists %I', r.conname);
  end loop;

  -- 5b. convert status TEXT -> enum (0 rows; normalize defensively anyway)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendor_applications'
      and column_name = 'status' and data_type = 'text'
  ) then
    update public.vendor_applications set status = 'PENDING'
      where status is null or lower(btrim(status)) not in
        ('pending','under_review','approved','rejected','needs_information');
    update public.vendor_applications set status = upper(btrim(status))
      where lower(btrim(status)) in
        ('pending','under_review','approved','rejected','needs_information');

    alter table public.vendor_applications alter column status drop default;
    alter table public.vendor_applications
      alter column status type public.vendor_application_status
      using status::public.vendor_application_status;
  end if;

  alter table public.vendor_applications
    alter column status set default 'PENDING';
end $$;

-- 6. NEW 5-state rejection rule: REJECTED requires rejection_reason;
--    no other status requires it. review_notes is free for the reviewer.
alter table public.vendor_applications
  drop constraint if exists vendor_applications_rejection_reason_check;
alter table public.vendor_applications
  add constraint vendor_applications_rejection_reason_check
  check (status <> 'REJECTED'::public.vendor_application_status
         or rejection_reason is not null);

-- 7. FK: campus_id -> campuses(id) (validated + derived from inside the RPC)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vendor_applications'::regclass
      and conname = 'vendor_applications_campus_id_fkey'
  ) then
    alter table public.vendor_applications
      add constraint vendor_applications_campus_id_fkey
      foreign key (campus_id) references public.campuses(id) on delete restrict;
  end if;
end $$;

-- 8. application_number: NOT NULL + UNIQUE (0 rows -> safe to tighten directly)
alter table public.vendor_applications
  alter column application_number set not null;
alter table public.vendor_applications
  drop constraint if exists vendor_applications_application_number_key;
alter table public.vendor_applications
  add constraint vendor_applications_application_number_key unique (application_number);

-- 9. Harden remaining new columns (0 rows -> safe)
alter table public.vendor_applications
  alter column campus_id set not null,
  alter column whatsapp_number set not null;
alter table public.vendor_applications
  alter column submitted_at set not null,
  alter column submitted_at set default now();

-- 10. RLS: enable + rebuild policies from scratch.
--     Every pre-existing policy on the table is removed (0 rows, submission is
--     RPC-only), then only admin read/update policies are created.
alter table public.vendor_applications enable row level security;

do $$
declare
  r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'vendor_applications'
  loop
    execute format('drop policy if exists %I on public.vendor_applications', r.policyname);
  end loop;
end $$;

create policy vendor_applications_admin_select
  on public.vendor_applications for select
  to authenticated
  using (public.is_admin());
create policy vendor_applications_admin_update
  on public.vendor_applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- service_role bypasses RLS; no delete policy on purpose (no user delete path).

-- 11. TABLE GRANTS (belt-and-braces beyond RLS)
revoke all on public.vendor_applications from public, anon, authenticated;
grant select, update on public.vendor_applications to authenticated;  -- admin RLS above

-- 12. Private helper: concurrency-safe per-year application number
--     CLX-VA-YYYY-NNNN (counter table has no anon/authenticated grants)
create or replace function public._vendor_app_next_number(p_year int)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_seq bigint;
begin
  insert into public.vendor_application_counters (year, last_seq)
  values (p_year, 1)
  on conflict (year) do update
    set last_seq = public.vendor_application_counters.last_seq + 1
  returning last_seq into v_seq;
  return 'CLX-VA-' || p_year::text || '-' || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
end $$;

revoke all on function public._vendor_app_next_number(int) from public, anon, authenticated;

-- 13. Private helper: normalize Nigerian phone/WhatsApp numbers
--     09150736638 | 2349150736638 | +2349150736638 -> +2349150736638
create or replace function public._vendor_app_normalize_ng_phone(p_raw text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v text;
begin
  -- Permit formatting punctuation only; never discard letters or extra plus signs.
  v := regexp_replace(coalesce(p_raw, ''), '[ ()-]', '', 'g');
  if v !~ '^(0[0-9]{10}|[+]234[0-9]{10}|234[0-9]{10})$' then
    return null;
  end if;
  if left(v, 1) = '+' then
    v := substr(v, 2);
  elsif left(v, 1) = '0' then
    v := '234' || substr(v, 2);
  end if;
  return '+' || v;
end $$;

revoke all on function public._vendor_app_normalize_ng_phone(text) from public, anon, authenticated;

-- 14. SECURE RPC: submit_vendor_application (Phase 4E.1 final contract)
--     Browser supplies ONLY: campus id, business name, contact name, phone,
--     whatsapp, optional email, category slug, location, optional description.
--     application_number / slug / campus_slug are generated server-side;
--     status is forced PENDING; legacy_key and vendor_id stay NULL.
-- drop legacy unsafe public insert policy if it exists from an earlier attempt
drop policy if exists vendor_applications_insert_public on public.vendor_applications;

create or replace function public.submit_vendor_application(
  p_campus_id uuid,
  p_business_name text,
  p_contact_name text,
  p_phone_number text,
  p_whatsapp_number text,
  p_category_slug text,
  p_location text,
  p_email text default null,
  p_description text default null
)
returns table (
  application_number text,
  business_name text,
  status public.vendor_application_status,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_campus_slug text;
  v_campus_short text;
  v_campus_name text;
  v_campus_active boolean;
  v_business_name text;
  v_business text;
  v_contact text;
  v_category text;
  v_location text;
  v_description text;
  v_email text;
  v_phone text;
  v_whatsapp text;
  v_year int;
  v_application_number text;
  v_slug_base text;
  v_slug text;
  v_submitted_at timestamptz;
begin
  -- 1) validate active campus
  if p_campus_id is null then
    raise exception 'Campus is required.';
  end if;
  select c.slug, c.short_name, c.name, c.is_active
    into v_campus_slug, v_campus_short, v_campus_name, v_campus_active
    from public.campuses c where c.id = p_campus_id;
  if not found then
    raise exception 'Campus not found.';
  end if;
  if v_campus_active is not true then
    raise exception 'Campus is not currently accepting vendor applications.';
  end if;

  -- 2) trim inputs
  v_business_name := btrim(coalesce(p_business_name, ''));
  v_business      := v_business_name;
  v_contact      := btrim(coalesce(p_contact_name, ''));
  v_category     := btrim(coalesce(p_category_slug, ''));
  v_location     := btrim(coalesce(p_location, ''));
  v_description  := nullif(btrim(coalesce(p_description, '')), '');
  v_email        := nullif(btrim(coalesce(p_email, '')), '');

  -- 3) validate required values + maximum lengths
  if length(v_business) < 2 then
    raise exception 'Business name is required (min 2 characters).';
  end if;
  if length(v_business) > 150 then
    raise exception 'Business name must be 150 characters or fewer.';
  end if;
  if length(v_contact) < 2 then
    raise exception 'Contact person name is required.';
  end if;
  if length(v_contact) > 120 then
    raise exception 'Contact person name must be 120 characters or fewer.';
  end if;
  if v_category = '' then
    raise exception 'Business category is required.';
  end if;
  if length(v_category) > 80 then
    raise exception 'Business category is too long.';
  end if;
  if length(v_location) < 2 then
    raise exception 'Business location is required.';
  end if;
  if length(v_location) > 200 then
    raise exception 'Business location must be 200 characters or fewer.';
  end if;
  if length(coalesce(v_description, '')) > 2000 then
    raise exception 'Description must be 2000 characters or fewer.';
  end if;

  -- 4) normalize + validate phone
  v_phone := public._vendor_app_normalize_ng_phone(p_phone_number);
  if v_phone is null then
    raise exception 'A valid phone number is required.';
  end if;

  -- 5) normalize + validate WhatsApp
  v_whatsapp := public._vendor_app_normalize_ng_phone(p_whatsapp_number);
  if v_whatsapp is null then
    raise exception 'A valid WhatsApp number is required.';
  end if;

  if length(coalesce(v_email, '')) > 254 then
    raise exception 'Email must be 254 characters or fewer.';
  end if;

  -- 6) validate optional email
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address.';
  end if;

  -- 7) rapid duplicate protection (same campus + normalized business name +
  --    normalized WhatsApp within the last 5 minutes)
  -- Serialize the same normalized identity for the entire transaction.
  -- Hash collisions only serialize unrelated applicants; they cannot bypass checks.
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(p_campus_id, lower(v_business), v_whatsapp)::text, 0));
  if exists (
    select 1 from public.vendor_applications va
    where va.campus_id = p_campus_id
      and lower(btrim(va.business_name)) = lower(v_business)
      and va.whatsapp_number = v_whatsapp
      and va.submitted_at > clock_timestamp() - interval '5 minutes'
  ) then
    raise exception 'A similar application was recently submitted. Please wait a few minutes.';
  end if;

  -- 8) generate application number (concurrency-safe per-year counter)
  v_year   := extract(year from now())::int;
  v_application_number := public._vendor_app_next_number(v_year);

  -- 9) Prefer the stored slug; otherwise normalize short name, then full name.
  v_campus_slug := nullif(lower(btrim(v_campus_slug)), '');
  if v_campus_slug is null then
    v_campus_slug := nullif(btrim(lower(regexp_replace(coalesce(v_campus_short, ''), '[^a-zA-Z0-9]+', '-', 'g')), '-'), '');
  end if;
  if v_campus_slug is null then
    v_campus_slug := nullif(btrim(lower(regexp_replace(coalesce(v_campus_name, ''), '[^a-zA-Z0-9]+', '-', 'g')), '-'), '');
  end if;
  if v_campus_slug is null then
    raise exception 'Campus record has no usable slug/identifier.';
  end if;

  -- 10) generate unique slug server-side: normalized business name + app number
  v_slug_base := lower(regexp_replace(v_business_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := btrim(v_slug_base, '-');
  if v_slug_base = '' then
    v_slug_base := 'vendor';
  end if;
  if length(v_slug_base) > 80 then
    v_slug_base := substr(v_slug_base, 1, 80);
  end if;
  v_slug := v_slug_base || '-' || lower(v_application_number);

  -- 11) insert exactly one application: status forced PENDING, legacy_key NULL,
  --     vendor_id NULL, all review fields NULL
  insert into public.vendor_applications (
    business_name, slug, category_slug, campus_slug, location,
    contact_name, phone_number, whatsapp_number, email, description,
    status, application_number, campus_id, submitted_at,
    legacy_key, vendor_id, reviewed_by, reviewed_at, review_notes, rejection_reason
  ) values (
    v_business, v_slug, v_category, v_campus_slug, v_location,
    v_contact, v_phone, v_whatsapp, v_email, v_description,
    'PENDING'::public.vendor_application_status, v_application_number, p_campus_id, clock_timestamp(),
    null, null, null, null, null, null
  )
  returning public.vendor_applications.submitted_at into v_submitted_at;

  -- 12) return ONLY safe public fields (no internal UUID)
  return query select v_application_number as application_number, v_business as business_name,
    'PENDING'::public.vendor_application_status as status, v_submitted_at as submitted_at;
end $$;

revoke all on function public.submit_vendor_application(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_vendor_application(uuid, text, text, text, text, text, text, text, text)
  to anon, authenticated, service_role;

-- 11. updated_at trigger — reuse standard function if it exists, else create local one
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'set_updated_at') then
    create function public.set_updated_at() returns trigger
    language plpgsql as $fn$
    begin
      new.updated_at := now();
      return new;
    end $fn$;
  end if;
end $$;

drop trigger if exists trg_vendor_applications_updated_at on public.vendor_applications;
create trigger trg_vendor_applications_updated_at
  before update on public.vendor_applications
  for each row execute function public.set_updated_at();

-- ============================ END 0026 ============================
