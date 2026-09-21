-- Phase 4C forward-only hardening.
-- Remove inherited client/service-role table privileges from the protected
-- reader identity mapping.  The table owner remains unchanged so the
-- SECURITY DEFINER hook can continue to consult it through its owner.

begin;

do $$
declare
  public_execute_count integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'jarvis_reader') then
    raise exception 'precondition failed: jarvis_reader role is missing';
  end if;

  if to_regclass('public.jarvis_reader_identities') is null then
    raise exception 'precondition failed: public.jarvis_reader_identities is missing';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.jarvis_reader_identities'::regclass
      and relrowsecurity
  ) then
    raise exception 'precondition failed: mapping-table RLS is not enabled';
  end if;

  if to_regprocedure('public.custom_access_token_hook(jsonb)') is null then
    raise exception 'precondition failed: custom_access_token_hook(jsonb) is missing';
  end if;

  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version::text = '20260921052437'
  ) then
    raise exception 'precondition failed: approved reader reintroduction migration is not recorded';
  end if;

  if exists (select 1 from public.jarvis_reader_identities) then
    raise exception 'precondition failed: mapping table is not empty';
  end if;

  select count(*)
    into public_execute_count
  from pg_proc p
  cross join lateral aclexplode(
    coalesce(p.proacl, acldefault('f', p.proowner))
  ) privilege
  where p.pronamespace = 'public'::regnamespace
    and privilege.grantee = 0
    and privilege.privilege_type = 'EXECUTE';

  if public_execute_count <> 0 then
    raise exception 'precondition failed: PUBLIC EXECUTE count is %', public_execute_count;
  end if;
end
$$;

revoke all on table public.jarvis_reader_identities
  from public, anon, authenticated, service_role, jarvis_reader;

do $$
begin
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) privilege
    left join pg_roles grantee_role on grantee_role.oid = privilege.grantee
    where c.oid = 'public.jarvis_reader_identities'::regclass
      and (
        privilege.grantee = 0
        or grantee_role.rolname in (
          'anon', 'authenticated', 'service_role', 'jarvis_reader'
        )
      )
  ) then
    raise exception 'postcondition failed: protected mapping table still has client or service-role privileges';
  end if;
end
$$;

commit;
