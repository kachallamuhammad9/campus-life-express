create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  slug text not null unique,
  name text not null unique,
  short_name text not null unique,
  location text,
  description text,
  latitude numeric(10,8),
  longitude numeric(11,8),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180)
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  description text,
  base_delivery_fee_kobo bigint not null default 40000 check (base_delivery_fee_kobo >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  parent_id uuid references public.categories(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  image_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_id, name),
  unique (parent_id, slug),
  check (parent_id is null or parent_id <> id)
);
