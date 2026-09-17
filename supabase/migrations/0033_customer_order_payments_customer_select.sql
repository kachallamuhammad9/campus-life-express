-- CLX Phase 4.3: allow customers to read only their own order payment row.
-- Payment writes and verification remain admin/RPC-only.

create policy customer_order_payments_select_own
on public.customer_order_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_orders co
    where co.id = customer_order_payments.customer_order_id
      and co.customer_user_id = auth.uid()
  )
);
