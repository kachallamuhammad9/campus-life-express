-- Phase 4F: admin-owned fulfillment and delivery operations. No existing rows are changed.
begin;

create table public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  phone text not null check (phone ~ '^\+234[0-9]{10}$'),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  is_active boolean not null default true,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index riders_normalized_phone_unique on public.riders(phone);
create index riders_campus_available on public.riders(campus_id) where is_active and is_available;
create trigger riders_updated_at before update on public.riders for each row execute function public.set_updated_at();
alter table public.riders enable row level security;
revoke all on public.riders from public, anon, authenticated;
grant select on public.riders to authenticated;
create policy riders_admin_select on public.riders for select to authenticated using (public.is_admin());

alter table public.delivery_requests add column rider_id uuid references public.riders(id) on delete restrict;
create index delivery_requests_rider_id_status on public.delivery_requests(rider_id, status) where rider_id is not null;

-- Checkout-linked requests are advanced exclusively through the RPCs below.
drop policy if exists delivery_requests_update_involved on public.delivery_requests;
create policy delivery_requests_update_legacy_involved on public.delivery_requests for update to authenticated
using (customer_order_id is null and (
  requester_user_id = auth.uid() or (public.has_role('RIDER'::public.app_role) and (rider_user_id = auth.uid() or (rider_user_id is null and status = 'REQUESTED'::public.delivery_status))) or public.is_admin()))
with check (customer_order_id is null and (
  requester_user_id = auth.uid() or (public.has_role('RIDER'::public.app_role) and rider_user_id = auth.uid()) or public.is_admin()));

create function public._admin_normalize_ng_phone(p_phone text) returns text
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare v text := regexp_replace(coalesce(p_phone,''),'[ ()-]','','g');
begin
  if v !~ '^(0[0-9]{10}|[+]234[0-9]{10}|234[0-9]{10})$' then return null; end if;
  if left(v,1)='+' then v:=substr(v,2); elsif left(v,1)='0' then v:='234'||substr(v,2); end if;
  return '+'||v;
end $$;
revoke all on function public._admin_normalize_ng_phone(text) from public,anon,authenticated,service_role;

create function public.admin_create_rider(p_name text,p_phone text,p_campus_id uuid,p_is_active boolean default true,p_is_available boolean default true)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); r public.riders%rowtype;
begin
  if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
  r.name:=nullif(btrim(regexp_replace(p_name,'[[:space:]]+',' ','g')),''); r.phone:=public._admin_normalize_ng_phone(p_phone); r.campus_id:=p_campus_id; r.is_active:=p_is_active; r.is_available:=p_is_available;
  if r.name is null or length(r.name)>120 or r.phone is null or r.is_active is null or r.is_available is null then raise exception 'Invalid rider details.'; end if;
  perform 1 from public.campuses where id=r.campus_id and is_active for share; if not found then raise exception 'An active campus is required.'; end if;
  perform pg_advisory_xact_lock(430031);
  if exists(select 1 from public.riders where phone=r.phone) then raise exception 'A rider with this phone already exists.'; end if;
  insert into public.riders(name,phone,campus_id,is_active,is_available) values(r.name,r.phone,r.campus_id,r.is_active,r.is_available) returning * into r;
  return jsonb_build_object('id',r.id,'name',r.name,'campus_id',r.campus_id,'is_active',r.is_active,'is_available',r.is_available);
exception when unique_violation then raise exception 'A rider with this phone already exists.'; end $$;

create function public.admin_update_rider(p_rider_id uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); r public.riders%rowtype; old public.riders%rowtype; k text;
begin
  if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) x where x not in ('name','phone','is_active','is_available')) then raise exception 'Unknown or immutable rider field.'; end if;
  perform pg_advisory_xact_lock(430031); select * into r from public.riders where id=p_rider_id for update; if not found then raise exception 'Rider not found.'; end if; old:=r;
  if p_patch ? 'name' and jsonb_typeof(p_patch->'name')<>'string' then raise exception 'Name must be text.'; end if;
  if p_patch ? 'phone' and jsonb_typeof(p_patch->'phone')<>'string' then raise exception 'Phone must be text.'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) x where x in ('is_active','is_available') and jsonb_typeof(p_patch->x)<>'boolean') then raise exception 'Availability flags must be boolean.'; end if;
  r:=jsonb_populate_record(r,p_patch);
  if p_patch ? 'name' then r.name:=nullif(btrim(regexp_replace(r.name,'[[:space:]]+',' ','g')),''); end if;
  if p_patch ? 'phone' then r.phone:=public._admin_normalize_ng_phone(r.phone); end if;
  if r.name is null or length(r.name)>120 or r.phone is null then raise exception 'Invalid rider details.'; end if;
  if exists(select 1 from public.riders where id<>r.id and phone=r.phone) then raise exception 'A rider with this phone already exists.'; end if;
  if r is not distinct from old then return jsonb_build_object('id',old.id,'name',old.name,'campus_id',old.campus_id,'is_active',old.is_active,'is_available',old.is_available); end if;
  update public.riders set name=r.name,phone=r.phone,is_active=r.is_active,is_available=r.is_available,updated_at=now() where id=r.id returning * into r;
  return jsonb_build_object('id',r.id,'name',r.name,'campus_id',r.campus_id,'is_active',r.is_active,'is_available',r.is_available);
exception when unique_violation then raise exception 'A rider with this phone already exists.'; end $$;

create function public._admin_delivery_context(p_customer_order_id uuid, p_lock_rider boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare p public.customer_orders%rowtype; pay public.customer_order_payments%rowtype; d public.delivery_requests%rowtype; child_count int;
begin
  select * into p from public.customer_orders where id=p_customer_order_id for update; if not found then raise exception 'Order not found.'; end if;
  select * into pay from public.customer_order_payments where customer_order_id=p.id for update; if not found then raise exception 'Payment not found.'; end if;
  perform 1 from public.orders where customer_order_id=p.id for update;
  select count(*) into child_count from public.orders where customer_order_id=p.id and status='READY';
  if child_count <> (select count(*) from public.orders where customer_order_id=p.id) then raise exception 'Every vendor order must be ready.'; end if;
  select * into d from public.delivery_requests where customer_order_id=p.id for update;
  if not found or (select count(*) from public.delivery_requests where customer_order_id=p.id)<>1 then raise exception 'Exactly one checkout delivery request is required.'; end if;
  return jsonb_build_object('parent_id',p.id,'fulfillment_type',p.fulfillment_type,'parent_status',p.status,'payment_status',pay.status,'delivery_id',d.id,'delivery_status',d.status,'rider_id',d.rider_id);
end $$;
revoke all on function public._admin_delivery_context(uuid,boolean) from public,anon,authenticated,service_role;

create function public.admin_assign_delivery_rider(p_customer_order_id uuid,p_rider_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); c jsonb; r public.riders%rowtype;
begin
 if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 c:=public._admin_delivery_context(p_customer_order_id); if c->>'fulfillment_type'<>'DELIVERY' or c->>'parent_status'<>'READY_FOR_DISPATCH' or c->>'payment_status'<>'PAID' or c->>'delivery_status'<>'REQUESTED' or c->>'rider_id' is not null then raise exception 'Order is not eligible for rider assignment.'; end if;
 select * into r from public.riders where id=p_rider_id for update; if not found or not r.is_active or not r.is_available then raise exception 'Rider is not available.'; end if;
 if r.campus_id<>(select campus_id from public.customer_orders where id=p_customer_order_id) then raise exception 'Rider campus does not match order campus.'; end if;
 update public.delivery_requests set rider_id=r.id,status='ACCEPTED' where id=(c->>'delivery_id')::uuid;
 update public.riders set is_available=false where id=r.id;
 update public.customer_orders set status='RIDER_ASSIGNED' where id=p_customer_order_id;
 insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(p_customer_order_id,'RIDER_ASSIGNED',v_actor);
 return jsonb_build_object('success',true,'status','RIDER_ASSIGNED','rider_name',r.name);
end $$;

create function public.admin_advance_delivery_request(p_customer_order_id uuid,p_target_status public.delivery_status) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); c jsonb; next_parent public.customer_order_status;
begin
 if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 c:=public._admin_delivery_context(p_customer_order_id); if c->>'fulfillment_type'<>'DELIVERY' or c->>'payment_status'<>'PAID' or c->>'rider_id' is null then raise exception 'Delivery is not eligible.'; end if;
 if c->>'delivery_status'=p_target_status::text then return jsonb_build_object('success',true,'already_applied',true,'status',c->>'parent_status'); end if;
 if not ((c->>'delivery_status'='ACCEPTED' and p_target_status='PICKED_UP') or (c->>'delivery_status'='PICKED_UP' and p_target_status='IN_TRANSIT') or (c->>'delivery_status'='IN_TRANSIT' and p_target_status='DELIVERED')) then raise exception 'Invalid delivery transition.'; end if;
 if (p_target_status='PICKED_UP' and c->>'parent_status'<>'RIDER_ASSIGNED') or (p_target_status in ('IN_TRANSIT','DELIVERED') and c->>'parent_status'<>'OUT_FOR_DELIVERY') then raise exception 'Parent order is not eligible.'; end if;
 update public.delivery_requests set status=p_target_status,picked_up_at=case when p_target_status='PICKED_UP' then now() else picked_up_at end,delivered_at=case when p_target_status='DELIVERED' then now() else delivered_at end where id=(c->>'delivery_id')::uuid;
 if p_target_status='PICKED_UP' then next_parent:='OUT_FOR_DELIVERY'; elsif p_target_status='DELIVERED' then next_parent:='DELIVERED'; else return jsonb_build_object('success',true,'already_applied',false,'status','OUT_FOR_DELIVERY'); end if;
 update public.customer_orders set status=next_parent where id=p_customer_order_id;
 insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(p_customer_order_id,next_parent,v_actor);
 return jsonb_build_object('success',true,'already_applied',false,'status',next_parent);
end $$;

create function public.admin_complete_pickup_order(p_customer_order_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); p public.customer_orders%rowtype; paid public.payment_status;
begin
 if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 select * into p from public.customer_orders where id=p_customer_order_id for update; select status into paid from public.customer_order_payments where customer_order_id=p.id for update; perform 1 from public.orders where customer_order_id=p.id for update;
 if p.fulfillment_type<>'PICKUP' or paid<>'PAID' or p.status<>'READY_FOR_PICKUP' or exists(select 1 from public.orders where customer_order_id=p.id and status<>'READY') then raise exception 'Order is not eligible for pickup completion.'; end if;
 update public.customer_orders set status='COMPLETED' where id=p.id; insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(p.id,'COMPLETED',v_actor); return jsonb_build_object('success',true,'status','COMPLETED');
end $$;

create function public.admin_complete_delivery_order(p_customer_order_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); c jsonb;
begin
 if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 c:=public._admin_delivery_context(p_customer_order_id); if c->>'fulfillment_type'<>'DELIVERY' or c->>'payment_status'<>'PAID' or c->>'parent_status'<>'DELIVERED' or c->>'delivery_status'<>'DELIVERED' or c->>'rider_id' is null then raise exception 'Order is not eligible for delivery completion.'; end if;
 update public.customer_orders set status='COMPLETED' where id=p_customer_order_id; update public.riders set is_available=true where id=(c->>'rider_id')::uuid;
 insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(p_customer_order_id,'COMPLETED',v_actor); return jsonb_build_object('success',true,'status','COMPLETED');
end $$;

create or replace function public.get_customer_order_tracking(p_order_number text,p_tracking_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare o public.customer_orders%rowtype;
begin
 if length(trim(coalesce(p_order_number,'')))>32 or length(coalesce(p_tracking_token,'')) not between 32 and 256 then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
 select co.* into o from public.customer_orders co where co.order_number=trim(p_order_number) and co.tracking_token_hash=crypt(p_tracking_token,co.tracking_token_hash); if not found then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
 return jsonb_build_object('success',true,'order_number',o.order_number,'fulfillment_type',o.fulfillment_type,'status',o.status,'payment_status',coalesce((select p.status from public.customer_order_payments p where p.customer_order_id=o.id),'PENDING'::public.payment_status),'delivery_status',(select d.status from public.delivery_requests d where d.customer_order_id=o.id),'rider_name',(select r.name from public.delivery_requests d join public.riders r on r.id=d.rider_id where d.customer_order_id=o.id),'history',(select coalesce(jsonb_agg(jsonb_build_object('status',h.status,'created_at',h.created_at) order by h.created_at,h.id),'[]'::jsonb) from public.customer_order_status_history h where h.customer_order_id=o.id),'vendor_groups',(select coalesce(jsonb_agg(jsonb_build_object('vendor_name',g.vendor_name,'status',g.status,'items',g.items) order by g.vendor_name),'[]'::jsonb) from (select oi.vendor_name_snapshot vendor_name,ord.status,jsonb_agg(jsonb_build_object('product_name',oi.product_name_snapshot,'quantity',oi.quantity,'line_total_kobo',oi.total_price_kobo,'currency',oi.currency_code) order by oi.product_name_snapshot) items from public.orders ord join public.order_items oi on oi.order_id=ord.id where ord.customer_order_id=o.id group by ord.id,oi.vendor_name_snapshot,ord.status) g));
end $$;

revoke all on function public.admin_create_rider(text,text,uuid,boolean,boolean),public.admin_update_rider(uuid,jsonb),public.admin_assign_delivery_rider(uuid,uuid),public.admin_advance_delivery_request(uuid,public.delivery_status),public.admin_complete_pickup_order(uuid),public.admin_complete_delivery_order(uuid) from public,anon;
grant execute on function public.admin_create_rider(text,text,uuid,boolean,boolean),public.admin_update_rider(uuid,jsonb),public.admin_assign_delivery_rider(uuid,uuid),public.admin_advance_delivery_request(uuid,public.delivery_status),public.admin_complete_pickup_order(uuid),public.admin_complete_delivery_order(uuid) to authenticated,service_role;
commit;