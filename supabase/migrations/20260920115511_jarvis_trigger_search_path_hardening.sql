-- Phase 4C security-advisor remediation. These are trigger functions, not
-- JARVIS entry points; pinning their path prevents caller-controlled object
-- resolution without changing their bodies or trigger semantics.
begin;

alter function public.enforce_order_item_context() set search_path = pg_catalog, public, pg_temp;
alter function public.set_updated_at() set search_path = pg_catalog, public, pg_temp;
alter function public.prevent_cart_vendor_mismatch() set search_path = pg_catalog, public, pg_temp;

commit;
