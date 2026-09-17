-- Whole-order MANUAL refund recording only. No bank/gateway calls, no backfill.
-- REFUND_PENDING means money is still owed; payment stays PAID until confirmed.
create table public.customer_order_refunds (
  customer_order_id uuid primary key references public.customer_orders(id) on delete restrict,
  payment_id uuid not null unique references public.customer_order_payments(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  reason text not null check (reason in ('Item unavailable','Vendor unavailable','Customer requested cancellation','Operational issue','Other')),
  status public.customer_order_status not null default 'REFUND_PENDING' check (status in ('REFUND_PENDING','REFUNDED')),
  requested_at timestamptz not null default now(),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz,
  confirmed_by_user_id uuid references auth.users(id) on delete restrict,
  admin_reference text check (length(admin_reference) between 1 and 120),
  constraint refund_confirmation_consistent check (
    (status='REFUND_PENDING' and confirmed_at is null and confirmed_by_user_id is null and admin_reference is null)
    or (status='REFUNDED' and confirmed_at is not null and confirmed_by_user_id is not null and confirmed_at>=requested_at)
  )
);
alter table public.customer_order_refunds enable row level security;
revoke all on public.customer_order_refunds from public,anon,authenticated;
grant select on public.customer_order_refunds to authenticated;
create policy customer_order_refunds_admin_read on public.customer_order_refunds for select to authenticated using (public.is_admin());

create function public.admin_request_order_refund(p_customer_order_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid(); o public.customer_orders%rowtype; pay public.customer_order_payments%rowtype; r public.customer_order_refunds%rowtype;
begin
 if actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 if p_reason is null or p_reason not in ('Item unavailable','Vendor unavailable','Customer requested cancellation','Operational issue','Other') then raise exception 'Select a valid refund reason.'; end if;
 -- Same parent-first lock order as payment, vendor, cancellation and delivery RPCs.
 select * into o from public.customer_orders where id=p_customer_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 select * into pay from public.customer_order_payments where customer_order_id=o.id for update;
 if not found then raise exception 'Payment not found.'; end if;
 select * into r from public.customer_order_refunds where customer_order_id=o.id for update;
 if found then
   if r.status='REFUND_PENDING' and o.status='REFUND_PENDING' and pay.status='PAID' then
     return jsonb_build_object('success',true,'already_applied',true,'status',r.status,'amount_kobo',r.amount_kobo);
   end if;
   raise exception 'This order already has a refund resolution.';
 end if;
 perform 1 from public.orders where customer_order_id=o.id order by id for update;
 perform 1 from public.delivery_requests where customer_order_id=o.id order by id for update;
 if pay.status<>'PAID' or pay.verified_at is null or pay.paid_at is null or pay.verified_by_user_id is null
    or pay.amount_kobo<>o.total_kobo or pay.amount_kobo<=0 then raise exception 'A verified whole-order payment is required.'; end if;
 if o.status not in ('PAYMENT_CONFIRMED','ORDER_CONFIRMED')
    or not exists(select 1 from public.orders where customer_order_id=o.id)
    or exists(select 1 from public.orders where customer_order_id=o.id and (status not in ('PENDING','CONFIRMED') or delivered_at is not null or cancelled_at is not null))
    or exists(select 1 from public.delivery_requests where customer_order_id=o.id and (status<>'REQUESTED' or rider_id is not null or rider_user_id is not null or picked_up_at is not null or delivered_at is not null))
    or exists(select 1 from public.customer_order_status_history where customer_order_id=o.id and status in ('PREPARING','READY_FOR_PICKUP','READY_FOR_DISPATCH','RIDER_ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','COMPLETED','CANCELLED','REFUND_PENDING','REFUNDED'))
 then raise exception 'Fulfilment has progressed or the order is not eligible. Manual intervention is required.'; end if;
 insert into public.customer_order_refunds(customer_order_id,payment_id,amount_kobo,reason,requested_by_user_id)
 values(o.id,pay.id,pay.amount_kobo,p_reason,actor);
 update public.orders set status='CANCELLED',cancelled_at=now() where customer_order_id=o.id;
 update public.delivery_requests set status='CANCELLED' where customer_order_id=o.id;
 update public.customer_orders set status='REFUND_PENDING' where id=o.id;
 insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(o.id,'REFUND_PENDING',actor);
 return jsonb_build_object('success',true,'already_applied',false,'status','REFUND_PENDING','amount_kobo',pay.amount_kobo);
end $$;

create function public.admin_confirm_order_refund(p_customer_order_id uuid,p_money_returned boolean,p_reference text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid(); o public.customer_orders%rowtype; pay public.customer_order_payments%rowtype; r public.customer_order_refunds%rowtype; ref text:=nullif(btrim(p_reference),'');
begin
 if actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 if p_money_returned is not true then raise exception 'Confirm only after the money has actually been returned.'; end if;
 if length(ref)>120 then raise exception 'Use a reference of at most 120 characters, without banking credentials.'; end if;
 select * into o from public.customer_orders where id=p_customer_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 select * into pay from public.customer_order_payments where customer_order_id=o.id for update;
 if not found then raise exception 'Payment not found.'; end if;
 select * into r from public.customer_order_refunds where customer_order_id=o.id for update;
 if not found then raise exception 'This order has no required refund.'; end if;
 if r.status='REFUNDED' and o.status='REFUNDED' and pay.status='REFUNDED' then
   return jsonb_build_object('success',true,'already_applied',true,'status','REFUNDED','amount_kobo',r.amount_kobo);
 end if;
 perform 1 from public.orders where customer_order_id=o.id order by id for update;
 perform 1 from public.delivery_requests where customer_order_id=o.id order by id for update;
 if o.status<>'REFUND_PENDING' or r.status<>'REFUND_PENDING' or pay.status<>'PAID'
    or r.payment_id<>pay.id or r.amount_kobo<>pay.amount_kobo or pay.amount_kobo<>o.total_kobo
    or pay.verified_at is null or pay.paid_at is null
    or exists(select 1 from public.orders where customer_order_id=o.id and status<>'CANCELLED')
    or exists(select 1 from public.delivery_requests where customer_order_id=o.id and status<>'CANCELLED')
 then raise exception 'Refund confirmation is not eligible. Manual intervention is required.'; end if;
 update public.customer_order_refunds set status='REFUNDED',confirmed_at=now(),confirmed_by_user_id=actor,admin_reference=ref where customer_order_id=o.id;
 update public.customer_order_payments set status='REFUNDED' where id=pay.id;
 update public.orders set payment_status='REFUNDED' where customer_order_id=o.id;
 update public.customer_orders set status='REFUNDED' where id=o.id;
 insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(o.id,'REFUNDED',actor);
 return jsonb_build_object('success',true,'already_applied',false,'status','REFUNDED','amount_kobo',r.amount_kobo);
end $$;

-- Safe projection shared by authenticated order listing and token tracking.
create function public._customer_order_refund_summary(p_order_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('status',status,'reason',reason,'amount_kobo',amount_kobo,'requested_at',requested_at,'confirmed_at',confirmed_at)
 from public.customer_order_refunds where customer_order_id=p_order_id
$$;
revoke all on function public._customer_order_refund_summary(uuid) from public,anon,authenticated,service_role;

create function public.get_customer_order_refunds(p_order_numbers text[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if coalesce(cardinality(p_order_numbers),0)>200 then raise exception 'Request at most 200 orders.'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('order_number',o.order_number,'refund',public._customer_order_refund_summary(o.id))),'[]'::jsonb)
   from public.customer_orders o where o.customer_user_id=auth.uid() and o.order_number=any(p_order_numbers)
   and exists(select 1 from public.customer_order_refunds r where r.customer_order_id=o.id));
end $$;

-- Database-level defence against reopening/refunding through a legacy write path.
create function public._guard_refund_order_state() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare parent_id uuid; parent_status public.customer_order_status; r public.customer_order_refunds%rowtype;
begin
 if tg_table_name='customer_orders' then
   parent_id:=old.id; parent_status:=old.status;
 else
   if tg_op='INSERT' then parent_id:=new.customer_order_id; else parent_id:=old.customer_order_id; end if;
   if parent_id is null then return case when tg_op='DELETE' then old else new end; end if;
   select status into parent_status from public.customer_orders where id=parent_id for update;
 end if;
 if parent_status not in ('REFUND_PENDING','REFUNDED') then
   -- An existing child cannot be moved into a refund order to bypass its lock.
   if tg_table_name<>'customer_orders' and tg_op='UPDATE' then
     if new.customer_order_id is distinct from old.customer_order_id then
       if exists(select 1 from public.customer_orders where id=new.customer_order_id and status in ('REFUND_PENDING','REFUNDED')) then raise exception 'Refund orders cannot accept new fulfilment records.'; end if;
     end if;
   end if;
   return case when tg_op='DELETE' then old else new end;
 end if;
 if tg_op<>'UPDATE' then raise exception 'Refund order history must be preserved.'; end if;
 select * into r from public.customer_order_refunds where customer_order_id=parent_id;
 if parent_status='REFUND_PENDING' and r.status='REFUNDED' then
   if tg_table_name='customer_orders' and new.status::text='REFUNDED'
      and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then return new; end if;
   if tg_table_name='customer_order_payments' and new.status::text='REFUNDED'
      and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then return new; end if;
   if tg_table_name='orders' then
     if new.status='CANCELLED' and new.payment_status='REFUNDED'
        and (to_jsonb(new)-'payment_status'-'updated_at')=(to_jsonb(old)-'payment_status'-'updated_at') then return new; end if;
   end if;
 end if;
 raise exception 'Fulfilment is permanently stopped for this refund order.';
end $$;
revoke all on function public._guard_refund_order_state() from public,anon,authenticated,service_role;
create trigger customer_orders_refund_guard before update or delete on public.customer_orders for each row execute function public._guard_refund_order_state();
create trigger orders_refund_guard before insert or update or delete on public.orders for each row execute function public._guard_refund_order_state();
create trigger payments_refund_guard before insert or update or delete on public.customer_order_payments for each row execute function public._guard_refund_order_state();
create trigger delivery_refund_guard before insert or update or delete on public.delivery_requests for each row execute function public._guard_refund_order_state();

revoke all on function public.admin_request_order_refund(uuid,text),public.admin_confirm_order_refund(uuid,boolean,text),public.get_customer_order_refunds(text[]) from public,anon,authenticated,service_role;
grant execute on function public.admin_request_order_refund(uuid,text),public.admin_confirm_order_refund(uuid,boolean,text),public.get_customer_order_refunds(text[]) to authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_order_tracking(p_order_number text, p_tracking_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare o public.customer_orders%rowtype;
begin
 if length(trim(coalesce(p_order_number,'')))>32 or length(coalesce(p_tracking_token,'')) not between 32 and 256 then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
 select co.* into o from public.customer_orders co where co.order_number=trim(p_order_number) and co.tracking_token_hash=extensions.crypt(p_tracking_token,co.tracking_token_hash); if not found then return jsonb_build_object('success',false,'code','ORDER_NOT_FOUND','message','Order tracking details were not found.'); end if;
 return jsonb_build_object('success',true,'order_number',o.order_number,'fulfillment_type',o.fulfillment_type,'status',o.status,'refund',public._customer_order_refund_summary(o.id),'cancellation_reason',o.cancellation_reason,'cancelled_at',o.cancelled_at,'payment_status',coalesce((select p.status from public.customer_order_payments p where p.customer_order_id=o.id),'PENDING'::public.payment_status),'delivery_status',(select d.status from public.delivery_requests d where d.customer_order_id=o.id),'rider_name',(select r.name from public.delivery_requests d join public.riders r on r.id=d.rider_id where d.customer_order_id=o.id),'history',(select coalesce(jsonb_agg(jsonb_build_object('status',h.status,'created_at',h.created_at) order by h.created_at,h.id),'[]'::jsonb) from public.customer_order_status_history h where h.customer_order_id=o.id),'vendor_groups',(select coalesce(jsonb_agg(jsonb_build_object('vendor_name',g.vendor_name,'status',g.status,'items',g.items) order by g.vendor_name),'[]'::jsonb) from (select oi.vendor_name_snapshot vendor_name,ord.status,jsonb_agg(jsonb_build_object('product_name',oi.product_name_snapshot,'quantity',oi.quantity,'unit_price_kobo',oi.unit_price_kobo,'line_total_kobo',oi.total_price_kobo,'currency',oi.currency_code) order by oi.product_name_snapshot) items from public.orders ord join public.order_items oi on oi.order_id=ord.id where ord.customer_order_id=o.id group by ord.id,oi.vendor_name_snapshot,ord.status) g));
end $function$;
