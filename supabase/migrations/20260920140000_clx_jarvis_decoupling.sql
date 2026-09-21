-- CLX JARVIS Decoupling Migration
-- Removes accidentally deployed JARVIS-specific objects to maintain a clean platform boundary.
-- CLX remains fully independent and production-ready.

begin;

-- 1. Drop JARVIS-specific views
drop view if exists public.jarvis_reader_customer_orders;
drop view if exists public.jarvis_reader_products;
drop view if exists public.jarvis_reader_vendors;

-- 2. Drop JARVIS-specific policies
drop policy if exists customer_orders_jarvis_reader_select on public.customer_orders;
drop policy if exists products_jarvis_reader_select on public.products;
drop policy if exists vendors_jarvis_reader_select on public.vendors;

-- 3. Drop JARVIS-specific functions
drop function if exists public.is_jarvis_reader();

-- 4. Drop JARVIS-specific identity mapping
drop table if exists public.jarvis_reader_identities;

-- 5. Restore original auth hook (or drop the customized one if no longer needed)
drop function if exists public.custom_access_token_hook(jsonb);

-- 6. Drop JARVIS role
-- We must revoke column-level privileges and role membership before dropping.
revoke all on public.vendors from jarvis_reader;
revoke all on public.products from jarvis_reader;
revoke all on public.customer_orders from jarvis_reader;
revoke usage on schema public from jarvis_reader;
revoke jarvis_reader from authenticator;

drop role if exists jarvis_reader;

commit;
