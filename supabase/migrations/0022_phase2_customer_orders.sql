-- `SERVICE` was committed by 0021 before this migration references it.
-- Checkout quantities are limited to 50 units per product line for MVP abuse control.
create type public.customer_order_status as enum (
  'ORDER_RECEIVED', 'AWAITING_PAYMENT', 'PAYMENT_CONFIRMED', 'ORDER_CONFIRMED',
  'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'RIDER_ASSIGNED',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'PAYMENT_FAILED',
  'REFUND_PENDING', 'REFUNDED'
);

create table public.customer_order_number_counters (
  order_year integer primary key check (order_year between 2020 and 9999),
  last_value integer not null check (last_value between 0 and 9999),
  updated_at timestamptz not null default now()
);

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^CLX-[0-9]{4}-[0-9]{4}$'),
  customer_user_id uuid references public.profiles(id) on delete restrict,
  customer_name text not null check (length(trim(customer_name)) between 2 and 255),
  customer_phone text not null check (length(trim(customer_phone)) between 5 and 40),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  fulfillment_type text not null check (fulfillment_type in ('PICKUP', 'DELIVERY')),
  delivery_zone_id uuid references public.delivery_zones(id) on delete restrict,
  delivery_location text,
  notes text,
  subtotal_kobo bigint not null check (subtotal_kobo >= 0),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  service_fee_kobo bigint not null default 0 check (service_fee_kobo >= 0),
  total_kobo bigint not null check (total_kobo = subtotal_kobo + delivery_fee_kobo + service_fee_kobo),
  status public.customer_order_status not null default 'ORDER_RECEIVED',
  tracking_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((fulfillment_type = 'DELIVERY' and delivery_zone_id is not null and length(trim(delivery_location)) > 0)
    or (fulfillment_type = 'PICKUP' and delivery_fee_kobo = 0))
);

alter table public.orders
  add column customer_order_id uuid references public.customer_orders(id) on delete restrict,
  add column vendor_group_number integer check (vendor_group_number > 0);
alter table public.orders alter column user_id drop not null, alter column delivery_address drop not null;
alter table public.orders add constraint orders_customer_group_context check (
  (customer_order_id is null and vendor_group_number is null) or
  (customer_order_id is not null and vendor_group_number is not null));
create unique index idx_orders_customer_vendor_group on public.orders(customer_order_id, vendor_id) where customer_order_id is not null;
create index idx_orders_customer_order on public.orders(customer_order_id, vendor_group_number) where customer_order_id is not null;

alter table public.order_items
  add column product_name_snapshot text,
  add column vendor_id_snapshot uuid references public.vendors(id) on delete restrict,
  add column vendor_name_snapshot text,
  add column currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$');

create or replace function public.prevent_order_item_snapshot_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.product_name_snapshot is not null and (
    new.product_id is distinct from old.product_id or new.quantity is distinct from old.quantity or
    new.unit_price_kobo is distinct from old.unit_price_kobo or new.total_price_kobo is distinct from old.total_price_kobo or
    new.product_name_snapshot is distinct from old.product_name_snapshot or new.vendor_id_snapshot is distinct from old.vendor_id_snapshot or
    new.vendor_name_snapshot is distinct from old.vendor_name_snapshot or new.currency_code is distinct from old.currency_code
  ) then raise exception 'Order item snapshots are immutable'; end if;
  return new;
end;
$$;
create trigger order_items_snapshot_immutable before update on public.order_items
for each row execute function public.prevent_order_item_snapshot_mutation();

create table public.customer_order_payments (
  id uuid primary key default gen_random_uuid(),
  customer_order_id uuid not null unique references public.customer_orders(id) on delete cascade,
  payment_method public.payment_method not null,
  provider text, provider_reference text, amount_kobo bigint not null check (amount_kobo > 0),
  status public.payment_status not null default 'PENDING',
  verified_by_user_id uuid references public.profiles(id) on delete set null,
  verified_at timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (provider, provider_reference), check ((verified_by_user_id is null) = (verified_at is null))
);
create table public.customer_order_status_history (
  id uuid primary key default gen_random_uuid(),
  customer_order_id uuid not null references public.customer_orders(id) on delete cascade,
  vendor_order_id uuid references public.orders(id) on delete cascade,
  status public.customer_order_status not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.delivery_requests add column customer_order_id uuid references public.customer_orders(id) on delete set null;
alter table public.delivery_requests alter column requester_user_id drop not null;
create unique index idx_delivery_requests_customer_order on public.delivery_requests(customer_order_id) where customer_order_id is not null;
create index idx_customer_order_status_history_order on public.customer_order_status_history(customer_order_id, created_at);
create index idx_customer_orders_customer_user on public.customer_orders(customer_user_id, created_at desc) where customer_user_id is not null;

create or replace function public.set_customer_order_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public as $$ begin new.updated_at = now(); return new; end; $$;
create trigger customer_orders_updated_at before update on public.customer_orders for each row execute function public.set_customer_order_updated_at();
create trigger customer_order_payments_updated_at before update on public.customer_order_payments for each row execute function public.set_customer_order_updated_at();

create or replace function public.next_customer_order_number()
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_year integer := extract(year from current_date)::integer; v_value integer;
begin
  insert into public.customer_order_number_counters (order_year, last_value, updated_at) values (v_year, 1, now())
  on conflict (order_year) do update set last_value = public.customer_order_number_counters.last_value + 1, updated_at = now()
  returning last_value into v_value;
  if v_value > 9999 then raise exception 'CLX order-number capacity reached for %', v_year; end if;
  return format('CLX-%s-%s', v_year, lpad(v_value::text, 4, '0'));
end;
$$;

create or replace function public.create_customer_order(
  p_items jsonb, p_campus_id uuid, p_fulfillment_type text, p_customer_name text,
  p_customer_phone text, p_payment_method text, p_delivery_location text default null,
  p_delivery_zone_id uuid default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_item jsonb; v_product record; v_vendor record; v_group record; v_product_id uuid; v_quantity integer;
  v_expected_price bigint; v_line_total_kobo bigint; v_root_slug text; v_order_type public.order_type;
  v_product_ids uuid[] := array[]::uuid[]; v_trusted_items jsonb := '[]'::jsonb; v_price_updates jsonb := '[]'::jsonb;
  v_subtotal_kobo bigint := 0; v_delivery_fee_kobo bigint := 0; v_service_fee_kobo bigint := 0;
  v_total_kobo bigint; v_customer_order_id uuid; v_vendor_order_id uuid; v_order_number text; v_tracking_token text;
  v_customer_user_id uuid := auth.uid(); v_group_number integer := 0; v_pickup_location text;
  v_max_kobo constant bigint := 9223372036854775807;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    return jsonb_build_object('success', false, 'code', 'INVALID_ITEMS', 'message', 'Submit between 1 and 100 distinct items.'); end if;
  if p_fulfillment_type not in ('PICKUP', 'DELIVERY') then return jsonb_build_object('success', false, 'code', 'INVALID_FULFILLMENT', 'message', 'Fulfillment must be PICKUP or DELIVERY.'); end if;
  if p_payment_method not in ('CASH_ON_DELIVERY', 'CARD', 'BANK_TRANSFER') then return jsonb_build_object('success', false, 'code', 'INVALID_PAYMENT_METHOD', 'message', 'Unsupported payment method.'); end if;
  if length(trim(coalesce(p_customer_name, ''))) not between 2 and 255 or length(trim(coalesce(p_customer_phone, ''))) not between 5 and 40 then
    return jsonb_build_object('success', false, 'code', 'INVALID_CUSTOMER_DETAILS', 'message', 'Customer name or phone number is invalid.'); end if;
  if not exists (select 1 from public.campuses c where c.id = p_campus_id and c.is_active) then return jsonb_build_object('success', false, 'code', 'INVALID_CAMPUS', 'message', 'The selected campus is unavailable.'); end if;
  if p_fulfillment_type = 'DELIVERY' then
    if length(trim(coalesce(p_delivery_location, ''))) = 0 or p_delivery_zone_id is null then return jsonb_build_object('success', false, 'code', 'DELIVERY_ZONE_REQUIRED', 'message', 'An active delivery zone and location are required for delivery.'); end if;
    select dz.base_delivery_fee_kobo into v_delivery_fee_kobo from public.delivery_zones dz where dz.id = p_delivery_zone_id and dz.campus_id = p_campus_id and dz.is_active;
    if not found then return jsonb_build_object('success', false, 'code', 'INVALID_DELIVERY_ZONE', 'message', 'The selected delivery zone is unavailable.'); end if;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or coalesce(v_item->>'quantity', '') !~ '^([1-9]|[1-4][0-9]|50)$' then
      return jsonb_build_object('success', false, 'code', 'INVALID_ITEM', 'message', 'Each item requires a valid product ID and quantity from 1 to 50.'); end if;
    v_product_id := (v_item->>'product_id')::uuid; v_quantity := (v_item->>'quantity')::integer;
    if v_product_id = any(v_product_ids) then return jsonb_build_object('success', false, 'code', 'DUPLICATE_PRODUCT', 'message', 'Combine quantities for duplicate products.', 'product_id', v_product_id); end if;
    v_product_ids := array_append(v_product_ids, v_product_id);
    select p.* into v_product from public.products p where p.id = v_product_id for update;
    if not found then return jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'A requested product no longer exists.', 'product_id', v_product_id); end if;
    if v_product.campus_id <> p_campus_id then return jsonb_build_object('success', false, 'code', 'CROSS_CAMPUS_PRODUCT', 'message', 'All products must belong to the selected campus.', 'product_id', v_product_id); end if;
    if not v_product.is_in_stock or (v_product.stock_quantity is not null and v_product.stock_quantity < v_quantity) then return jsonb_build_object('success', false, 'code', 'PRODUCT_UNAVAILABLE', 'message', 'A requested product is unavailable.', 'product_id', v_product_id); end if;
    select v.name, v.location into v_vendor from public.vendors v join public.vendor_campuses vc on vc.vendor_id = v.id and vc.campus_id = v_product.campus_id where v.id = v_product.vendor_id and v.status = 'ACTIVE'::public.vendor_status and vc.is_active;
    if not found then return jsonb_build_object('success', false, 'code', 'VENDOR_UNAVAILABLE', 'message', 'A requested vendor is unavailable.', 'product_id', v_product_id); end if;
    if exists (with recursive a as (select c.id,c.parent_id,c.is_active from public.categories c where c.id=v_product.category_id union all select p.id,p.parent_id,p.is_active from public.categories p join a on a.parent_id=p.id) select 1 from a where is_active=false) then return jsonb_build_object('success', false, 'code', 'PRODUCT_UNAVAILABLE', 'message', 'A requested product is unavailable.', 'product_id', v_product_id); end if;
    with recursive a as (select c.id,c.parent_id,c.slug from public.categories c where c.id=v_product.category_id union all select p.id,p.parent_id,p.slug from public.categories p join a on a.parent_id=p.id) select slug into v_root_slug from a where parent_id is null limit 1;
    if v_root_slug='food' then v_order_type := 'FOOD'::public.order_type; elsif v_root_slug='shopping' then v_order_type := 'SHOPPING'::public.order_type; elsif v_root_slug='services' then v_order_type := 'SERVICE'::public.order_type; else return jsonb_build_object('success', false, 'code', 'UNSUPPORTED_PRODUCT_CATEGORY', 'message', 'A requested product category cannot be checked out yet.', 'product_id', v_product_id); end if;
    if v_product.price_kobo > v_max_kobo / v_quantity then return jsonb_build_object('success', false, 'code', 'AMOUNT_TOO_LARGE', 'message', 'The requested order amount is too large.'); end if;
    v_line_total_kobo := v_product.price_kobo * v_quantity;
    if v_subtotal_kobo > v_max_kobo - v_line_total_kobo then return jsonb_build_object('success', false, 'code', 'AMOUNT_TOO_LARGE', 'message', 'The requested order amount is too large.'); end if;
    if v_item ? 'client_unit_price_kobo' then
      if coalesce(v_item->>'client_unit_price_kobo','') !~ '^[0-9]{1,15}$' then return jsonb_build_object('success', false, 'code', 'INVALID_ITEM', 'message', 'The remembered price is invalid.', 'product_id', v_product_id); end if;
      v_expected_price := (v_item->>'client_unit_price_kobo')::bigint;
      if v_expected_price <> v_product.price_kobo then v_price_updates := v_price_updates || jsonb_build_array(jsonb_build_object('product_id',v_product_id,'previous_unit_price_kobo',v_expected_price,'current_unit_price_kobo',v_product.price_kobo)); end if;
    end if;
    v_subtotal_kobo := v_subtotal_kobo + v_line_total_kobo;
    v_trusted_items := v_trusted_items || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'vendor_id',v_product.vendor_id,'vendor_name',v_vendor.name,'vendor_location',v_vendor.location,'quantity',v_quantity,'unit_price_kobo',v_product.price_kobo,'line_total_kobo',v_line_total_kobo,'order_type',v_order_type::text));
  end loop;
  if jsonb_array_length(v_price_updates)>0 then return jsonb_build_object('success',false,'code','PRICE_CHANGED','message','One or more prices changed.','price_updates',v_price_updates); end if;
  if exists (select 1 from jsonb_to_recordset(v_trusted_items) as i(vendor_id uuid,order_type text) group by i.vendor_id having count(distinct i.order_type)>1) then return jsonb_build_object('success',false,'code','MIXED_VENDOR_ORDER_TYPE','message','Products from one vendor must share a checkout type.'); end if;
  if v_subtotal_kobo > v_max_kobo - v_delivery_fee_kobo or v_subtotal_kobo + v_delivery_fee_kobo > v_max_kobo - v_service_fee_kobo then return jsonb_build_object('success',false,'code','AMOUNT_TOO_LARGE','message','The requested order amount is too large.'); end if;
  v_total_kobo := v_subtotal_kobo + v_delivery_fee_kobo + v_service_fee_kobo; v_order_number := public.next_customer_order_number(); v_tracking_token := encode(gen_random_bytes(32),'hex');
  insert into public.customer_orders (order_number,customer_user_id,customer_name,customer_phone,campus_id,fulfillment_type,delivery_zone_id,delivery_location,notes,subtotal_kobo,delivery_fee_kobo,service_fee_kobo,total_kobo,tracking_token_hash) values (v_order_number,v_customer_user_id,trim(p_customer_name),trim(p_customer_phone),p_campus_id,p_fulfillment_type,case when p_fulfillment_type='DELIVERY' then p_delivery_zone_id end,case when p_fulfillment_type='DELIVERY' then trim(p_delivery_location) end,nullif(trim(coalesce(p_notes,'')),''),v_subtotal_kobo,v_delivery_fee_kobo,v_service_fee_kobo,v_total_kobo,crypt(v_tracking_token,gen_salt('bf',12))) returning id into v_customer_order_id;
  for v_group in select i.vendor_id,max(i.vendor_name) vendor_name,max(i.order_type) order_type,sum(i.line_total_kobo) subtotal_kobo from jsonb_to_recordset(v_trusted_items) as i(vendor_id uuid,vendor_name text,order_type text,line_total_kobo bigint) group by i.vendor_id order by i.vendor_id loop
    v_group_number := v_group_number + 1;
    insert into public.orders (user_id,vendor_id,campus_id,delivery_address,type,subtotal_kobo,delivery_fee_kobo,service_fee_kobo,total_kobo,payment_method,payment_status,status,customer_order_id,vendor_group_number) values (v_customer_user_id,v_group.vendor_id,p_campus_id,null,v_group.order_type::public.order_type,v_group.subtotal_kobo,0,0,v_group.subtotal_kobo,p_payment_method::public.payment_method,'PENDING','PENDING',v_customer_order_id,v_group_number) returning id into v_vendor_order_id;
    insert into public.order_items (order_id,product_id,quantity,unit_price_kobo,total_price_kobo,product_name_snapshot,vendor_id_snapshot,vendor_name_snapshot,currency_code) select v_vendor_order_id,i.product_id,i.quantity,i.unit_price_kobo,i.line_total_kobo,i.product_name,i.vendor_id,i.vendor_name,'NGN' from jsonb_to_recordset(v_trusted_items) as i(product_id uuid,product_name text,vendor_id uuid,vendor_name text,quantity integer,unit_price_kobo bigint,line_total_kobo bigint) where i.vendor_id=v_group.vendor_id;
    update public.products p set stock_quantity=p.stock_quantity-i.quantity,is_in_stock=case when p.stock_quantity-i.quantity=0 then false else p.is_in_stock end from jsonb_to_recordset(v_trusted_items) as i(product_id uuid,vendor_id uuid,quantity integer) where p.id=i.product_id and i.vendor_id=v_group.vendor_id and p.stock_quantity is not null;
    insert into public.customer_order_status_history(customer_order_id,vendor_order_id,status,actor_user_id) values(v_customer_order_id,v_vendor_order_id,'ORDER_RECEIVED',v_customer_user_id);
  end loop;
  insert into public.customer_order_payments(customer_order_id,payment_method,amount_kobo,status) values(v_customer_order_id,p_payment_method::public.payment_method,v_total_kobo,'PENDING');
  if p_fulfillment_type='DELIVERY' then
    select string_agg(distinct i.vendor_name||': '||i.vendor_location,'; ' order by i.vendor_name||': '||i.vendor_location) into v_pickup_location from jsonb_to_recordset(v_trusted_items) as i(vendor_name text,vendor_location text);
    insert into public.delivery_requests(requester_user_id,rider_user_id,campus_id,customer_order_id,task_type,pickup_location,dropoff_location,estimated_fee_kobo,status) values(v_customer_user_id,null,p_campus_id,v_customer_order_id,'DELIVERY',v_pickup_location,trim(p_delivery_location),v_delivery_fee_kobo,'REQUESTED');
  end if;
  insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(v_customer_order_id,'ORDER_RECEIVED',v_customer_user_id);
  return jsonb_build_object('success',true,'order_number',v_order_number,'tracking_token',v_tracking_token,'customer_name',trim(p_customer_name),'fulfillment_type',p_fulfillment_type,'subtotal_kobo',v_subtotal_kobo,'delivery_fee_kobo',v_delivery_fee_kobo,'service_fee_kobo',v_service_fee_kobo,'total_kobo',v_total_kobo,'order_status','ORDER_RECEIVED','payment_status','PENDING','vendor_groups',(select coalesce(jsonb_agg(jsonb_build_object('vendor_name',g.vendor_name,'subtotal_kobo',g.subtotal_kobo,'items',g.items) order by g.vendor_name),'[]'::jsonb) from (select i.vendor_name,sum(i.line_total_kobo) subtotal_kobo,jsonb_agg(jsonb_build_object('product_name',i.product_name,'quantity',i.quantity,'unit_price_kobo',i.unit_price_kobo,'line_total_kobo',i.line_total_kobo,'currency','NGN') order by i.product_name) items from jsonb_to_recordset(v_trusted_items) as i(vendor_name text,product_name text,quantity integer,unit_price_kobo bigint,line_total_kobo bigint) group by i.vendor_name) g));
end;
$$;

create or replace function public.get_customer_order_tracking(p_order_number text,p_tracking_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_order public.customer_orders%rowtype;
begin
  if length(trim(coalesce(p_order_number,'')))>32 or length(coalesce(p_tracking_token,'')) not between 32 and 256 then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
  select co.* into v_order from public.customer_orders co where co.order_number=trim(p_order_number) and co.tracking_token_hash=crypt(p_tracking_token,co.tracking_token_hash);
  if not found then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
  return jsonb_build_object('success',true,'order_number',v_order.order_number,'fulfillment_type',v_order.fulfillment_type,'status',v_order.status,'payment_status',coalesce((select cop.status from public.customer_order_payments cop where cop.customer_order_id=v_order.id),'PENDING'::public.payment_status),'vendor_groups',(select coalesce(jsonb_agg(jsonb_build_object('vendor_name',o.vendor_name,'status',o.status,'items',o.items) order by o.vendor_name),'[]'::jsonb) from (select oi.vendor_name_snapshot vendor_name,ord.status,jsonb_agg(jsonb_build_object('product_name',oi.product_name_snapshot,'quantity',oi.quantity,'line_total_kobo',oi.total_price_kobo,'currency',oi.currency_code) order by oi.product_name_snapshot) items from public.orders ord join public.order_items oi on oi.order_id=ord.id where ord.customer_order_id=v_order.id group by ord.id,oi.vendor_name_snapshot,ord.status) o));
end;
$$;

alter table public.customer_order_number_counters enable row level security;
alter table public.customer_orders enable row level security;
alter table public.customer_order_payments enable row level security;
alter table public.customer_order_status_history enable row level security;
create policy customer_orders_select_own on public.customer_orders for select to authenticated using (customer_user_id=auth.uid() or public.is_admin());
create policy customer_orders_admin_manage on public.customer_orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy customer_order_payments_select_admin on public.customer_order_payments for select to authenticated using (public.is_admin());
create policy customer_order_payments_admin_manage on public.customer_order_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy customer_order_status_history_select_admin on public.customer_order_status_history for select to authenticated using (public.is_admin());
create policy customer_order_status_history_admin_manage on public.customer_order_status_history for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke create on schema public from public;
revoke create on schema public from anon, authenticated;
revoke all on function public.next_customer_order_number() from public;
revoke all on function public.create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text) from public;
revoke all on function public.get_customer_order_tracking(text,text) from public;
grant execute on function public.create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text) to anon, authenticated;
grant execute on function public.get_customer_order_tracking(text,text) to anon, authenticated;