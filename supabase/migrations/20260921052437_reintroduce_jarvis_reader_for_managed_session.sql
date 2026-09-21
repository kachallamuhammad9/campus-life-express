-- Phase 4C forward-only repair for recorded reader-core/object drift.
-- This migration is intentionally guarded and must not be replayed blindly.
-- It does not edit migration history or create an Auth identity.
begin;

do $$
declare
  missing text;
  unexpected text;
  required_columns text[];
  required_column text;
  routine_name text;
begin
  foreach missing in array array['auth.users','public.customer_orders','public.products','public.vendors'] loop
    if to_regclass(missing) is null then
      raise exception 'Reader repair prerequisite is missing: %', missing;
    end if;
  end loop;

  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    raise exception 'Reader repair prerequisite role authenticator is missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    raise exception 'Reader repair prerequisite role supabase_auth_admin is missing';
  end if;

  if exists (
    select 1
    from (values ('public.customer_orders'::text), ('public.products'::text), ('public.vendors'::text)) v(relation_name)
    join pg_class c on c.oid = to_regclass(v.relation_name)
    where not c.relrowsecurity
  ) then
    raise exception 'Reader repair requires RLS on customer_orders, products, and vendors';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
  ) then
    raise exception 'Reader repair requires PUBLIC EXECUTE count to be zero';
  end if;

  foreach routine_name in array array['enforce_order_item_context()','prevent_cart_vendor_mismatch()','set_updated_at()'] loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid::regprocedure::text = routine_name
        and p.proconfig @> array['search_path=pg_catalog, public, pg_temp']::text[]
    ) then
      raise exception 'Reader repair prerequisite trigger search_path is not pinned: %', routine_name;
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'jarvis_reader')
     or to_regclass('public.jarvis_reader_identities') is not null
     or to_regprocedure('public.is_jarvis_reader()') is not null
     or to_regprocedure('public.custom_access_token_hook(jsonb)') is not null
     or to_regclass('public.jarvis_reader_customer_orders') is not null
     or to_regclass('public.jarvis_reader_products') is not null
     or to_regclass('public.jarvis_reader_vendors') is not null then
    raise exception 'Reader repair requires all reader-core objects to be absent';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and (
        policyname in ('customer_orders_jarvis_reader_select','products_jarvis_reader_select','vendors_jarvis_reader_select')
        or 'jarvis_reader' = any(roles)
      )
  ) then
    raise exception 'Reader repair found a conflicting reader policy';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_orders' and policyname = 'customer_orders_select_own')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'products_select_public')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_select_public') then
    raise exception 'Reader repair requires the corrected ordinary CLX policies';
  end if;

  required_columns := array['order_number','status','fulfillment_type','subtotal_kobo','delivery_fee_kobo','service_fee_kobo','total_kobo','created_at','updated_at'];
  foreach required_column in array required_columns loop
    if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'customer_orders' and c.column_name = required_column) then
      raise exception 'Missing customer_orders reader column: %', required_column;
    end if;
  end loop;
  required_columns := array['id','name','vendor_id','campus_id','price_kobo','is_in_stock','stock_quantity'];
  foreach required_column in array required_columns loop
    if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'products' and c.column_name = required_column) then
      raise exception 'Missing products reader column: %', required_column;
    end if;
  end loop;
  required_columns := array['id','name','status','is_verified'];
  foreach required_column in array required_columns loop
    if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'vendors' and c.column_name = required_column) then
      raise exception 'Missing vendors reader column: %', required_column;
    end if;
  end loop;
end $$;

create role jarvis_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant jarvis_reader to authenticator;
grant usage on schema public to jarvis_reader;

create table public.jarvis_reader_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint jarvis_reader_identities_disabled_at_check check ((enabled and disabled_at is null) or (not enabled))
);
alter table public.jarvis_reader_identities enable row level security;
revoke all on table public.jarvis_reader_identities from public, anon, authenticated, jarvis_reader;

create function public.is_jarvis_reader()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.jarvis_reader_identities identity_map
    where identity_map.user_id = auth.uid() and identity_map.enabled
  );
$$;
revoke all on function public.is_jarvis_reader() from public, anon, authenticated, service_role;
grant execute on function public.is_jarvis_reader() to jarvis_reader;

create function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
begin
  if (event ->> 'user_id') is not null
     and exists (
       select 1 from public.jarvis_reader_identities identity_map
       where identity_map.user_id = (event ->> 'user_id')::uuid and identity_map.enabled
     ) then
    claims := jsonb_set(claims, '{role}', '"jarvis_reader"'::jsonb, true);
    event := jsonb_set(event, '{claims}', claims, true);
  end if;
  return event;
end;
$$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role, jarvis_reader;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

create policy customer_orders_jarvis_reader_select on public.customer_orders
  for select to jarvis_reader using ((select public.is_jarvis_reader()));
create policy products_jarvis_reader_select on public.products
  for select to jarvis_reader using ((select public.is_jarvis_reader()));
create policy vendors_jarvis_reader_select on public.vendors
  for select to jarvis_reader using ((select public.is_jarvis_reader()));

grant select (order_number, status, fulfillment_type, subtotal_kobo, delivery_fee_kobo, service_fee_kobo, total_kobo, created_at, updated_at)
  on public.customer_orders to jarvis_reader;
grant select (id, name, vendor_id, campus_id, price_kobo, is_in_stock, stock_quantity)
  on public.products to jarvis_reader;
grant select (id, name, status, is_verified) on public.vendors to jarvis_reader;

create view public.jarvis_reader_customer_orders
with (security_invoker = true, security_barrier = true) as
select order_number, status, fulfillment_type, subtotal_kobo, delivery_fee_kobo,
       service_fee_kobo, total_kobo, created_at, updated_at
from public.customer_orders;
create view public.jarvis_reader_products
with (security_invoker = true, security_barrier = true) as
select id, name, vendor_id, campus_id, price_kobo, is_in_stock, stock_quantity
from public.products;
create view public.jarvis_reader_vendors
with (security_invoker = true, security_barrier = true) as
select id, name, status, is_verified
from public.vendors;

revoke all on public.jarvis_reader_customer_orders from public, anon, authenticated, service_role;
revoke all on public.jarvis_reader_products from public, anon, authenticated, service_role;
revoke all on public.jarvis_reader_vendors from public, anon, authenticated, service_role;
grant select on public.jarvis_reader_customer_orders, public.jarvis_reader_products, public.jarvis_reader_vendors to jarvis_reader;

do $$
declare unexpected regprocedure;
begin
  select p.oid::regprocedure into unexpected
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and has_function_privilege('jarvis_reader', p.oid, 'execute')
    and p.oid::regprocedure::text <> 'is_jarvis_reader()'
  limit 1;
  if unexpected is not null then
    raise exception 'jarvis_reader must not execute public routine: %', unexpected;
  end if;
end $$;

commit;
