-- CLX Phase 18B-1: Security Helper Functions
-- Idempotent creation of authorization helper functions for Row Level Security (RLS).
-- NOTE: RLS is NOT enabled in this migration. No tables, columns, or enums are modified.

-- 1. public.is_admin()
-- Returns true if the authenticated user has ADMIN or SUPER_ADMIN role in public.user_roles.
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles
    where user_id = v_uid
      and role in ('ADMIN', 'SUPER_ADMIN')
  );
end;
$$;

-- 2. public.has_role(role_name public.app_role)
-- Returns true if the authenticated user has the specified role in public.user_roles.
create or replace function public.has_role(role_name public.app_role)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null or role_name is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles
    where user_id = v_uid
      and role = role_name
  );
end;
$$;

-- 3. public.get_user_vendor_ids()
-- Returns the set of vendor IDs owned by the authenticated user (vendors.owner_user_id = auth.uid()).
create or replace function public.get_user_vendor_ids()
returns setof uuid
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return;
  end if;

  return query
  select id
  from public.vendors
  where owner_user_id = v_uid;
end;
$$;

-- 4. public.owns_vendor(vendor_id uuid)
-- Returns true if the authenticated user is the owner of the given vendor ID.
create or replace function public.owns_vendor(vendor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_uid uuid;
begin
  if vendor_id is null then
    return false;
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.vendors
    where id = vendor_id
      and owner_user_id = v_uid
  );
end;
$$;

-- Permissions & Access Hardening
-- Revoke PUBLIC execution privilege and grant explicitly to standard Supabase client roles
revoke all on function public.is_admin() from public;
revoke all on function public.has_role(public.app_role) from public;
revoke all on function public.get_user_vendor_ids() from public;
revoke all on function public.owns_vendor(uuid) from public;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.has_role(public.app_role) to anon, authenticated, service_role;
grant execute on function public.get_user_vendor_ids() to anon, authenticated, service_role;
grant execute on function public.owns_vendor(uuid) to anon, authenticated, service_role;
