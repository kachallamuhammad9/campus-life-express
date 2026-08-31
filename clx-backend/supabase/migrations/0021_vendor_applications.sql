-- Migration 0021: Vendor Applications (vendor onboarding workflow)
-- Stores applications submitted via /api/v1/onboarding/vendor
-- Admin approves -> creates vendor row -> assigns campus -> published.

create table if not exists public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  business_name text not null,
  slug text not null,
  category_slug text not null,
  campus_slug text not null,
  location text not null,
  contact_name text not null,
  phone_number text,
  email text,
  description text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'REJECTED' or rejection_reason is not null)
);

create unique index if not exists vendor_applications_slug_key on public.vendor_applications (slug);

-- RLS
alter table public.vendor_applications enable row level security;

drop policy if exists "vendor_applications_select_public" on public.vendor_applications;
create policy "vendor_applications_select_public" on public.vendor_applications
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "vendor_applications_insert_public" on public.vendor_applications;
create policy "vendor_applications_insert_public" on public.vendor_applications
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "vendor_applications_admin_update" on public.vendor_applications;
create policy "vendor_applications_admin_update" on public.vendor_applications
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
