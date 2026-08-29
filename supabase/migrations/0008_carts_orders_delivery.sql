create table public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete restrict,
  rider_user_id uuid references public.profiles(id) on delete set null,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  task_type public.delivery_task_type not null,
  pickup_location text not null,
  dropoff_location text not null,
  description text,
  estimated_fee_kobo bigint check (estimated_fee_kobo is null or estimated_fee_kobo >= 0),
  actual_fee_kobo bigint check (actual_fee_kobo is null or actual_fee_kobo >= 0),
  urgency text,
  preferred_at timestamptz,
  status public.delivery_status not null default 'REQUESTED',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  check (delivered_at is null or status = 'DELIVERED'),
  check (status <> 'PICKED_UP' or picked_up_at is not null)
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete restrict,
  campus_id uuid references public.campuses(id) on delete restrict,
  status public.cart_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ACTIVE' and vendor_id is not null and campus_id is not null) or status <> 'ACTIVE')
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  delivery_zone_id uuid references public.delivery_zones(id) on delete restrict,
  delivery_request_id uuid references public.delivery_requests(id) on delete set null,
  delivery_address text not null,
  phone_number text not null,
  type public.order_type not null,
  subtotal_kobo bigint not null check (subtotal_kobo >= 0),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  service_fee_kobo bigint not null default 0 check (service_fee_kobo >= 0),
  total_kobo bigint not null check (total_kobo = subtotal_kobo + delivery_fee_kobo + service_fee_kobo),
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'PENDING',
  status public.order_status not null default 'PENDING',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  cancelled_at timestamptz,
  check (delivered_at is null or status = 'DELIVERED'),
  check (cancelled_at is null or status = 'CANCELLED')
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  total_price_kobo bigint not null check (total_price_kobo = quantity * unit_price_kobo),
  created_at timestamptz not null default now()
);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text,
  provider_reference text,
  amount_kobo bigint not null check (amount_kobo > 0),
  status public.payment_status not null default 'PENDING',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
