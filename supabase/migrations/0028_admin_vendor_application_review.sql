-- Phase 4E.2: admin review and approval. No data fixtures or account creation.
-- Application writes are RPC-only; preserve the existing admin SELECT policy.
drop policy if exists vendor_applications_admin_update on public.vendor_applications;
revoke update on public.vendor_applications from authenticated;

create or replace function public.admin_review_vendor_application(
  p_application_id uuid,
  p_target_status public.vendor_application_status,
  p_review_note text default null,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_app public.vendor_applications%rowtype;
  -- Normalize whitespace before validation, length checks and storage.
  v_note text := nullif(btrim(regexp_replace(p_review_note, '[[:space:]]+', ' ', 'g')), '');
  v_reason text := nullif(btrim(regexp_replace(p_rejection_reason, '[[:space:]]+', ' ', 'g')), '');
begin
  if v_actor is null or public.is_admin() is not true then
    raise exception 'Admin authorization required.';
  end if;
  select * into v_app from public.vendor_applications
    where id = p_application_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if p_target_status is null or (
    (v_app.status = 'PENDING' and p_target_status in ('UNDER_REVIEW','NEEDS_INFORMATION','REJECTED')) or
    (v_app.status = 'UNDER_REVIEW' and p_target_status in ('NEEDS_INFORMATION','REJECTED')) or
    (v_app.status = 'NEEDS_INFORMATION' and p_target_status in ('UNDER_REVIEW','REJECTED'))
  ) is not true then raise exception 'Review transition is not permitted.'; end if;
  if length(coalesce(v_note, '')) > 2000 or length(coalesce(v_reason, '')) > 2000 then
    raise exception 'Review text must be 2000 characters or fewer.';
  end if;
  if p_target_status = 'NEEDS_INFORMATION' and v_note is null then
    raise exception 'An information request is required.';
  end if;
  if p_target_status = 'REJECTED' and v_reason is null then
    raise exception 'A rejection reason is required.';
  end if;
  update public.vendor_applications set
    status = p_target_status, reviewed_by = v_actor, reviewed_at = now(),
    review_notes = coalesce(v_note, review_notes),
    rejection_reason = case when p_target_status = 'REJECTED' then v_reason else null end
    where id = v_app.id;
  return jsonb_build_object('application_number', v_app.application_number, 'status', p_target_status);
end;
$$;

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
  -- Only retail/food vendor intake in this phase, never service/logistics approval.
  select id into v_category from public.categories
    where slug = v_app.category_slug and slug in ('food','shopping') and is_active is true for share;
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

revoke all on function public.admin_review_vendor_application(uuid, public.vendor_application_status, text, text) from public, anon;
revoke all on function public.admin_approve_vendor_application(uuid) from public, anon;
grant execute on function public.admin_review_vendor_application(uuid, public.vendor_application_status, text, text) to authenticated, service_role;
grant execute on function public.admin_approve_vendor_application(uuid) to authenticated, service_role;
