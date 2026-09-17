-- CLX Phase 4.4 correction: preserve historical safety and prevent archived products
-- from remaining purchasable through the existing checkout RPC.
begin;

create or replace function public.admin_archive_product(p_product_id uuid, p_restore boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  update public.products
  set is_active=p_restore,
      is_in_stock=case when p_restore then is_in_stock else false end,
      updated_at=now()
  where id=p_product_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Product was not found.'); end if;
  return jsonb_build_object('success',true,'action',case when p_restore then 'restored' else 'archived' end,'message',case when p_restore then 'Product restored.' else 'Product archived and removed from purchase availability.' end);
end $$;

create or replace function public.admin_delete_rider(p_rider_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare delivery_count integer;
begin
  perform public._admin_lifecycle_guard();
  select count(*)::integer into delivery_count from public.delivery_requests where rider_id=p_rider_id;
  if delivery_count > 0 then
    return jsonb_build_object('success',false,'action','archive_required','message',format('This rider has %s delivery record(s) and cannot be permanently deleted. Archive the rider instead.',delivery_count),'dependencies',jsonb_build_object('delivery_requests',delivery_count));
  end if;
  delete from public.riders where id=p_rider_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Rider was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Rider permanently deleted.');
end $$;

create or replace function public.admin_delete_product(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare order_count integer; cart_count integer; review_count integer;
begin
  perform public._admin_lifecycle_guard();
  select count(*)::integer into order_count from public.order_items where product_id=p_product_id;
  select count(*)::integer into cart_count from public.cart_items where product_id=p_product_id;
  select count(*)::integer into review_count from public.product_reviews where product_id=p_product_id;
  if order_count+cart_count+review_count > 0 then
    return jsonb_build_object('success',false,'action','archive_required','message',format('This product has %s order item(s), %s cart item(s), and %s review(s); archive it instead.',order_count,cart_count,review_count),'dependencies',jsonb_build_object('order_items',order_count,'cart_items',cart_count,'product_reviews',review_count));
  end if;
  delete from public.products where id=p_product_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Product was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Product permanently deleted.');
end $$;

create or replace function public.admin_delete_vendor(p_vendor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare product_count integer; service_count integer; order_count integer; review_count integer; request_count integer; campus_count integer;
begin
  perform public._admin_lifecycle_guard();
  select count(*)::integer into product_count from public.products where vendor_id=p_vendor_id;
  select count(*)::integer into service_count from public.services where vendor_id=p_vendor_id;
  select count(*)::integer into order_count from public.orders where vendor_id=p_vendor_id;
  select count(*)::integer into review_count from public.vendor_reviews where vendor_id=p_vendor_id;
  select count(*)::integer into request_count from public.service_requests where vendor_id=p_vendor_id;
  select count(*)::integer into campus_count from public.vendor_campuses where vendor_id=p_vendor_id;
  if product_count+service_count+order_count+review_count+request_count+campus_count > 0 then
    return jsonb_build_object('success',false,'action','archive_required','message',format('This vendor has %s product(s), %s service(s), %s order(s), %s review(s), %s request(s), and %s campus assignment(s); archive it instead.',product_count,service_count,order_count,review_count,request_count,campus_count),'dependencies',jsonb_build_object('products',product_count,'services',service_count,'orders',order_count,'vendor_reviews',review_count,'service_requests',request_count,'vendor_campuses',campus_count));
  end if;
  delete from public.vendors where id=p_vendor_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Vendor was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Vendor permanently deleted.');
end $$;

create or replace function public.admin_delete_service(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request_count integer;
begin
  perform public._admin_lifecycle_guard();
  select count(*)::integer into request_count from public.service_requests where service_id=p_service_id;
  if request_count > 0 then
    return jsonb_build_object('success',false,'action','archive_required','message',format('This service has %s request record(s) and cannot be permanently deleted. Archive it instead.',request_count),'dependencies',jsonb_build_object('service_requests',request_count));
  end if;
  delete from public.services where id=p_service_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Service was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Service permanently deleted.');
end $$;
commit;
