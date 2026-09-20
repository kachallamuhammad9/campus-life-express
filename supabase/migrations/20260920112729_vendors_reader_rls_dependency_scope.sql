-- The legacy client-facing vendor policy must not be evaluated by the
-- dedicated JARVIS reader. Its legitimate callers are the normal API roles.
begin;

drop policy if exists vendors_select_public on public.vendors;
create policy vendors_select_public on public.vendors
  for select to anon, authenticated, service_role
  using (
    status = 'ACTIVE'::public.vendor_status
    or (auth.uid() is not null and owner_user_id = auth.uid())
    or public.is_admin()
  );

commit;
