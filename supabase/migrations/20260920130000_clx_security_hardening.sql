-- CLX Final Security Hardening Batch
-- This migration consolidates independent security improvements for the CLX platform,
-- ensuring least-privilege routine access, trigger safety, and RLS isolation.

begin;

-- 1. Routine Privilege Hardening
-- Revoke wholesale execution from public roles and grant only to intended API roles.
do $$
declare
  rproc record;
begin
  for rproc in
    select fn.oid::regprocedure as signature
    from pg_proc fn
    join pg_namespace n on n.oid = fn.pronamespace
    where n.nspname = 'public' and fn.prokind in ('f', 'p')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', rproc.signature);
  end loop;
end $$;

-- Re-grant required public API functions
grant execute on function public.create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text,text) to anon, authenticated;
grant execute on function public.create_customer_order_v2(jsonb,uuid,text,text,text,text,uuid,text,text,uuid,text,text) to anon, authenticated;
grant execute on function public.get_customer_order_tracking(text,text) to anon, authenticated;
grant execute on function public.submit_vendor_application(uuid,text,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.get_customer_order_refunds(text[]) to authenticated;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.has_role(public.app_role) to anon, authenticated, service_role;
grant execute on function public.get_user_vendor_ids() to anon, authenticated, service_role;
grant execute on function public.owns_vendor(uuid) to anon, authenticated, service_role;

-- Re-grant admin/operational functions
grant execute on function public.verify_customer_order_payment(uuid) to authenticated, service_role;
grant execute on function public.admin_advance_vendor_order(uuid, public.order_status) to authenticated, service_role;
grant execute on function public.admin_cancel_customer_order(uuid, text) to authenticated, service_role;
grant execute on function public.admin_request_order_refund(uuid, text) to authenticated, service_role;
grant execute on function public.admin_confirm_order_refund(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.admin_review_vendor_application(uuid, public.vendor_application_status, text, text) to authenticated, service_role;
grant execute on function public.admin_approve_vendor_application(uuid) to authenticated, service_role;
grant execute on function public.admin_create_product(uuid, uuid, uuid, text, bigint, text, uuid, bigint, text, boolean, integer) to authenticated, service_role;
grant execute on function public.admin_update_product(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_create_service(uuid, uuid, uuid, text, uuid, text, bigint, public.price_type, text, text, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.admin_update_service(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_create_rider(text, text, uuid, boolean, boolean) to authenticated, service_role;
grant execute on function public.admin_update_rider(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_assign_delivery_rider(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_advance_delivery_request(uuid, public.delivery_status) to authenticated, service_role;
grant execute on function public.admin_complete_pickup_order(uuid) to authenticated, service_role;
grant execute on function public.admin_complete_delivery_order(uuid) to authenticated, service_role;
grant execute on function public.admin_archive_rider(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_rider(uuid) to authenticated, service_role;
grant execute on function public.admin_archive_product(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_product(uuid) to authenticated, service_role;
grant execute on function public.admin_bulk_delete_products(uuid[]) to authenticated, service_role;
grant execute on function public.admin_bulk_archive_products(uuid[]) to authenticated, service_role;
grant execute on function public.admin_archive_vendor(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_update_vendor(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_vendor(uuid) to authenticated, service_role;
grant execute on function public.admin_archive_service(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_service(uuid) to authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public;

-- 2. Trigger Search Path Hardening
-- Pin search paths to prevent caller-controlled object resolution in triggers.
alter function public.enforce_order_item_context() set search_path = pg_catalog, public, pg_temp;
alter function public.set_updated_at() set search_path = pg_catalog, public, pg_temp;
alter function public.prevent_cart_vendor_mismatch() set search_path = pg_catalog, public, pg_temp;

-- 3. RLS Isolation
-- Ensure customer order selects only evaluate for the authenticated role.
drop policy if exists customer_orders_select_own on public.customer_orders;
create policy customer_orders_select_own on public.customer_orders
  for select to authenticated
  using (
    case
      when current_user = 'authenticated'
        then customer_user_id = auth.uid() or public.is_admin()
      else false
    end
  );

-- Restrict public vendor reads to legitimate API roles.
drop policy if exists vendors_select_public on public.vendors;
create policy vendors_select_public on public.vendors
  for select to anon, authenticated, service_role
  using (
    status = 'ACTIVE'::public.vendor_status
    or (auth.uid() is not null and owner_user_id = auth.uid())
    or public.is_admin()
  );

-- Standardize product select policy (clean of external reader dependencies).
drop policy if exists products_select_public on public.products;
create policy products_select_public on public.products
  for select to anon, authenticated, service_role
  using (
    (is_active and exists (
      select 1
      from public.vendors v
      join public.vendor_campuses vc on vc.vendor_id = v.id
        and vc.campus_id = products.campus_id
      join public.campuses c on c.id = products.campus_id
      join public.categories cat on cat.id = products.category_id
      where v.id = products.vendor_id
        and v.status = 'ACTIVE'::public.vendor_status
        and v.is_verified
        and vc.is_active
        and c.is_active
        and cat.is_active
        and (products.subcategory_id is null or exists (
          select 1 from public.categories sub
          where sub.id = products.subcategory_id
            and sub.is_active and sub.parent_id = cat.id
        ))
    )) or public.is_admin()
  );

commit;
