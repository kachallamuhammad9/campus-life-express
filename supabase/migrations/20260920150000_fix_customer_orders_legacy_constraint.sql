-- CLX Constraint Repair
-- Removes the redundant and legacy customer_orders_check1 constraint that
-- incorrectly required delivery_zone_id for delivery orders.
-- This aligns the table with the UNIMAID landmark model.

begin;

alter table public.customer_orders
  drop constraint if exists customer_orders_check1;

commit;
