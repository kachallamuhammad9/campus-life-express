-- Phase 4C: dedicated least-privilege JARVIS reader database role and Auth hook.
-- Intended for a catalog that has passed the preceding strict routine manifest.
begin;

create role jarvis_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant jarvis_reader to authenticator;
grant usage on schema public to jarvis_reader;

create table public.jarvis_reader_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint jarvis_reader_identities_disabled_at_check check (
    (enabled and disabled_at is null) or (not enabled)
  )
);
alter table public.jarvis_reader_identities enable row level security;
revoke all on table public.jarvis_reader_identities from public, anon, authenticated, jarvis_reader;

create function public.is_jarvis_reader()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.jarvis_reader_identities identity_map
    where identity_map.user_id = auth.uid()
      and identity_map.enabled
  );
$$;
revoke all on function public.is_jarvis_reader() from public, anon, authenticated, service_role;
grant execute on function public.is_jarvis_reader() to jarvis_reader;

create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
begin
  if (event ->> 'user_id') is not null
     and exists (
       select 1
       from public.jarvis_reader_identities identity_map
       where identity_map.user_id = (event ->> 'user_id')::uuid
         and identity_map.enabled
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

create policy customer_orders_jarvis_reader_select
on public.customer_orders
for select to jarvis_reader
using ((select public.is_jarvis_reader()));

create policy products_jarvis_reader_select
on public.products
for select to jarvis_reader
using ((select public.is_jarvis_reader()));

create policy vendors_jarvis_reader_select
on public.vendors
for select to jarvis_reader
using ((select public.is_jarvis_reader()));

grant select (
  order_number, status, fulfillment_type, subtotal_kobo, delivery_fee_kobo,
  service_fee_kobo, total_kobo, created_at, updated_at
) on public.customer_orders to jarvis_reader;
grant select (
  id, name, vendor_id, campus_id, price_kobo, is_in_stock, stock_quantity
) on public.products to jarvis_reader;
grant select (id, name, status, is_verified) on public.vendors to jarvis_reader;

create view public.jarvis_reader_customer_orders
with (security_invoker = true, security_barrier = true)
as
select order_number, status, fulfillment_type, subtotal_kobo, delivery_fee_kobo,
       service_fee_kobo, total_kobo, created_at, updated_at
from public.customer_orders;

create view public.jarvis_reader_products
with (security_invoker = true, security_barrier = true)
as
select id, name, vendor_id, campus_id, price_kobo, is_in_stock, stock_quantity
from public.products;

create view public.jarvis_reader_vendors
with (security_invoker = true, security_barrier = true)
as
select id, name, status, is_verified
from public.vendors;

revoke all on public.jarvis_reader_customer_orders from public, anon, authenticated, service_role;
revoke all on public.jarvis_reader_products from public, anon, authenticated, service_role;
revoke all on public.jarvis_reader_vendors from public, anon, authenticated, service_role;
grant select on public.jarvis_reader_customer_orders, public.jarvis_reader_products, public.jarvis_reader_vendors to jarvis_reader;

do $$
declare
  unexpected regprocedure;
begin
  select p.oid::regprocedure into unexpected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
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

-- Rollback (only with an approved outage window): revoke jarvis_reader from
-- authenticator; revoke grants; drop the three reader views and reader policies;
-- revoke/drop hook and is_jarvis_reader; drop the protected mapping; drop role.
-- Re-run the function privilege audit; do not restore PUBLIC EXECUTE.
