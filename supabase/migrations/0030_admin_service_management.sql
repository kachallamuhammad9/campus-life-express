-- Phase 4E.4: local-only migration. No existing application data is rewritten.
begin;
alter table public.services alter column provider_user_id drop not null;
alter table public.services add constraint services_provider_context_check
  check (vendor_id is not null or provider_user_id is not null);
-- Index creation is itself a fail-closed duplicate preflight. No merging/backfill.
create unique index services_vendor_campus_normalized_name on public.services
 (vendor_id,campus_id,lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g')))) where vendor_id is not null;
create unique index services_vendor_campus_slug on public.services(vendor_id,campus_id,slug) where vendor_id is not null;
create or replace function public._admin_service_image_url(p_url text)
returns text
language plpgsql immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_url text := nullif(regexp_replace(p_url, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_parts text[];
  v_authority text;
  v_host text;
  v_label text;
begin
  if v_url is null then return null; end if;
  if length(v_url) > 2048 or v_url ~ '[[:space:][:cntrl:]]'
     or strpos(v_url, chr(92)) > 0
     or strpos(regexp_replace(v_url, '%[0-9A-Fa-f]{2}', '', 'g'), '%') > 0 then
    raise exception 'Image URL must be valid HTTP/HTTPS and at most 2048 characters.';
  end if;
  v_parts := regexp_match(v_url, '^https?://([^/?#]+)([/?#].*)?$', 'i');
  if v_parts is null then raise exception 'Image URL requires HTTP/HTTPS and a valid host.'; end if;
  v_authority := v_parts[1];
  v_parts := regexp_match(v_authority, '^([A-Za-z0-9.-]+)(:([0-9]{1,5}))?$');
  if v_parts is null then raise exception 'Image URL requires a valid host without userinfo.'; end if;
  v_host := v_parts[1];
  if v_parts[3] is not null and v_parts[3]::integer not between 1 and 65535 then
    raise exception 'Image URL port must be between 1 and 65535.';
  end if;
  if length(v_host) > 253 then raise exception 'Image URL host is too long.'; end if;
  if v_host ~ '^[0-9.]+$' then
    if v_host !~ '^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$' then
      raise exception 'Image URL requires a valid IPv4 host.';
    end if;
    begin
      perform v_host::inet;
    exception when invalid_text_representation then
      raise exception 'Image URL requires a valid IPv4 host.';
    end;
  else
    foreach v_label in array string_to_array(v_host, '.') loop
      if length(v_label) > 63 or v_label !~ '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$' then
        raise exception 'Image URL requires valid DNS host labels.';
      end if;
    end loop;
  end if;
  return v_url;
end;
$$;
revoke all on function public._admin_service_image_url(text) from public, anon, authenticated, service_role;


-- Private validator checks the complete resulting row, without repairing legacy data.
create function public._admin_validate_service(s public.services) returns void
language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 perform 1 from public.vendors where id=s.vendor_id and status='ACTIVE' and is_verified is true for share;
 if not found then raise exception 'An active verified vendor is required.'; end if;
 perform 1 from public.campuses where id=s.campus_id and is_active is true for share;
 if not found then raise exception 'An active campus is required.'; end if;
 perform 1 from public.vendor_campuses where vendor_id=s.vendor_id and campus_id=s.campus_id and is_active is true for share;
 if not found then raise exception 'An active vendor-campus association is required.'; end if;
 perform 1 from public.categories where id=s.category_id and slug='services' and parent_id is null and is_active is true for share;
 if not found then raise exception 'An active Campus Services root is required.'; end if;
 if s.subcategory_id is not null then
  perform 1 from public.categories where id=s.subcategory_id and parent_id=s.category_id and is_active is true for share;
  if not found then raise exception 'An active child of Campus Services is required.'; end if;
 end if;
 if nullif(btrim(regexp_replace(s.name,'[[:space:]]+',' ','g')),'') is null or length(s.name)>255 then raise exception 'Service name must contain 1-255 characters.'; end if;
 if length(s.description)>2000 then raise exception 'Description exceeds 2000 characters.'; end if;
 if length(s.turnaround_time)>255 then raise exception 'Turnaround exceeds 255 characters.'; end if;
 if s.price_type is null or (s.price_type in ('FIXED','STARTING_FROM') and s.starting_price_kobo is null)
   or (s.starting_price_kobo is not null and (s.starting_price_kobo<=0 or s.starting_price_kobo>999999999)) then
  raise exception 'Price must be positive integer kobo up to 999999999; only QUOTE allows no price.';
 end if;
 perform public._admin_service_image_url(s.image_url);
 if s.is_active is null or s.requires_file_upload is null or s.requires_appointment is null then raise exception 'Flags must be boolean.'; end if;
end $$;
revoke all on function public._admin_validate_service(public.services) from public,anon,authenticated,service_role;

create function public._admin_service_slug(p_name text,p_vendor uuid,p_campus uuid,p_provider uuid,p_id uuid) returns text
language plpgsql set search_path=pg_catalog,public,pg_temp as $$
declare base text:=left(trim(both '-' from regexp_replace(lower(p_name),'[^a-z0-9]+','-','g')),180); candidate text; suffix integer:=1;
begin
 if base='' then base:='service'; end if; candidate:=base;
 while exists(select 1 from public.services where id is distinct from p_id and campus_id=p_campus and (vendor_id=p_vendor or provider_user_id=p_provider) and slug=candidate) loop
  suffix:=suffix+1; candidate:=base||'-'||suffix;
 end loop;
 return candidate;
end $$;
revoke all on function public._admin_service_slug(text,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.admin_create_service(
 p_vendor_id uuid,p_campus_id uuid,p_category_id uuid,p_name text,
 p_subcategory_id uuid default null,p_description text default null,
 p_starting_price_kobo bigint default null,p_price_type public.price_type default 'QUOTE',
 p_image_url text default null,p_turnaround_time text default null,
 p_requires_file_upload boolean default false,p_requires_appointment boolean default false,p_is_active boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.services;
begin
 if auth.uid() is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 perform pg_advisory_xact_lock(430004);
 s.id:=gen_random_uuid(); s.vendor_id:=p_vendor_id; s.campus_id:=p_campus_id;
 select owner_user_id into s.provider_user_id from public.vendors where id=p_vendor_id for share;
 s.category_id:=p_category_id; s.subcategory_id:=p_subcategory_id;
 s.name:=nullif(btrim(regexp_replace(p_name,'[[:space:]]+',' ','g')),'');
 s.description:=nullif(btrim(regexp_replace(p_description,'[[:space:]]+',' ','g')),'');
 s.turnaround_time:=nullif(btrim(regexp_replace(p_turnaround_time,'[[:space:]]+',' ','g')),'');
 s.starting_price_kobo:=p_starting_price_kobo; s.price_type:=p_price_type;
 s.image_url:=public._admin_service_image_url(p_image_url);
 s.requires_file_upload:=p_requires_file_upload; s.requires_appointment:=p_requires_appointment; s.is_active:=p_is_active;
 perform public._admin_validate_service(s);
 if exists(select 1 from public.services where vendor_id=s.vendor_id and campus_id=s.campus_id and lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g')))=lower(s.name)) then raise exception 'Service name already exists for this vendor and campus.'; end if;
 s.slug:=public._admin_service_slug(s.name,s.vendor_id,s.campus_id,s.provider_user_id,s.id);
 insert into public.services(id,vendor_id,campus_id,provider_user_id,category_id,subcategory_id,name,slug,description,starting_price_kobo,price_type,image_url,turnaround_time,requires_file_upload,requires_appointment,is_active)
 values(s.id,s.vendor_id,s.campus_id,s.provider_user_id,s.category_id,s.subcategory_id,s.name,s.slug,s.description,s.starting_price_kobo,s.price_type,s.image_url,s.turnaround_time,s.requires_file_upload,s.requires_appointment,s.is_active) returning * into s;
 return to_jsonb(s);
exception when unique_violation then raise exception 'Service name or slug already exists. Refresh and retry.';
end $$;

create function public.admin_update_service(p_service_id uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.services; old public.services; k text;
begin
 if auth.uid() is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Patch must be an object.'; end if;
 if exists(select 1 from jsonb_object_keys(p_patch) x where x not in ('name','description','category_id','subcategory_id','starting_price_kobo','price_type','image_url','turnaround_time','requires_file_upload','requires_appointment','is_active')) then raise exception 'Unknown or immutable service field.'; end if;
 perform pg_advisory_xact_lock(430004);
 select * into s from public.services where id=p_service_id for update;
 if not found then raise exception 'Service not found.'; end if; old:=s;
 -- The only legacy escape hatch: no incidental repairs, metadata or context changes.
 if p_patch='{"is_active":false}'::jsonb then
  if s.is_active then update public.services set is_active=false,updated_at=now() where id=s.id returning * into s; end if;
  return to_jsonb(s);
 end if;
 foreach k in array array['name','description','image_url','turnaround_time','category_id','subcategory_id','price_type'] loop
  if p_patch ? k and jsonb_typeof(p_patch->k) not in ('string','null') then raise exception 'Text and identity fields require strings.'; end if;
 end loop;
 foreach k in array array['is_active','requires_file_upload','requires_appointment'] loop
  if p_patch ? k and jsonb_typeof(p_patch->k)<>'boolean' then raise exception 'Flags must be boolean.'; end if;
 end loop;
 if p_patch ? 'starting_price_kobo' and p_patch->'starting_price_kobo'<>'null'::jsonb and (jsonb_typeof(p_patch->'starting_price_kobo')<>'number' or p_patch->>'starting_price_kobo' !~ '^[0-9]+$') then raise exception 'Price must be integer kobo.'; end if;
 -- Type conversion happens only after allowlist and JSON type checks.
 s:=jsonb_populate_record(s,p_patch);
 foreach k in array array['name','description','turnaround_time'] loop
  if p_patch ? k then s:=jsonb_populate_record(s,jsonb_build_object(k,nullif(btrim(regexp_replace(p_patch->>k,'[[:space:]]+',' ','g')),''))); end if;
 end loop;
 if p_patch ? 'image_url' then s.image_url:=public._admin_service_image_url(s.image_url); end if;
 perform public._admin_validate_service(s);
 if exists(select 1 from public.services where id<>s.id and vendor_id=s.vendor_id and campus_id=s.campus_id and lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g')))=lower(btrim(regexp_replace(s.name,'[[:space:]]+',' ','g')))) then raise exception 'Service name already exists for this vendor and campus.'; end if;
 if s.name is distinct from old.name then s.slug:=public._admin_service_slug(s.name,s.vendor_id,s.campus_id,s.provider_user_id,s.id); end if;
 if s is not distinct from old then return to_jsonb(old); end if;
 update public.services set name=s.name,slug=s.slug,description=s.description,category_id=s.category_id,subcategory_id=s.subcategory_id,
 starting_price_kobo=s.starting_price_kobo,price_type=s.price_type,image_url=s.image_url,turnaround_time=s.turnaround_time,
 requires_file_upload=s.requires_file_upload,requires_appointment=s.requires_appointment,is_active=s.is_active,updated_at=now()
 where id=s.id returning * into s;
 return to_jsonb(s);
exception when unique_violation then raise exception 'Service name or slug already exists. Refresh and retry.';
 when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid service field value.';
end $$;
revoke all on function public.admin_create_service(uuid,uuid,uuid,text,uuid,text,bigint,public.price_type,text,text,boolean,boolean,boolean) from public,anon;
revoke all on function public.admin_update_service(uuid,jsonb) from public,anon;
grant execute on function public.admin_create_service(uuid,uuid,uuid,text,uuid,text,bigint,public.price_type,text,text,boolean,boolean,boolean),public.admin_update_service(uuid,jsonb) to authenticated,service_role;

revoke insert,update,delete,truncate,references,trigger on public.services from public,anon,authenticated;
grant select on public.services to anon,authenticated;
drop policy if exists services_provider_insert on public.services;
drop policy if exists services_provider_update on public.services;
drop policy if exists services_provider_delete on public.services;
drop policy if exists services_select_public on public.services;
create policy services_select_public on public.services for select using (
 (is_active and exists(select 1 from public.vendors v join public.vendor_campuses vc on vc.vendor_id=v.id
 join public.campuses c on c.id=vc.campus_id join public.categories cat on cat.id=services.category_id
 where v.id=services.vendor_id and vc.campus_id=services.campus_id and v.status='ACTIVE' and v.is_verified and vc.is_active and c.is_active
 and cat.is_active and cat.parent_id is null and cat.slug='services'
 and (services.subcategory_id is null or exists(select 1 from public.categories sub where sub.id=services.subcategory_id and sub.is_active and sub.parent_id=cat.id))))
 or (auth.uid() is not null and provider_user_id=auth.uid()) or public.owns_vendor(vendor_id) or public.is_admin()
);
-- Inspection branches are intentional. Public catalogue clients must also apply full eligibility.
-- Provider self-management is deferred; retain read helpers but remove direct writes.
create or replace function public.enforce_service_context() returns trigger
language plpgsql set search_path=pg_catalog,public,pg_temp as $$
declare s public.services;
begin
 select * into s from public.services where id=new.service_id;
 if not found then raise exception 'Service not found.'; end if;
 if s.provider_user_id is null then raise exception 'Requests for CLX-managed providerless services are not supported yet.'; end if;
 if s.provider_user_id is distinct from new.provider_user_id or s.vendor_id is distinct from new.vendor_id or s.campus_id is distinct from new.campus_id then raise exception 'Service request must match its service provider, vendor, and campus'; end if;
 return new;
end $$;
create or replace function public.admin_approve_vendor_application(p_application_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_app public.vendor_applications%rowtype;
  v_vendor public.vendors%rowtype;
  v_category uuid;
  v_slug text;
  v_phone text;
begin
  if v_actor is null or public.is_admin() is not true then
    raise exception 'Admin authorization required.';
  end if;
  select * into v_app from public.vendor_applications
    where id = p_application_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if v_app.status is null or v_app.status not in ('PENDING','UNDER_REVIEW','APPROVED') then
    raise exception 'Application is not eligible for approval.';
  end if;

  -- Serialize approvals across applications before identity lookup/creation.
  -- No other application rows are locked by this function, avoiding lock cycles.
  perform pg_advisory_xact_lock(4280028, 1);
  perform 1 from public.campuses where id = v_app.campus_id and is_active is true for share;
  if not found then raise exception 'An active application campus is required.'; end if;
  -- Food, shopping and Campus Services intake; logistics remains unsupported.
  select id into v_category from public.categories
    where slug = v_app.category_slug and slug in ('food','shopping','services') and parent_id is null and is_active is true for share;
  if not found then raise exception 'Application category is not supported for vendor approval.'; end if;
  v_phone := public._vendor_app_normalize_ng_phone(v_app.phone_number);
  if v_phone is null or length(btrim(coalesce(v_app.business_name,''))) < 2
     or length(btrim(coalesce(v_app.location,''))) < 2 then
    raise exception 'Application business details require review.';
  end if;
  -- Opaque deterministic namespace; do not publish the internal application UUID.
  -- A digest collision is rejected, never used as authority to link a vendor.
  v_slug := 'clx-vendor-' || md5('vendor-application:' || v_app.id::text);

  if v_app.vendor_id is not null then
    select * into v_vendor from public.vendors where id = v_app.vendor_id for update;
    if not found then raise exception 'Linked vendor requires manual resolution.'; end if;
    -- An explicit link plus exact identity fields is required; never infer a link.
    if lower(btrim(v_vendor.name)) is distinct from lower(btrim(v_app.business_name))
       or public._vendor_app_normalize_ng_phone(v_vendor.phone_number) is distinct from v_phone
       or v_vendor.category_id is distinct from v_category
       or btrim(v_vendor.location) is distinct from btrim(v_app.location)
       or v_vendor.status is distinct from 'ACTIVE'::public.vendor_status
       or v_vendor.is_verified is not true then
      raise exception 'Linked vendor requires manual resolution.';
    end if;
  elsif v_app.status = 'APPROVED' then
    raise exception 'Approved application has no consistent vendor link.';
  end if;

  if v_app.status = 'APPROVED' then
    perform 1 from public.vendor_campuses
      where vendor_id = v_vendor.id and campus_id = v_app.campus_id and is_active is true for share;
    if not found then raise exception 'Approved application has no active campus association.'; end if;
    return jsonb_build_object('application_number', v_app.application_number,
      'vendor_name', v_vendor.name, 'status', 'APPROVED', 'already_approved', true);
  end if;

  if v_app.vendor_id is null then
    -- Exact name OR normalized contact collision is ambiguous, not authority to merge.
    -- The global approval lock also prevents duplicate creation across two applications.
    if exists (select 1 from public.vendors v where v.slug = v_slug
      or lower(btrim(v.name)) = lower(btrim(v_app.business_name))
      or public._vendor_app_normalize_ng_phone(v.phone_number) in
        (v_phone, public._vendor_app_normalize_ng_phone(v_app.whatsapp_number))) then
      raise exception 'Possible existing vendor requires manual resolution.';
    end if;
    insert into public.vendors (owner_user_id, name, slug, category_id, location,
      phone_number, email, description, status, is_verified)
    values (null, btrim(v_app.business_name), v_slug, v_category, btrim(v_app.location),
      v_phone, v_app.email, v_app.description, 'ACTIVE', true)
    returning * into v_vendor;
  end if;

  insert into public.vendor_campuses (vendor_id, campus_id, location, is_active)
    values (v_vendor.id, v_app.campus_id, btrim(v_app.location), true)
    on conflict (vendor_id, campus_id) do nothing;
  -- Preserve an existing relation; an inactive relation requires manual resolution.
  perform 1 from public.vendor_campuses
    where vendor_id = v_vendor.id and campus_id = v_app.campus_id and is_active is true for share;
  if not found then raise exception 'Vendor campus association requires manual resolution.'; end if;
  -- Last write: any failure rolls back vendor creation and campus insertion as well.
  -- Preserve review_notes verbatim on approval.
  update public.vendor_applications set status = 'APPROVED', vendor_id = v_vendor.id,
    reviewed_by = v_actor, reviewed_at = now(), rejection_reason = null where id = v_app.id;
  return jsonb_build_object('application_number', v_app.application_number,
    'vendor_name', v_vendor.name, 'status', 'APPROVED', 'already_approved', false);
end;
$$;


-- CREATE OR REPLACE preserves the approved function privileges.
commit;
