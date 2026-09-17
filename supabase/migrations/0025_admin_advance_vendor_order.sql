-- CLX Phase 4D: narrow admin-only child vendor-order lifecycle advancement.
-- Local implementation only. Do not deploy without a separate review.

create or replace function public.admin_advance_vendor_order(
  p_vendor_order_id uuid,
  p_target_status public.order_status
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_parent_id uuid;
  v_parent public.customer_orders%rowtype;
  v_child public.orders%rowtype;
  v_payment_status public.payment_status;
  v_active_child_count integer;
  v_all_confirmed boolean;
  v_all_preparing boolean;
  v_all_ready boolean;
  v_derived_parent_status public.customer_order_status;
  v_parent_rank integer;
  v_derived_rank integer;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'You are not authorized to update vendor orders.';
  end if;

  select o.customer_order_id into v_parent_id
  from public.orders o
  where o.id = p_vendor_order_id;
  if v_parent_id is null then
    return jsonb_build_object('success', false, 'code', 'VENDOR_ORDER_NOT_FOUND', 'message', 'Vendor order was not found.');
  end if;

  select * into v_parent
  from public.customer_orders
  where id = v_parent_id
  for update;

  select * into v_child
  from public.orders
  where id = p_vendor_order_id and customer_order_id = v_parent.id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'VENDOR_ORDER_NOT_FOUND', 'message', 'Vendor order was not found.');
  end if;

  if p_target_status not in ('CONFIRMED', 'PREPARING', 'READY') then
    return jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'This vendor order cannot move to the requested status.');
  end if;

  if v_child.status = p_target_status then
    return jsonb_build_object('success', true, 'already_applied', true, 'child_status', v_child.status, 'parent_status', v_parent.status);
  end if;

  -- Only the locked active paid/preparation parent permits NEW child progression.
  -- Reject ORDER_RECEIVED, AWAITING_PAYMENT, CANCELLED, PAYMENT_FAILED,
  -- REFUND_PENDING, REFUNDED, RIDER_ASSIGNED, OUT_FOR_DELIVERY, DELIVERED,
  -- COMPLETED, and any future/unclassified or null status (fail closed).
  if v_parent.status is null or v_parent.status not in ('PAYMENT_CONFIRMED', 'ORDER_CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH') then
    return jsonb_build_object('success', false, 'code', 'PARENT_NOT_ELIGIBLE', 'message', 'This vendor order cannot move to the requested status.');
  end if;

  select status into v_payment_status
  from public.customer_order_payments
  where customer_order_id = v_parent.id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND', 'message', 'Payment record was not found.');
  end if;

  if (v_child.status = 'PENDING' and p_target_status = 'CONFIRMED') then
    if v_payment_status <> 'PAID'
    then
      return jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_VERIFIED', 'message', 'Payment must be verified before confirming this vendor order.');
    end if;
  elsif not ((v_child.status = 'CONFIRMED' and p_target_status = 'PREPARING')
    or (v_child.status = 'PREPARING' and p_target_status = 'READY')) then
    return jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'This vendor order cannot move to the requested status.');
  end if;

  update public.orders
  set status = p_target_status
  where id = v_child.id;

  select count(*)::integer,
    bool_and(o.status in ('CONFIRMED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED')),
    bool_and(o.status in ('PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED')),
    bool_and(o.status in ('READY', 'IN_TRANSIT', 'DELIVERED'))
  into v_active_child_count, v_all_confirmed, v_all_preparing, v_all_ready
  from public.orders o
  where o.customer_order_id = v_parent.id and o.status <> 'CANCELLED';

  if v_active_child_count = 0 then
    raise exception 'This vendor order cannot move to the requested status.';
  end if;

  if v_all_ready then
    v_derived_parent_status := case when v_parent.fulfillment_type = 'PICKUP'
      then 'READY_FOR_PICKUP'::public.customer_order_status else 'READY_FOR_DISPATCH'::public.customer_order_status end;
  elsif v_all_preparing then
    v_derived_parent_status := 'PREPARING';
  elsif v_all_confirmed then
    v_derived_parent_status := 'ORDER_CONFIRMED';
  else
    v_derived_parent_status := v_parent.status;
  end if;

  v_parent_rank := case v_parent.status
    when 'PAYMENT_CONFIRMED' then 0 when 'ORDER_CONFIRMED' then 1 when 'PREPARING' then 2
    when 'READY_FOR_PICKUP' then 3 when 'READY_FOR_DISPATCH' then 3 else 99 end;
  v_derived_rank := case v_derived_parent_status
    when 'PAYMENT_CONFIRMED' then 0 when 'ORDER_CONFIRMED' then 1 when 'PREPARING' then 2
    when 'READY_FOR_PICKUP' then 3 when 'READY_FOR_DISPATCH' then 3 else 0 end;

  if v_derived_rank > v_parent_rank then
    update public.customer_orders
    set status = v_derived_parent_status
    where id = v_parent.id;
    insert into public.customer_order_status_history (customer_order_id, vendor_order_id, status, actor_user_id)
    values (v_parent.id, v_child.id, v_derived_parent_status, v_actor_id);
  end if;

  return jsonb_build_object('success', true, 'already_applied', false, 'child_status', p_target_status, 'parent_status', case when v_derived_rank > v_parent_rank then v_derived_parent_status else v_parent.status end);
end;
$$;

revoke all on function public.admin_advance_vendor_order(uuid, public.order_status) from public;
revoke all on function public.admin_advance_vendor_order(uuid, public.order_status) from anon;
grant execute on function public.admin_advance_vendor_order(uuid, public.order_status) to authenticated, service_role;

-- Keep normal involved-user/admin SELECT access, but remove only the direct
-- browser-admin child-order UPDATE bypass; lifecycle changes must use the RPC.
drop policy if exists "orders_admin_update" on public.orders;
