-- Phase 4C: strict public-routine manifest and least-privilege execution grants.
-- This migration intentionally aborts rather than guessing when the production
-- routine catalog differs from the reviewed CLX manifest.
begin;

do $$
declare
  unexpected regprocedure;
begin
  select p.oid::regprocedure into unexpected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and p.oid::regprocedure::text not in (
      'set_updated_at()', 'prevent_cart_vendor_mismatch()',
      'enforce_service_context()', 'enforce_order_item_context()',
      'is_admin()', 'has_role(app_role)', 'get_user_vendor_ids()',
      'owns_vendor(uuid)', 'prevent_order_item_snapshot_mutation()',
      'set_customer_order_updated_at()', 'next_customer_order_number()',
      'create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text,text)',
      'create_customer_order_v2(jsonb,uuid,text,text,text,text,uuid,text,text,uuid,text,text)',
      'get_customer_order_tracking(text,text)',
      'verify_customer_order_payment(uuid)',
      'admin_advance_vendor_order(uuid,order_status)',
      '_vendor_app_next_number(integer)', '_vendor_app_normalize_ng_phone(text)',
      'submit_vendor_application(uuid,text,text,text,text,text,text,text,text)',
      'admin_review_vendor_application(uuid,vendor_application_status,text,text)',
      'admin_approve_vendor_application(uuid)',
      '_admin_product_image_url(text)',
      'admin_create_product(uuid,uuid,uuid,text,bigint,text,uuid,bigint,text,boolean,integer)',
      'admin_update_product(uuid,jsonb)',
      '_admin_service_image_url(text)', '_admin_validate_service(services)',
      '_admin_service_slug(text,uuid,uuid,uuid,uuid)',
      'admin_create_service(uuid,uuid,uuid,text,uuid,text,bigint,price_type,text,text,boolean,boolean,boolean)',
      'admin_update_service(uuid,jsonb)', '_admin_normalize_ng_phone(text)',
      '_admin_delivery_context(uuid,boolean)',
      'admin_create_rider(text,text,uuid,boolean,boolean)', 'admin_update_rider(uuid,jsonb)',
      'admin_assign_delivery_rider(uuid,uuid)',
      'admin_advance_delivery_request(uuid,delivery_status)',
      'admin_complete_pickup_order(uuid)', 'admin_complete_delivery_order(uuid)',
      '_admin_lifecycle_guard()', 'admin_archive_rider(uuid,boolean)',
      'admin_delete_rider(uuid)', 'admin_archive_product(uuid,boolean)',
      'admin_delete_product(uuid)', 'admin_bulk_delete_products(uuid[])',
      'admin_bulk_archive_products(uuid[])', 'admin_archive_vendor(uuid,boolean)',
      'admin_update_vendor(uuid,jsonb)', 'admin_delete_vendor(uuid)',
      'admin_archive_service(uuid,boolean)', 'admin_delete_service(uuid)',
      'admin_cancel_customer_order(uuid,text)',
      'admin_request_order_refund(uuid,text)',
      'admin_confirm_order_refund(uuid,boolean,text)',
      '_customer_order_refund_summary(uuid)', 'get_customer_order_refunds(text[])',
      '_guard_refund_order_state()', 'rls_auto_enable()'
    )
  limit 1;

  if unexpected is not null then
    raise exception 'Function hardening requires review of unexpected public routine: %', unexpected;
  end if;
end $$;

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

grant execute on function public.create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text,text) to anon, authenticated;
grant execute on function public.create_customer_order_v2(jsonb,uuid,text,text,text,text,uuid,text,text,uuid,text,text) to anon, authenticated;
grant execute on function public.get_customer_order_tracking(text,text) to anon, authenticated;
grant execute on function public.submit_vendor_application(uuid,text,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.get_customer_order_refunds(text[]) to authenticated;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.has_role(public.app_role) to anon, authenticated, service_role;
grant execute on function public.get_user_vendor_ids() to anon, authenticated, service_role;
grant execute on function public.owns_vendor(uuid) to anon, authenticated, service_role;

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

commit;

-- Rollback: restore only grants confirmed by the pre-deployment privilege export;
-- never restore PUBLIC EXECUTE wholesale.
