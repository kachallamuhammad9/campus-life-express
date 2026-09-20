-- Correct the earlier reader dependency migration without rewriting history.
-- This legacy policy is for normal CLX API callers only; jarvis_reader has its
-- own policy and must never evaluate the category/admin predicate.
begin;

drop policy if exists products_select_public on public.products;
create policy products_select_public on public.products
  for select to anon, authenticated, service_role
  using (
    (is_active and exists (
      select 1
      from public.vendors v
      join public.vendor_campuses vc on vc.vendor_id = v.id
        and vc.campus_id = products.campus_id
      join public.campuses c on c.id = products.campus_id
      join public.categories cat on cat.id = products.category_id
      where v.id = products.vendor_id
        and v.status = 'ACTIVE'::public.vendor_status
        and v.is_verified
        and vc.is_active
        and c.is_active
        and cat.is_active
        and (products.subcategory_id is null or exists (
          select 1 from public.categories sub
          where sub.id = products.subcategory_id
            and sub.is_active and sub.parent_id = cat.id
        ))
    )) or public.is_admin()
  );

commit;
