create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_cart_vendor_mismatch()
returns trigger
language plpgsql
as $$
declare
  cart_vendor uuid;
  cart_campus uuid;
  product_vendor uuid;
  product_campus uuid;
begin
  select vendor_id, campus_id into cart_vendor, cart_campus
  from public.carts where id = new.cart_id for update;
  select vendor_id, campus_id into product_vendor, product_campus
  from public.products where id = new.product_id;

  if cart_vendor is null then
    update public.carts set vendor_id = product_vendor, campus_id = product_campus
    where id = new.cart_id;
  elsif cart_vendor <> product_vendor or cart_campus <> product_campus then
    raise exception 'A cart may contain products from one vendor and campus only';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_service_context()
returns trigger
language plpgsql
as $$
declare
  service_provider uuid;
  service_vendor uuid;
  service_campus uuid;
begin
  select provider_user_id, vendor_id, campus_id into service_provider, service_vendor, service_campus
  from public.services where id = new.service_id;
  if service_provider <> new.provider_user_id
     or service_vendor is distinct from new.vendor_id
     or service_campus <> new.campus_id then
    raise exception 'Service request must match its service provider, vendor, and campus';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_order_item_context()
returns trigger
language plpgsql
as $$
declare
  order_vendor uuid;
  order_campus uuid;
  product_vendor uuid;
  product_campus uuid;
begin
  select vendor_id, campus_id into order_vendor, order_campus
  from public.orders where id = new.order_id;
  select vendor_id, campus_id into product_vendor, product_campus
  from public.products where id = new.product_id;
  if order_vendor <> product_vendor or order_campus <> product_campus then
    raise exception 'Order item must match the order vendor and campus';
  end if;
  return new;
end;
$$;

create trigger cart_items_vendor_guard
before insert or update on public.cart_items
for each row execute function public.prevent_cart_vendor_mismatch();

create trigger service_requests_context
before insert or update on public.service_requests
for each row execute function public.enforce_service_context();

create trigger order_items_context
before insert or update on public.order_items
for each row execute function public.enforce_order_item_context();

DO $$
declare table_name text;
begin
  foreach table_name in array array[
    'campuses', 'delivery_zones', 'categories', 'profiles', 'addresses', 'vendors',
    'vendor_operating_hours', 'products', 'services', 'service_requests',
    'marketplace_listings', 'carts', 'cart_items', 'orders', 'order_payments',
    'delivery_requests', 'vendor_reviews', 'product_reviews', 'order_reviews', 'notifications'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

create index idx_delivery_zones_campus_active on public.delivery_zones(campus_id) where is_active;
create index idx_categories_parent_sort on public.categories(parent_id, sort_order);
create index idx_user_roles_role on public.user_roles(role, user_id);
create index idx_profiles_default_campus on public.profiles(default_campus_id) where deleted_at is null;
create index idx_addresses_user_default on public.addresses(user_id, is_default);
create index idx_vendor_campuses_campus_active on public.vendor_campuses(campus_id, vendor_id) where is_active;
create index idx_vendors_category_status on public.vendors(category_id, status);
create index idx_products_campus_category on public.products(campus_id, category_id) where is_in_stock;
create index idx_products_vendor on public.products(vendor_id);
create index idx_product_images_product on public.product_images(product_id, sort_order);
create index idx_services_campus_category on public.services(campus_id, category_id) where is_active;
create index idx_service_requests_requester_status on public.service_requests(requester_user_id, status, created_at desc);
create index idx_service_requests_provider_status on public.service_requests(provider_user_id, status, created_at desc);
create index idx_marketplace_listings_campus_status on public.marketplace_listings(campus_id, status, created_at desc);
create index idx_marketplace_listings_seller on public.marketplace_listings(seller_user_id, status);
create index idx_listing_images_listing on public.listing_images(listing_id, sort_order);
create index idx_cart_items_cart on public.cart_items(cart_id);
create unique index idx_carts_one_active_per_user on public.carts(user_id) where status = 'ACTIVE';
create index idx_orders_user_status on public.orders(user_id, status, created_at desc);
create index idx_orders_vendor_status on public.orders(vendor_id, status, created_at desc);
create index idx_orders_campus_status on public.orders(campus_id, status, created_at desc);
create index idx_orders_delivery_request on public.orders(delivery_request_id);
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
