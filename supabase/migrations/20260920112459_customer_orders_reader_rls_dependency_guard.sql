-- Keep the legacy customer/admin read policy on its intended API role while
-- ensuring an invoker-security dedicated reader never evaluates is_admin().
-- The JARVIS reader has its own SELECT policy and remains outside authenticated.
begin;

drop policy if exists customer_orders_select_own on public.customer_orders;
create policy customer_orders_select_own on public.customer_orders
  for select to authenticated
  using (
    case
      when current_user = 'authenticated'
        then customer_user_id = auth.uid() or public.is_admin()
      else false
    end
  );

commit;
