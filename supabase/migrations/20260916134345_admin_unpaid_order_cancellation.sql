-- Admin-only cancellation of unpaid customer orders. Historical orders are unchanged.
begin;

alter table public.customer_orders
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.customer_orders
  drop constraint if exists customer_orders_cancellation_state;
alter table public.customer_orders
  add constraint customer_orders_cancellation_state check (
    (status = 'CANCELLED' and cancellation_reason is not null and cancelled_at is not null)
    or (status <> 'CANCELLED' and cancellation_reason is null and cancelled_at is null and cancelled_by_user_id is null)
  );

create or replace function public.admin_cancel_customer_order(p_customer_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_order public.customer_orders%rowtype; v_payment public.customer_order_payments%rowtype;
begin
  if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
  if p_reason not in ('Customer requested cancellation','Payment not received','Item unavailable','Vendor unavailable','Other') then
    return jsonb_build_object('success',false,'code','INVALID_CANCELLATION_REASON','message','Select a valid cancellation reason.');
  end if;
  select * into v_order from public.customer_orders where id=p_customer_order_id for update;
  if not found then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order was not found.'); end if;
  select * into v_payment from public.customer_order_payments where customer_order_id=v_order.id for update;
  if not found then return jsonb_build_object('success',false,'code','PAYMENT_NOT_FOUND','message','Payment record was not found.'); end if;
  perform 1 from public.orders where customer_order_id=v_order.id for update;
  if v_order.status='CANCELLED' then return jsonb_build_object('success',false,'code','ALREADY_CANCELLED','message','This order has already been cancelled.'); end if;
  if v_payment.status='PAID' then return jsonb_build_object('success',false,'code','PAID_ORDER_REQUIRES_REFUND','message','Paid orders cannot be cancelled here. A refund workflow is required.'); end if;
  if v_payment.status<>'PENDING' or v_order.status not in ('ORDER_RECEIVED','AWAITING_PAYMENT') then
    return jsonb_build_object('success',false,'code','CANCELLATION_NOT_ELIGIBLE','message','Only unpaid orders awaiting payment can be cancelled.');
  end if;
  update public.customer_orders set status='CANCELLED',cancellation_reason=p_reason,cancelled_at=now(),cancelled_by_user_id=v_actor where id=v_order.id;
  insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(v_order.id,'CANCELLED',v_actor);
  return jsonb_build_object('success',true,'status','CANCELLED','cancellation_reason',p_reason);
end $$;

-- Payment is a hard prerequisite for every vendor lifecycle write. Terminal parents
-- are rejected before idempotency handling so stale/direct clients cannot bypass cancellation.
create or replace function public.admin_advance_vendor_order(p_vendor_order_id uuid,p_target_status public.order_status)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor_id uuid:=auth.uid(); v_parent_id uuid; v_parent public.customer_orders%rowtype; v_child public.orders%rowtype; v_payment_status public.payment_status; v_active_child_count integer; v_all_confirmed boolean; v_all_preparing boolean; v_all_ready boolean; v_derived_parent_status public.customer_order_status; v_parent_rank integer; v_derived_rank integer;
begin
 if v_actor_id is null or public.is_admin() is not true then raise exception 'You are not authorized to update vendor orders.'; end if;
 select o.customer_order_id into v_parent_id from public.orders o where o.id=p_vendor_order_id;
 if v_parent_id is null then return jsonb_build_object('success',false,'code','VENDOR_ORDER_NOT_FOUND','message','Vendor order was not found.'); end if;
 select * into v_parent from public.customer_orders where id=v_parent_id for update;
 select * into v_child from public.orders where id=p_vendor_order_id and customer_order_id=v_parent.id for update;
 if not found then return jsonb_build_object('success',false,'code','VENDOR_ORDER_NOT_FOUND','message','Vendor order was not found.'); end if;
 select status into v_payment_status from public.customer_order_payments where customer_order_id=v_parent.id for update;
 if not found then return jsonb_build_object('success',false,'code','PAYMENT_NOT_FOUND','message','Payment record was not found.'); end if;
 if v_parent.status in ('CANCELLED','PAYMENT_FAILED','REFUND_PENDING','REFUNDED','COMPLETED','RIDER_ASSIGNED','OUT_FOR_DELIVERY','DELIVERED') then return jsonb_build_object('success',false,'code','PARENT_NOT_ELIGIBLE','message','This vendor order cannot move to the requested status.'); end if;
 if v_payment_status<>'PAID' then return jsonb_build_object('success',false,'code','PAYMENT_NOT_VERIFIED','message','Payment must be verified before updating this vendor order.'); end if;
 if p_target_status not in ('CONFIRMED','PREPARING','READY') then return jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','This vendor order cannot move to the requested status.'); end if;
 if v_child.status=p_target_status then return jsonb_build_object('success',true,'already_applied',true,'child_status',v_child.status,'parent_status',v_parent.status); end if;
 if v_parent.status not in ('PAYMENT_CONFIRMED','ORDER_CONFIRMED','PREPARING','READY_FOR_PICKUP','READY_FOR_DISPATCH') then return jsonb_build_object('success',false,'code','PARENT_NOT_ELIGIBLE','message','This vendor order cannot move to the requested status.'); end if;
 if not ((v_child.status='PENDING' and p_target_status='CONFIRMED') or (v_child.status='CONFIRMED' and p_target_status='PREPARING') or (v_child.status='PREPARING' and p_target_status='READY')) then return jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','This vendor order cannot move to the requested status.'); end if;
 update public.orders set status=p_target_status where id=v_child.id;
 select count(*)::integer,bool_and(o.status in ('CONFIRMED','PREPARING','READY','IN_TRANSIT','DELIVERED')),bool_and(o.status in ('PREPARING','READY','IN_TRANSIT','DELIVERED')),bool_and(o.status in ('READY','IN_TRANSIT','DELIVERED')) into v_active_child_count,v_all_confirmed,v_all_preparing,v_all_ready from public.orders o where o.customer_order_id=v_parent.id and o.status<>'CANCELLED';
 if v_active_child_count=0 then raise exception 'This vendor order cannot move to the requested status.'; end if;
 if v_all_ready then v_derived_parent_status:=case when v_parent.fulfillment_type='PICKUP' then 'READY_FOR_PICKUP'::public.customer_order_status else 'READY_FOR_DISPATCH'::public.customer_order_status end; elsif v_all_preparing then v_derived_parent_status:='PREPARING'; elsif v_all_confirmed then v_derived_parent_status:='ORDER_CONFIRMED'; else v_derived_parent_status:=v_parent.status; end if;
 v_parent_rank:=case v_parent.status when 'PAYMENT_CONFIRMED' then 0 when 'ORDER_CONFIRMED' then 1 when 'PREPARING' then 2 when 'READY_FOR_PICKUP' then 3 when 'READY_FOR_DISPATCH' then 3 else 99 end;
 v_derived_rank:=case v_derived_parent_status when 'PAYMENT_CONFIRMED' then 0 when 'ORDER_CONFIRMED' then 1 when 'PREPARING' then 2 when 'READY_FOR_PICKUP' then 3 when 'READY_FOR_DISPATCH' then 3 else 0 end;
 if v_derived_rank>v_parent_rank then update public.customer_orders set status=v_derived_parent_status where id=v_parent.id; insert into public.customer_order_status_history(customer_order_id,vendor_order_id,status,actor_user_id) values(v_parent.id,v_child.id,v_derived_parent_status,v_actor_id); end if;
 return jsonb_build_object('success',true,'already_applied',false,'child_status',p_target_status,'parent_status',case when v_derived_rank>v_parent_rank then v_derived_parent_status else v_parent.status end);
end $$;

create or replace function public.get_customer_order_tracking(p_order_number text,p_tracking_token text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare o public.customer_orders%rowtype;
begin
 if length(trim(coalesce(p_order_number,'')))>32 or length(coalesce(p_tracking_token,'')) not between 32 and 256 then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
 select co.* into o from public.customer_orders co where co.order_number=trim(p_order_number) and co.tracking_token_hash=crypt(p_tracking_token,co.tracking_token_hash); if not found then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
 return jsonb_build_object('success',true,'order_number',o.order_number,'fulfillment_type',o.fulfillment_type,'status',o.status,'cancellation_reason',o.cancellation_reason,'cancelled_at',o.cancelled_at,'payment_status',coalesce((select p.status from public.customer_order_payments p where p.customer_order_id=o.id),'PENDING'::public.payment_status),'delivery_status',(select d.status from public.delivery_requests d where d.customer_order_id=o.id),'rider_name',(select r.name from public.delivery_requests d join public.riders r on r.id=d.rider_id where d.customer_order_id=o.id),'history',(select coalesce(jsonb_agg(jsonb_build_object('status',h.status,'created_at',h.created_at) order by h.created_at,h.id),'[]'::jsonb) from public.customer_order_status_history h where h.customer_order_id=o.id),'vendor_groups',(select coalesce(jsonb_agg(jsonb_build_object('vendor_name',g.vendor_name,'status',g.status,'items',g.items) order by g.vendor_name),'[]'::jsonb) from (select oi.vendor_name_snapshot vendor_name,ord.status,jsonb_agg(jsonb_build_object('product_name',oi.product_name_snapshot,'quantity',oi.quantity,'unit_price_kobo',oi.unit_price_kobo,'line_total_kobo',oi.total_price_kobo,'currency',oi.currency_code) order by oi.product_name_snapshot) items from public.orders ord join public.order_items oi on oi.order_id=ord.id where ord.customer_order_id=o.id group by ord.id,oi.vendor_name_snapshot,ord.status) g));
end $$;

revoke all on function public.admin_cancel_customer_order(uuid,text) from public,anon;
grant execute on function public.admin_cancel_customer_order(uuid,text) to authenticated,service_role;
commit;
