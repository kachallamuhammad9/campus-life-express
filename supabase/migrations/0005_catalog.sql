create table public.products (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  slug text not null,
  vendor_id uuid not null,
  campus_id uuid not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  subcategory_id uuid references public.categories(id) on delete restrict,
  name text not null,
  description text,
  price_kobo bigint not null check (price_kobo >= 0),
  original_price_kobo bigint check (original_price_kobo is null or original_price_kobo >= price_kobo),
  image_url text,
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  is_popular boolean not null default false,
  is_in_stock boolean not null default true,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, campus_id, slug),
  unique (vendor_id, campus_id, name),
  foreign key (vendor_id, campus_id) references public.vendor_campuses(vendor_id, campus_id) on delete restrict
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
