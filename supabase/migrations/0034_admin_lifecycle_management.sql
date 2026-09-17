-- CLX Phase 4.4: safe admin lifecycle management.
-- Additive only. No existing rows are deleted or rewritten.
begin;

alter table public.products add column if not exists is_active boolean not null default true;

-- Customer catalogue must exclude archived products while admin SELECT remains available.
drop policy if exists products_select_public on public.products;
create policy products_select_public on public.products
for select using (
  (is_active and exists (
    select 1 from public.vendors v
    join public.vendor_campuses vc on vc.vendor_id = v.id and vc.campus_id = products.campus_id
    join public.campuses c on c.id = products.campus_id
    join public.categories cat on cat.id = products.category_id
    where v.id = products.vendor_id and v.status = 'ACTIVE'::public.vendor_status
      and v.is_verified and vc.is_active and c.is_active and cat.is_active
      and (products.subcategory_id is null or exists (
        select 1 from public.categories sub where sub.id = products.subcategory_id
          and sub.is_active and sub.parent_id = cat.id
      ))
  )) or public.is_admin()
);

create or replace function public._admin_lifecycle_guard()
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'Admin authorization required.';
  end if;
end $$;
revoke all on function public._admin_lifecycle_guard() from public,anon,authenticated,service_role;

create or replace function public.admin_archive_rider(p_rider_id uuid, p_restore boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  update public.riders set is_active=p_restore, is_available=case when p_restore then is_available else false end, updated_at=now() where id=p_rider_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Rider was not found.'); end if;
  return jsonb_build_object('success',true,'action',case when p_restore then 'restored' else 'archived' end,'message',case when p_restore then 'Rider restored.' else 'Rider archived.' end);
end $$;

create or replace function public.admin_delete_rider(p_rider_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  if exists(select 1 from public.delivery_requests where rider_id=p_rider_id or rider_user_id=(select rider_user_id from public.delivery_requests where rider_id=p_rider_id limit 1)) then
    return jsonb_build_object('success',false,'action','archive_required','message','This rider has delivery history and cannot be permanently deleted. Archive the rider instead.');
  end if;
  delete from public.riders where id=p_rider_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Rider was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Rider permanently deleted.');
end $$;

create or replace function public.admin_archive_product(p_product_id uuid, p_restore boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  update public.products set is_active=p_restore, updated_at=now() where id=p_product_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Product was not found.'); end if;
  return jsonb_build_object('success',true,'action',case when p_restore then 'restored' else 'archived' end,'message',case when p_restore then 'Product restored.' else 'Product archived.' end);
end $$;

create or replace function public.admin_delete_product(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  if exists(select 1 from public.order_items where product_id=p_product_id)
     or exists(select 1 from public.cart_items where product_id=p_product_id)
     or exists(select 1 from public.product_reviews where product_id=p_product_id) then
    return jsonb_build_object('success',false,'action','archive_required','message','This product has transaction or history references and cannot be permanently deleted. Archive it instead.');
  end if;
  delete from public.products where id=p_product_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Product was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Product permanently deleted.');
end $$;

create or replace function public.admin_bulk_delete_products(p_product_ids uuid[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare product_id uuid; deleted_count integer:=0; archived_count integer:=0; result jsonb:='[]'::jsonb; one jsonb;
begin
  perform public._admin_lifecycle_guard();
  if p_product_ids is null or coalesce(array_length(p_product_ids,1),0)=0 then return jsonb_build_object('success',false,'action','invalid','message','Select at least one product.'); end if;
  foreach product_id in array p_product_ids loop
    select public.admin_delete_product(product_id) into one;
    result:=result || jsonb_build_array(one);
    if one->>'action'='deleted' then deleted_count:=deleted_count+1; elsif one->>'action'='archive_required' then archived_count:=archived_count+1; end if;
  end loop;
  return jsonb_build_object('success',true,'action','bulk_result','deleted',deleted_count,'archive_required',archived_count,'results',result);
end $$;

create or replace function public.admin_bulk_archive_products(p_product_ids uuid[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare product_id uuid; archived_count integer:=0; result jsonb:='[]'::jsonb; one jsonb;
begin
  perform public._admin_lifecycle_guard();
  if p_product_ids is null or coalesce(array_length(p_product_ids,1),0)=0 then return jsonb_build_object('success',false,'action','invalid','message','Select at least one product.'); end if;
  foreach product_id in array p_product_ids loop
    select public.admin_archive_product(product_id) into one;
    result:=result || jsonb_build_array(one);
    if one->>'action'='archived' then archived_count:=archived_count+1; end if;
  end loop;
  return jsonb_build_object('success',true,'action','bulk_result','archived',archived_count,'results',result);
end $$;

create or replace function public.admin_archive_vendor(p_vendor_id uuid, p_restore boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  update public.vendors set status=case when p_restore then 'ACTIVE'::public.vendor_status else 'SUSPENDED'::public.vendor_status end, updated_at=now() where id=p_vendor_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Vendor was not found.'); end if;
  return jsonb_build_object('success',true,'action',case when p_restore then 'restored' else 'archived' end,'message',case when p_restore then 'Vendor restored.' else 'Vendor archived.' end);
end $$;

create or replace function public.admin_update_vendor(p_vendor_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.vendors%rowtype;
begin
  perform public._admin_lifecycle_guard();
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('name','location','phone_number','email','description','image_url')) then
    raise exception 'Only editable vendor fields are allowed.';
  end if;
  select * into v from public.vendors where id=p_vendor_id for update;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Vendor was not found.'); end if;
  v:=jsonb_populate_record(v,p_patch);
  if nullif(btrim(v.name),'') is null or nullif(btrim(v.location),'') is null then raise exception 'Vendor name and location are required.'; end if;
  update public.vendors set name=btrim(v.name),location=btrim(v.location),phone_number=nullif(btrim(v.phone_number),''),email=nullif(btrim(v.email),''),description=nullif(btrim(v.description),''),image_url=nullif(btrim(v.image_url),''),updated_at=now() where id=v.id returning * into v;
  return jsonb_build_object('success',true,'action','updated','message','Vendor updated.');
end $$;

create or replace function public.admin_delete_vendor(p_vendor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  if exists(select 1 from public.products where vendor_id=p_vendor_id)
     or exists(select 1 from public.services where vendor_id=p_vendor_id)
     or exists(select 1 from public.orders where vendor_id=p_vendor_id)
     or exists(select 1 from public.vendor_reviews where vendor_id=p_vendor_id)
     or exists(select 1 from public.service_requests where vendor_id=p_vendor_id)
     or exists(select 1 from public.vendor_campuses where vendor_id=p_vendor_id) then
    return jsonb_build_object('success',false,'action','archive_required','message','This vendor has catalogue, campus, service, review, or order dependencies and cannot be permanently deleted. Archive it instead.');
  end if;
  delete from public.vendors where id=p_vendor_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Vendor was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Vendor permanently deleted.');
end $$;

create or replace function public.admin_archive_service(p_service_id uuid, p_restore boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  update public.services set is_active=p_restore, updated_at=now() where id=p_service_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Service was not found.'); end if;
  return jsonb_build_object('success',true,'action',case when p_restore then 'restored' else 'archived' end,'message',case when p_restore then 'Service restored.' else 'Service archived.' end);
end $$;

create or replace function public.admin_delete_service(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  perform public._admin_lifecycle_guard();
  if exists(select 1 from public.service_requests where service_id=p_service_id) then
    return jsonb_build_object('success',false,'action','archive_required','message','This service provider listing has request history and cannot be permanently deleted. Archive it instead.');
  end if;
  delete from public.services where id=p_service_id;
  if not found then return jsonb_build_object('success',false,'action','not_found','message','Service was not found.'); end if;
  return jsonb_build_object('success',true,'action','deleted','message','Service permanently deleted.');
end $$;

revoke all on function public.admin_archive_rider(uuid,boolean),public.admin_delete_rider(uuid),public.admin_archive_product(uuid,boolean),public.admin_delete_product(uuid),public.admin_bulk_delete_products(uuid[]),public.admin_bulk_archive_products(uuid[]),public.admin_archive_vendor(uuid,boolean),public.admin_update_vendor(uuid,jsonb),public.admin_delete_vendor(uuid),public.admin_archive_service(uuid,boolean),public.admin_delete_service(uuid) from public,anon;
grant execute on function public.admin_archive_rider(uuid,boolean),public.admin_delete_rider(uuid),public.admin_archive_product(uuid,boolean),public.admin_delete_product(uuid),public.admin_bulk_delete_products(uuid[]),public.admin_bulk_archive_products(uuid[]),public.admin_archive_vendor(uuid,boolean),public.admin_update_vendor(uuid,jsonb),public.admin_delete_vendor(uuid),public.admin_archive_service(uuid,boolean),public.admin_delete_service(uuid) to authenticated,service_role;
commit;
