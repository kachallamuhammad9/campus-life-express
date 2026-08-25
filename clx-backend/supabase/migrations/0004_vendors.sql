create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  owner_user_id uuid not null unique references public.profiles(id) on delete restrict,
  name text not null,
  slug text not null unique,
  category_id uuid not null references public.categories(id) on delete restrict,
  location text not null,
  phone_number text,
  email text,
  description text,
  image_url text,
  status public.vendor_status not null default 'PENDING',
  is_verified boolean not null default false,
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendor_campuses (
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (vendor_id, campus_id)
);

create table public.vendor_operating_hours (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  campus_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, campus_id, day_of_week),
  foreign key (vendor_id, campus_id) references public.vendor_campuses(vendor_id, campus_id) on delete cascade,
  check (is_closed or (opens_at is not null and closes_at is not null))
);
