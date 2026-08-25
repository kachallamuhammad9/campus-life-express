create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  slug text not null,
  seller_user_id uuid not null references public.profiles(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  subcategory_id uuid references public.categories(id) on delete restrict,
  title text not null,
  description text,
  price_kobo bigint not null check (price_kobo >= 0),
  original_price_kobo bigint check (original_price_kobo is null or original_price_kobo >= price_kobo),
  condition public.listing_condition not null,
  status public.listing_status not null default 'PENDING_REVIEW',
  seller_department text,
  seller_contact_phone text,
  moderated_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  date_listed timestamptz not null default now(),
  date_sold timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (seller_user_id, campus_id, slug),
  check (date_sold is null or status = 'SOLD'),
  check (status <> 'REJECTED' or rejection_reason is not null)
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
