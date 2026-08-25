# CLX Phase 2A PostgreSQL/Supabase Database Implementation Specification

**Status:** Approved implementation specification  
**Database:** PostgreSQL 15+ / Supabase  
**Currency:** Nigerian naira, stored as integer kobo in `BIGINT` columns  
**Authentication:** Supabase Auth (`auth.users`); this schema does not store passwords, sessions, refresh tokens, or JWTs.

## 1. Design decisions

- Every application primary key is `UUID NOT NULL DEFAULT gen_random_uuid()`.
- All persisted timestamps use `TIMESTAMPTZ`.
- `public.users.id` is both the profile identifier and a foreign key to `auth.users(id)`.
- `campuses` are first-class tenant boundaries. Vendors, products, services, listings, carts, orders, and deliveries are campus-scoped.
- A user owns zero or one vendor. A vendor may operate on multiple campuses through `vendor_campuses`.
- A cart is unique per user and has one vendor. The database trigger rejects a product from another vendor.
- Normal commerce uses `orders` and `order_items`; peer commerce uses `marketplace_transactions` and is intentionally separate.
- A service provider is always a user. `services.vendor_id` is optional, so an ordinary user may provide a service; when present, it identifies the provider's vendor profile.
- Cross-row invariants that PostgreSQL `CHECK` constraints cannot enforce are implemented with constraint triggers and must be kept enabled.

## 2. Migration layout

Apply migrations in this order:

```text
0001_extensions_and_types.sql
0002_reference_tables.sql
0003_identity_and_access.sql
0004_catalog_and_vendors.sql
0005_services_marketplace.sql
0006_cart_orders_delivery.sql
0007_reviews_notifications_audit.sql
0008_functions_triggers_indexes.sql
0009_rls.sql
0010_seed_reference_data.sql
```

Each migration must run in a transaction where Supabase permits it. Never edit an applied migration; add a new numbered migration for changes.

## 3. `0001_extensions_and_types.sql`

```sql
create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'vendor', 'rider', 'admin', 'super_admin');
create type public.vendor_status as enum ('pending', 'active', 'suspended', 'closed');
create type public.listing_status as enum ('pending_review', 'published', 'sold', 'removed', 'rejected');
create type public.listing_condition as enum ('new', 'like_new', 'good', 'fair');
create type public.price_type as enum ('fixed', 'starting_from', 'quote');
create type public.service_delivery_type as enum ('pickup', 'delivery', 'in_person');
create type public.service_request_status as enum ('submitted', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected');
create type public.cart_status as enum ('active', 'checked_out', 'abandoned');
create type public.order_type as enum ('food', 'shopping', 'service');
create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'in_transit', 'delivered', 'cancelled');
create type public.payment_method as enum ('cash_on_delivery', 'card', 'bank_transfer');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded');
create type public.delivery_task_type as enum ('delivery', 'vendor_pickup', 'errand');
create type public.delivery_status as enum ('requested', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled');
create type public.marketplace_transaction_status as enum ('initiated', 'accepted', 'completed', 'cancelled', 'disputed');
create type public.notification_type as enum ('order_update', 'service_update', 'delivery_update', 'marketplace_update', 'system');
create type public.address_label as enum ('home', 'hostel', 'office', 'other');
```

## 4. `0002_reference_tables.sql`

```sql
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
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
  parent_id uuid references public.categories(id) on delete restrict,
  slug text not null unique,
  name text not null unique,
  description text,
  icon text,
  image_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
```

## 5. `0003_identity_and_access.sql`

Supabase creates and owns `auth.users`. The profile row is created after sign-up by a controlled trigger or a server-side service-role operation.

```sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone_number text,
  profile_picture_url text,
  bio text,
  default_campus_id uuid references public.campuses(id) on delete set null,
  student_id text,
  is_active boolean not null default true,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (student_id),
  check (length(trim(full_name)) between 2 and 255)
);

create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  zone_id uuid references public.delivery_zones(id) on delete set null,
  label public.address_label not null default 'other',
  full_address text not null,
  latitude numeric(10,8),
  longitude numeric(11,8),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180)
);
```

## 6. `0004_catalog_and_vendors.sql`

```sql
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.users(id) on delete restrict,
  name text not null,
  slug text not null unique,
  category_id uuid not null references public.categories(id) on delete restrict,
  location text not null,
  phone_number text,
  email text,
  description text,
  image_url text,
  status public.vendor_status not null default 'pending',
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
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  unique (vendor_id, campus_id, day_of_week),
  check (is_closed or (opens_at is not null and closes_at is not null))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
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
  unique (vendor_id, campus_id, name)
);
```

## 7. `0005_services_marketplace.sql`

```sql
create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references public.users(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  subcategory_id uuid references public.categories(id) on delete restrict,
  name text not null,
  description text,
  starting_price_kobo bigint check (starting_price_kobo is null or starting_price_kobo >= 0),
  price_type public.price_type not null default 'quote',
  image_url text,
  turnaround_time text,
  requires_file_upload boolean not null default false,
  requires_appointment boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  provider_user_id uuid not null references public.users(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  delivery_type public.service_delivery_type not null,
  description text not null,
  file_url text,
  estimated_budget_kobo bigint check (estimated_budget_kobo is null or estimated_budget_kobo >= 0),
  preferred_date date,
  preferred_time time,
  status public.service_request_status not null default 'submitted',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (completed_at is null or status = 'completed')
);

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.users(id) on delete restrict,
  seller_vendor_id uuid references public.vendors(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  subcategory_id uuid references public.categories(id) on delete restrict,
  title text not null,
  description text,
  price_kobo bigint not null check (price_kobo >= 0),
  original_price_kobo bigint check (original_price_kobo is null or original_price_kobo >= price_kobo),
  condition public.listing_condition not null,
  status public.listing_status not null default 'pending_review',
  moderated_by uuid references public.users(id) on delete set null,
  rejection_reason text,
  date_listed timestamptz not null default now(),
  date_sold timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (date_sold is null or status = 'sold'),
  check (status <> 'rejected' or rejection_reason is not null)
);

create table public.marketplace_transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  buyer_user_id uuid not null references public.users(id) on delete restrict,
  seller_user_id uuid not null references public.users(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  agreed_price_kobo bigint not null check (agreed_price_kobo >= 0),
  status public.marketplace_transaction_status not null default 'initiated',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (buyer_user_id <> seller_user_id),
  check (completed_at is null or status = 'completed')
);
```

## 8. `0006_cart_orders_delivery.sql`

```sql
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete restrict,
  campus_id uuid references public.campuses(id) on delete restrict,
  status public.cart_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and vendor_id is not null and campus_id is not null) or status <> 'active')
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
  user_id uuid not null references public.users(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  delivery_zone_id uuid references public.delivery_zones(id) on delete restrict,
  delivery_address text not null,
  phone_number text not null,
  type public.order_type not null,
  subtotal_kobo bigint not null check (subtotal_kobo >= 0),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  service_fee_kobo bigint not null default 0 check (service_fee_kobo >= 0),
  total_kobo bigint not null check (total_kobo = subtotal_kobo + delivery_fee_kobo + service_fee_kobo),
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  status public.order_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  cancelled_at timestamptz,
  check (delivered_at is null or status = 'delivered'),
  check (cancelled_at is null or status = 'cancelled')
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
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.users(id) on delete restrict,
  rider_user_id uuid references public.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  task_type public.delivery_task_type not null,
  pickup_location text not null,
  dropoff_location text not null,
  description text,
  estimated_fee_kobo bigint check (estimated_fee_kobo is null or estimated_fee_kobo >= 0),
  actual_fee_kobo bigint check (actual_fee_kobo is null or actual_fee_kobo >= 0),
  status public.delivery_status not null default 'requested',
  preferred_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  check (delivered_at is null or status = 'delivered'),
  check (status <> 'picked_up' or picked_up_at is not null)
);
```

## 9. `0007_reviews_notifications_audit.sql`

Separate review tables preserve real foreign keys; a polymorphic `reviewable_id` would not.

```sql
create table public.vendor_reviews (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  reviewer_user_id uuid not null references public.users(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, reviewer_user_id, order_id)
);

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reviewer_user_id uuid not null references public.users(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, reviewer_user_id, order_id)
);

create table public.order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  reviewer_user_id uuid not null references public.users(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type public.notification_type not null,
  title text,
  message text not null,
  related_order_id uuid references public.orders(id) on delete set null,
  related_service_request_id uuid references public.service_requests(id) on delete set null,
  related_delivery_request_id uuid references public.delivery_requests(id) on delete set null,
  related_marketplace_transaction_id uuid references public.marketplace_transactions(id) on delete set null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((is_read and read_at is not null) or (not is_read and read_at is null))
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  changes jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
```

## 10. `0008_functions_triggers_indexes.sql`

### Required trigger functions

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_cart_vendor_mismatch()
returns trigger language plpgsql as $$
declare cart_vendor uuid; product_vendor uuid; product_campus uuid;
begin
  select vendor_id, campus_id into cart_vendor, product_campus from public.carts where id = new.cart_id;
  select vendor_id into product_vendor from public.products where id = new.product_id;
  if cart_vendor is null then
    update public.carts set vendor_id = product_vendor, campus_id = product_campus where id = new.cart_id;
  elsif cart_vendor <> product_vendor then
    raise exception 'A cart may contain products from one vendor only';
  elsif (select campus_id from public.carts where id = new.cart_id) <> product_campus then
    raise exception 'Cart and product must belong to the same campus';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_vendor_context()
returns trigger language plpgsql as $$
declare vendor_owner uuid; vendor_campus uuid;
begin
  if tg_table_name = 'services' and new.vendor_id is not null then
    select owner_user_id into vendor_owner from public.vendors where id = new.vendor_id;
    if vendor_owner <> new.provider_user_id then raise exception 'Service provider must own the vendor'; end if;
  end if;
  if tg_table_name = 'marketplace_listings' and new.seller_vendor_id is not null then
    select owner_user_id into vendor_owner from public.vendors where id = new.seller_vendor_id;
    if vendor_owner <> new.seller_user_id then raise exception 'Listing seller must own the vendor'; end if;
  end if;
  if tg_table_name = 'products' then
    if not exists (select 1 from public.vendor_campuses vc where vc.vendor_id = new.vendor_id and vc.campus_id = new.campus_id and vc.is_active) then
      raise exception 'Product campus is not enabled for vendor';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_transaction_context()
returns trigger language plpgsql as $$
declare listing_seller uuid; listing_campus uuid; listing_status public.listing_status;
declare service_provider uuid; service_vendor uuid; service_campus uuid;
declare order_vendor uuid; order_campus uuid; product_vendor uuid; product_campus uuid;
begin
  if tg_table_name = 'marketplace_transactions' then
    select seller_user_id, campus_id, status into listing_seller, listing_campus, listing_status
    from public.marketplace_listings where id = new.listing_id;
    if listing_seller <> new.seller_user_id or listing_campus <> new.campus_id then
      raise exception 'Marketplace transaction must match listing seller and campus';
    end if;
    if listing_status <> 'published' and new.status = 'initiated' then
      raise exception 'Only published marketplace listings can start a transaction';
    end if;
  elsif tg_table_name = 'service_requests' then
    select provider_user_id, vendor_id, campus_id into service_provider, service_vendor, service_campus
    from public.services where id = new.service_id;
    if service_provider <> new.provider_user_id or service_vendor is distinct from new.vendor_id or service_campus <> new.campus_id then
      raise exception 'Service request must match its service provider, vendor, and campus';
    end if;
  elsif tg_table_name = 'order_items' then
    select vendor_id, campus_id into order_vendor, order_campus from public.orders where id = new.order_id;
    select vendor_id, campus_id into product_vendor, product_campus from public.products where id = new.product_id;
    if order_vendor <> product_vendor or order_campus <> product_campus then
      raise exception 'Order item must match the order vendor and campus';
    end if;
  end if;
  return new;
end;
$$;

create trigger carts_items_vendor_guard before insert or update on public.cart_items
for each row execute function public.prevent_cart_vendor_mismatch();

create trigger products_vendor_context before insert or update on public.products
for each row execute function public.enforce_vendor_context();
create trigger services_vendor_context before insert or update on public.services
for each row execute function public.enforce_vendor_context();
create trigger listings_vendor_context before insert or update on public.marketplace_listings
for each row execute function public.enforce_vendor_context();
create constraint trigger service_requests_context
after insert or update on public.service_requests deferrable initially deferred
for each row execute function public.enforce_transaction_context();
create constraint trigger marketplace_transactions_context
after insert or update on public.marketplace_transactions deferrable initially deferred
for each row execute function public.enforce_transaction_context();
create constraint trigger order_items_context
after insert or update on public.order_items deferrable initially deferred
for each row execute function public.enforce_transaction_context();
```

Create an `updated_at` trigger on every table containing that column. Add a profile-sync trigger on `auth.users` only if the project wants automatic profile creation; it must use `security definer`, a fixed `search_path`, and only copy safe fields (`id`, `email`, display name metadata). It must never copy a password or token.

### Indexes

```sql
create index idx_users_default_campus on public.users(default_campus_id) where deleted_at is null;
create index idx_user_roles_role on public.user_roles(role, user_id);
create index idx_delivery_zones_campus_active on public.delivery_zones(campus_id) where is_active;
create index idx_categories_parent_sort on public.categories(parent_id, sort_order);
create index idx_vendor_campuses_campus_active on public.vendor_campuses(campus_id, vendor_id) where is_active;
create index idx_vendors_category_status on public.vendors(category_id, status);
create index idx_products_campus_category on public.products(campus_id, category_id) where is_in_stock;
create index idx_products_vendor on public.products(vendor_id);
create index idx_services_campus_category on public.services(campus_id, category_id) where is_active;
create index idx_service_requests_requester_status on public.service_requests(requester_user_id, status, created_at desc);
create index idx_service_requests_provider_status on public.service_requests(provider_user_id, status, created_at desc);
create index idx_marketplace_listings_campus_status on public.marketplace_listings(campus_id, status, created_at desc);
create index idx_marketplace_listings_seller on public.marketplace_listings(seller_user_id, status);
create index idx_marketplace_transactions_buyer on public.marketplace_transactions(buyer_user_id, status, created_at desc);
create index idx_marketplace_transactions_seller on public.marketplace_transactions(seller_user_id, status, created_at desc);
create index idx_cart_items_cart on public.cart_items(cart_id);
create index idx_orders_user_status on public.orders(user_id, status, created_at desc);
create index idx_orders_vendor_status on public.orders(vendor_id, status, created_at desc);
create index idx_orders_campus_status on public.orders(campus_id, status, created_at desc);
create index idx_order_items_order on public.order_items(order_id);
create index idx_order_payments_order_status on public.order_payments(order_id, status);
create index idx_delivery_requests_requester_status on public.delivery_requests(requester_user_id, status, created_at desc);
create index idx_delivery_requests_rider_status on public.delivery_requests(rider_user_id, status, created_at desc);
create index idx_delivery_requests_campus_status on public.delivery_requests(campus_id, status, created_at desc);
create index idx_vendor_reviews_vendor on public.vendor_reviews(vendor_id, created_at desc);
create index idx_product_reviews_product on public.product_reviews(product_id, created_at desc);
create index idx_notifications_user_unread on public.notifications(user_id, created_at desc) where not is_read;
create index idx_audit_logs_actor_created on public.audit_logs(actor_user_id, created_at desc);
create index idx_audit_logs_resource on public.audit_logs(resource_type, resource_id, created_at desc);
```

For search at scale, add generated `tsvector` columns and GIN indexes for product, vendor, service, and listing names/descriptions in a later migration. Do not use unindexed `ILIKE '%term%'` for production-wide search.

## 11. RLS strategy for Supabase (`0009_rls.sql`)

Enable RLS on every `public` table. Expose only safe columns through views where public browsing should not reveal private phone/email fields.

Recommended helper functions, implemented as `security definer` with `set search_path = public`, are `is_admin()`, `is_super_admin()`, `has_role(app_role)`, and `owns_vendor(uuid)`. Each must use `auth.uid()` and never trust a client-supplied role.

| Table | Read policy | Insert/update/delete policy |
|---|---|---|
| `campuses`, `categories`, active `delivery_zones` | Anyone may read active rows | Admin/super admin only |
| `users` | User may read/update own profile; admins may read | Insert only profile-sync function/service role; user may update safe profile fields |
| `user_roles` | User may read own roles; admins manage all | Admin/super admin only |
| `addresses` | Owner only | Owner only; admin support access if required |
| `vendors`, `vendor_campuses`, operating hours | Anyone may read active/verified vendor data | Owner manages own pending vendor; admins manage lifecycle |
| `products`, `services` | Anyone may read active rows | Vendor owner/provider manages own rows; admins manage all |
| `service_requests` | Requester and provider only; admins all | Authenticated requester creates own; requester/provider update allowed fields |
| `marketplace_listings` | Anyone may read published rows; seller/admin may read own moderation rows | Authenticated seller creates own; seller edits own before sold; admins moderate |
| `marketplace_transactions` | Buyer, seller, admins | Authenticated buyer creates for published listing; parties update permitted transaction state |
| `carts`, `cart_items` | Owner only | Owner only; checkout is a controlled transaction |
| `orders`, `order_items`, `order_payments` | Customer sees own; vendor sees own vendor orders; admins all | Customer creates through controlled checkout; vendor updates fulfillment; payment updates service role/webhook only |
| `delivery_requests` | Requester, assigned rider, linked vendor, admins | Requester creates/updates own before acceptance; rider updates assigned jobs |
| review tables | Public read after moderation policy is added; reviewer manages own | Authenticated users insert own reviews; no arbitrary reviewer/order mismatch |
| `notifications` | Recipient only | Service role/admin creates; recipient marks read |
| `audit_logs` | Admin/super admin only | Service role or append-only audit function; no client update/delete |

Use `auth.uid() = user_id` predicates for ownership. For vendor rows, authorize through `vendors.owner_user_id`; for campus filtering, enforce campus membership in the row itself rather than trusting a JWT campus claim. Service-role keys bypass RLS and must remain server-side.

## 12. Seed-data strategy (`0010_seed_reference_data.sql`)

Seed only stable reference data with deterministic slugs and idempotent `insert ... on conflict (...) do update` statements:

- Campuses: `unimaid`, `kiu`, `buk`.
- Delivery zones for each campus, with fees in kobo.
- Top-level categories: `food`, `shopping`, `services`, `marketplace`, `delivery`.
- Category subcategories from the approved frontend data.

Do not seed users, roles, vendors, orders, carts, payments, marketplace transactions, or reviews with fake UUIDs. Create an initial administrator through Supabase Auth, then grant `admin` or `super_admin` using a protected service-role migration/runbook.

## 13. Migration and operational rules

1. Create a Supabase project and apply the migrations in the numbered order above.
2. Confirm `pgcrypto` and the `auth.users` schema are available before `0003`.
3. Load reference data and verify campus/category slugs.
4. Configure the Auth email/phone providers in Supabase; do not create password or session tables.
5. Create the profile-sync trigger or call the profile creation function from the trusted backend.
6. Test RLS with anonymous, normal user, vendor owner, rider, admin, and super-admin JWTs.
7. Backfill real catalog data only after reference IDs are resolved by slug.
8. Add future changes as new migrations. For destructive changes, use an expand/backfill/contract sequence.
9. Keep payment-provider callbacks restricted to a service-role path and record provider references in `order_payments`.
10. Schedule backups, inspect slow-query plans for the listed indexes, and retain audit logs according to the platform retention policy.

## Completion summary

**Tables created:** `campuses`, `delivery_zones`, `categories`, `users`, `user_roles`, `addresses`, `vendors`, `vendor_campuses`, `vendor_operating_hours`, `products`, `services`, `service_requests`, `marketplace_listings`, `marketplace_transactions`, `carts`, `cart_items`, `orders`, `order_items`, `order_payments`, `delivery_requests`, `vendor_reviews`, `product_reviews`, `order_reviews`, `notifications`, `audit_logs`.

**Enums created:** `app_role`, `vendor_status`, `listing_status`, `listing_condition`, `price_type`, `service_delivery_type`, `service_request_status`, `cart_status`, `order_type`, `order_status`, `payment_method`, `payment_status`, `delivery_task_type`, `delivery_status`, `marketplace_transaction_status`, `notification_type`, `address_label`.

**Indexes proposed:** campus/status indexes for catalog, requests, listings, orders, and deliveries; ownership indexes; cart/order child indexes; unread notification and audit-resource indexes; optional later GIN search indexes.

**Constraints proposed:** UUID PKs, `auth.users` FK, required relational FKs, unique slugs/names/ownership/cart/product pairs, non-negative kobo amounts, valid ratings/coordinates/quantities, total arithmetic, lifecycle timestamp checks, and cross-row trigger checks for vendor ownership, campus availability, and single-vendor carts.

**RLS recommendations:** enable RLS on every public table; public-read only active catalog/reference rows; owner-scoped profile/cart/address/request/listing access; vendor-scoped catalog/order access; participant-scoped marketplace and delivery access; admin moderation; service-role-only payment and audit writes.

**Migration order:** extensions/enums -> reference tables -> Supabase-linked identity -> vendors/catalog -> services/marketplace -> cart/orders/delivery -> reviews/notifications/audit -> triggers/indexes -> RLS -> deterministic reference seeds.
