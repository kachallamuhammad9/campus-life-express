-- 0016_vendor_applications_base_recovery.sql
-- Local canonical-history recovery prerequisite for 0026_vendor_applications.sql.
--
-- Provenance: the exact base-table definition is independently reproduced by
-- frontend/_vendor_application_admin_tests.mjs and is also enumerated in the
-- 0026 repair migration header.  0026 intentionally refuses to create this
-- pre-existing table, so this narrowly scoped migration restores that base
-- object before the repair sequence.

create table if not exists public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  business_name text not null,
  slug text not null unique,
  category_slug text not null,
  campus_slug text not null,
  location text not null,
  contact_name text not null,
  phone_number text,
  email text,
  description text,
  status text not null default 'PENDING',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  vendor_id uuid references public.vendors(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_applications enable row level security;
