insert into public.campuses (legacy_key, slug, name, short_name, location, is_active)
values
  ('unimaid', 'unimaid', 'University of Maiduguri', 'UNIMAID', 'Maiduguri, Borno State', true),
  ('kiu', 'kiu', 'Kashim Ibrahim University', 'KIU', 'Maiduguri, Borno State', false),
  ('buk', 'buk', 'Bayero University Kano', 'BUK', 'Kano, Kano State', false)
on conflict (slug) do update set
  legacy_key = excluded.legacy_key,
  name = excluded.name,
  short_name = excluded.short_name,
  location = excluded.location,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.categories (legacy_key, slug, name, sort_order)
values
  ('food', 'food', 'Food', 1),
  ('shopping', 'shopping', 'Student Shopping', 2),
  ('services', 'services', 'Campus Services', 3),
  ('marketplace', 'marketplace', 'Student Marketplace', 4),
  ('delivery', 'delivery', 'Delivery', 5)
on conflict (slug) do update set
  legacy_key = excluded.legacy_key,
  name = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.categories (legacy_key, parent_id, slug, name, sort_order)
select v.legacy_key, c.id, v.slug, v.name, v.sort_order
from public.categories c
cross join (values
  ('food-restaurants', 'food-restaurants', 'Restaurants', 1),
  ('food-campus-vendors', 'food-campus-vendors', 'Campus Food Vendors', 2),
  ('food-snacks', 'food-snacks', 'Snacks', 3),
  ('food-drinks', 'food-drinks', 'Drinks', 4)
) as v(legacy_key, slug, name, sort_order)
where c.slug = 'food'
on conflict (slug) do update set parent_id = excluded.parent_id, name = excluded.name, sort_order = excluded.sort_order, updated_at = now();

insert into public.categories (legacy_key, parent_id, slug, name, sort_order)
select v.legacy_key, c.id, v.slug, v.name, v.sort_order
from public.categories c
cross join (values
  ('shopping-fashion', 'shopping-fashion', 'Fashion', 1),
  ('shopping-shoes', 'shopping-shoes', 'Shoes', 2),
  ('shopping-phones-accessories', 'shopping-phones-accessories', 'Phones & Accessories', 3),
  ('shopping-beauty', 'shopping-beauty', 'Beauty', 4),
  ('shopping-books', 'shopping-books', 'Books', 5),
  ('shopping-stationery', 'shopping-stationery', 'Stationery', 6)
) as v(legacy_key, slug, name, sort_order)
where c.slug = 'shopping'
on conflict (slug) do update set parent_id = excluded.parent_id, name = excluded.name, sort_order = excluded.sort_order, updated_at = now();

insert into public.categories (legacy_key, parent_id, slug, name, sort_order)
select v.legacy_key, c.id, v.slug, v.name, v.sort_order
from public.categories c
cross join (values
  ('services-printing', 'services-printing', 'Printing', 1),
  ('services-graphics', 'services-graphics', 'Graphics', 2),
  ('services-photography', 'services-photography', 'Photography', 3),
  ('services-laundry', 'services-laundry', 'Laundry', 4),
  ('services-barbing', 'services-barbing', 'Barbing', 5),
  ('services-tailoring', 'services-tailoring', 'Tailoring', 6),
  ('services-phone-repair', 'services-phone-repair', 'Phone Repair', 7)
) as v(legacy_key, slug, name, sort_order)
where c.slug = 'services'
on conflict (slug) do update set parent_id = excluded.parent_id, name = excluded.name, sort_order = excluded.sort_order, updated_at = now();

insert into public.categories (legacy_key, parent_id, slug, name, sort_order)
select v.legacy_key, c.id, v.slug, v.name, v.sort_order
from public.categories c
cross join (values
  ('marketplace-used-textbooks', 'marketplace-used-textbooks', 'Used Textbooks', 1),
  ('marketplace-used-electronics', 'marketplace-used-electronics', 'Used Electronics', 2),
  ('marketplace-furniture', 'marketplace-furniture', 'Furniture', 3),
  ('marketplace-hostel-items', 'marketplace-hostel-items', 'Hostel Items', 4),
  ('marketplace-student-sales', 'marketplace-student-sales', 'Student-to-Student Sales', 5)
) as v(legacy_key, slug, name, sort_order)
where c.slug = 'marketplace'
on conflict (slug) do update set parent_id = excluded.parent_id, name = excluded.name, sort_order = excluded.sort_order, updated_at = now();

insert into public.categories (legacy_key, parent_id, slug, name, sort_order)
select v.legacy_key, c.id, v.slug, v.name, v.sort_order
from public.categories c
cross join (values
  ('delivery-campus', 'delivery-campus', 'Campus Delivery', 1),
  ('delivery-vendor-pickup', 'delivery-vendor-pickup', 'Vendor Pickup', 2),
  ('delivery-errands', 'delivery-errands', 'Errands', 3)
) as v(legacy_key, slug, name, sort_order)
where c.slug = 'delivery'
on conflict (slug) do update set parent_id = excluded.parent_id, name = excluded.name, sort_order = excluded.sort_order, updated_at = now();

insert into public.delivery_zones (campus_id, name)
select c.id, z.name
from public.campuses c
cross join lateral unnest(case c.slug
  when 'unimaid' then array['Acada Complex', 'Hostel A-D', 'Hostel E-H', 'Science Complex', 'Faculty of Law', 'Staff Quarters', 'Commercial Center']
  when 'kiu' then array['Main Campus', 'Student Village', 'Admin Block', 'Library Area', 'Sports Complex']
  when 'buk' then array['New Site', 'Old Site', 'Hostels']
end) as z(name)
on conflict (campus_id, name) do nothing;
