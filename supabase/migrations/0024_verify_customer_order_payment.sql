-- CLX Phase 4C: manual payment verification is an admin-only, atomic RPC.
-- This migration is intentionally local-only until reviewed and deployed separately.

create or replace function public.verify_customer_order_payment(p_customer_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_payment public.customer_order_payments%rowtype;
  v_paid_order_statuses constant public.customer_order_status[] := array[
    'PAYMENT_CONFIRMED', 'ORDER_CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP',
    'READY_FOR_DISPATCH', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'
  ]::public.customer_order_status[];
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'You are not authorized to verify payments.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_customer_order_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.');
  end if;

  select * into v_payment
  from public.customer_order_payments
  where customer_order_id = v_order.id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND', 'message', 'Payment record was not found.');
  end if;

  if v_payment.status = 'PAID' and v_order.status = any(v_paid_order_statuses) then
    return jsonb_build_object('success', true, 'already_verified', true, 'order_status', v_order.status, 'payment_status', v_payment.status);
  end if;

  if v_order.status in ('CANCELLED', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED', 'COMPLETED') then
    return jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_ELIGIBLE', 'message', 'This order is not eligible for payment verification.');
  end if;

  if v_payment.amount_kobo <> v_order.total_kobo then
    return jsonb_build_object('success', false, 'code', 'PAYMENT_AMOUNT_MISMATCH', 'message', 'This order is not eligible for payment verification.');
  end if;

  if v_payment.status <> 'PENDING'
    or v_order.status not in ('ORDER_RECEIVED', 'AWAITING_PAYMENT') then
    return jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_ELIGIBLE', 'message', 'This order is not eligible for payment verification.');
  end if;

  update public.customer_order_payments
  set status = 'PAID', verified_by_user_id = v_actor_id, verified_at = now(), paid_at = coalesce(paid_at, now())
  where id = v_payment.id;

  update public.customer_orders
  set status = 'PAYMENT_CONFIRMED'
  where id = v_order.id;

  insert into public.customer_order_status_history (customer_order_id, status, actor_user_id)
  values (v_order.id, 'PAYMENT_CONFIRMED', v_actor_id);

  return jsonb_build_object('success', true, 'already_verified', false, 'order_status', 'PAYMENT_CONFIRMED', 'payment_status', 'PAID');
end;
$$;

revoke all on function public.verify_customer_order_payment(uuid) from public;
revoke all on function public.verify_customer_order_payment(uuid) from anon;
grant execute on function public.verify_customer_order_payment(uuid) to authenticated, service_role;

-- Admin reads remain RLS-protected, but all operational writes must go through
-- the authorization, validation, locking, and audit trail above.
drop policy if exists customer_orders_admin_manage on public.customer_orders;
drop policy if exists customer_order_payments_admin_manage on public.customer_order_payments;
drop policy if exists customer_order_status_history_admin_manage on public.customer_order_status_history;