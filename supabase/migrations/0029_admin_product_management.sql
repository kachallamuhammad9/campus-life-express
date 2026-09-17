-- Phase 4E.3: Admin Product Management RPCs and direct write revocation.
-- Table writes to public.products are restricted to authorized SECURITY DEFINER RPCs.
-- Public SELECT policy (products_select_public) is preserved intact.
-- product_images write policies unchanged (no vendor portal yet, not in scope).

-- No authoritative vendor-to-product commercial category mapping exists.
-- Enforce active category hierarchy only; vendor category is not a permission map.
-- Owner direct writes are intentionally retired for the current admin-only MVP.
-- A future vendor portal needs separately authorized RPCs before enabling writes.

-- Step 1: Revoke direct table mutation grants from API roles
revoke insert, update, delete on public.products from public, anon, authenticated;
revoke truncate, references, trigger on public.products from public, anon, authenticated;

-- Step 2: Drop dormant direct-write RLS policies on products
--         (vendor portal doesn't exist; these were never exercised via API)
drop policy if exists products_owner_insert on public.products;
drop policy if exists products_owner_update on public.products;
drop policy if exists products_owner_delete on public.products;

-- Internal-only URL normalizer. No DNS/network access, dynamic SQL or userinfo.
-- Accept ASCII DNS labels (including punycode), strict dotted IPv4, and optional
-- ports 1..65535. Bracketed IPv6 and raw Unicode hosts are deliberately unsupported.
create or replace function public._admin_product_image_url(p_url text)
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
revoke all on function public._admin_product_image_url(text) from public, anon, authenticated, service_role;

-- ============================================================
-- FUNCTION: admin_create_product
-- Creates a new product for an active vendor/campus pair.
-- Slug is generated server-side with collision resolution.
-- No direct product writes are allowed after this migration.
-- ============================================================
create or replace function public.admin_create_product(
  p_vendor_id           uuid,
  p_campus_id           uuid,
  p_category_id         uuid,
  p_name                text,
  p_price_kobo          bigint,
  p_description         text    default null,
  p_subcategory_id      uuid    default null,
  p_original_price_kobo bigint  default null,
  p_image_url           text    default null,
  p_is_in_stock         boolean default true,
  p_stock_quantity      integer default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_name       text := nullif(btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g')), '');
  v_desc       text := nullif(btrim(regexp_replace(p_description, '[[:space:]]+', ' ', 'g')), '');
  v_img        text := nullif(btrim(regexp_replace(p_image_url, '^[[:space:]]+|[[:space:]]+$', '', 'g')), '');
  v_base_slug  text;
  v_slug       text;
  v_product    public.products%rowtype;
  v_suffix_idx int := 1;
begin
  -- Authorization
  if v_actor is null or public.is_admin() is not true then
    raise exception 'Admin authorization required.';
  end if;

  -- Serialize all product RPCs before any row locks. UNIQUE constraints remain authoritative.
  perform pg_advisory_xact_lock(429003);

  -- Required field validation
  if p_vendor_id is null then
    raise exception 'Vendor is required.';
  end if;
  if p_campus_id is null then
    raise exception 'Campus is required.';
  end if;
  if p_category_id is null then
    raise exception 'Category is required.';
  end if;
  if v_name is null or length(v_name) > 255 then
    raise exception 'Product name must be between 1 and 255 characters.';
  end if;
  if p_price_kobo is null or p_price_kobo <= 0 or p_price_kobo > 999999999 then
    raise exception 'Price must be a positive whole-kobo amount.';
  end if;
  if p_original_price_kobo is not null then
    if p_original_price_kobo < p_price_kobo then
      raise exception 'Original price cannot be less than selling price.';
    end if;
    if p_original_price_kobo > 999999999 then
      raise exception 'Original price exceeds maximum allowable value.';
    end if;
  end if;
  if p_stock_quantity is not null and (p_stock_quantity < 0 or p_stock_quantity > 1000000) then
    raise exception 'Stock quantity must be between 0 and 1,000,000.';
  end if;
  if v_desc is not null and length(v_desc) > 2000 then
    raise exception 'Description must be 2000 characters or fewer.';
  end if;
  v_img := public._admin_product_image_url(p_image_url);

  if p_is_in_stock is null then raise exception 'In-stock flag is required.'; end if;

  -- Verify active vendor
  perform 1 from public.vendors
    where id = p_vendor_id and status = 'ACTIVE'::public.vendor_status and is_verified is true for share;
  if not found then
    raise exception 'Selected vendor must be active and verified.';
  end if;

  -- Verify active campus
  perform 1 from public.campuses
    where id = p_campus_id and is_active is true for share;
  if not found then
    raise exception 'Selected campus is not active or does not exist.';
  end if;

  -- Verify active vendor_campus association
  perform 1 from public.vendor_campuses
    where vendor_id = p_vendor_id and campus_id = p_campus_id and is_active is true for share;
  if not found then
    raise exception 'Vendor is not actively operating at the selected campus.';
  end if;

  -- Verify active category
  perform 1 from public.categories
    where id = p_category_id and is_active is true and parent_id is null for share;
  if not found then
    raise exception 'Selected category is not active or does not exist.';
  end if;

  -- Verify subcategory belongs to category
  if p_subcategory_id is not null then
    perform 1 from public.categories
      where id = p_subcategory_id and parent_id = p_category_id and is_active is true for share;
    if not found then
      raise exception 'Selected subcategory must be an active child of the chosen category.';
    end if;
  end if;

  -- Duplicate name check within (vendor_id, campus_id)
  if exists (
    select 1 from public.products
    where vendor_id = p_vendor_id and campus_id = p_campus_id
      and lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) = lower(v_name)
  ) then
    raise exception 'A product with this name already exists for this vendor at this campus.';
  end if;

  -- Server-side slug generation with suffix collision resolution
  v_base_slug := lower(btrim(
    regexp_replace(
      regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'),
      '^-+|-+$', '', 'g')
  ));
  if v_base_slug is null or length(v_base_slug) = 0 then
    v_base_slug := 'product';
  end if;
  v_slug := v_base_slug;
  while exists (
    select 1 from public.products
    where vendor_id = p_vendor_id and campus_id = p_campus_id and slug = v_slug
  ) loop
    v_suffix_idx := v_suffix_idx + 1;
    v_slug := v_base_slug || '-' || v_suffix_idx::text;
  end loop;

  -- Insert product
  insert into public.products (
    vendor_id, campus_id, category_id, subcategory_id,
    name, slug, description,
    price_kobo, original_price_kobo, image_url,
    is_popular, is_in_stock, stock_quantity,
    rating, review_count
  ) values (
    p_vendor_id, p_campus_id, p_category_id, p_subcategory_id,
    v_name, v_slug, v_desc,
    p_price_kobo, p_original_price_kobo, v_img,
    false, case when p_stock_quantity = 0 then false else p_is_in_stock end, p_stock_quantity,
    0, 0
  )
  returning * into v_product;

  return jsonb_build_object(
    'id',                  v_product.id,
    'vendor_id',           v_product.vendor_id,
    'campus_id',           v_product.campus_id,
    'category_id',         v_product.category_id,
    'subcategory_id',      v_product.subcategory_id,
    'name',                v_product.name,
    'slug',                v_product.slug,
    'description',         v_product.description,
    'price_kobo',          v_product.price_kobo,
    'original_price_kobo', v_product.original_price_kobo,
    'image_url',           v_product.image_url,
    'is_popular',          v_product.is_popular,
    'is_in_stock',         v_product.is_in_stock,
    'stock_quantity',      v_product.stock_quantity,
    'created_at',          v_product.created_at,
    'updated_at',          v_product.updated_at
  );
exception when unique_violation then
  raise exception 'Product name or slug already exists for this vendor at this campus. Refresh and retry.';
end;
$$;

-- ============================================================
-- FUNCTION: admin_update_product
-- Applies a JSONB patch to an existing product.
-- Key presence in patch = intent to set/clear that field.
-- Key absence = retain existing value (true NULL-safe patch).
-- vendor_id, campus_id and id are immutable; slug changes only with normalized name.
-- ============================================================
create or replace function public.admin_update_product(p_product_id uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_product public.products%rowtype;
  v_before public.products%rowtype;
  v_key text;
  v_value jsonb;
  v_base_slug text;
  v_suffix_idx integer := 1;
begin
  if v_actor is null or public.is_admin() is not true then
    raise exception 'Admin authorization required.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A valid patch object is required.';
  end if;
  for v_key, v_value in select * from jsonb_each(p_patch) loop
    if v_key not in ('name','description','category_id','subcategory_id','price_kobo',
      'original_price_kobo','image_url','is_in_stock','stock_quantity') then
      raise exception 'Unknown or immutable product field: %', v_key;
    end if;
    if v_value = 'null'::jsonb then
      if v_key in ('name','category_id','price_kobo','is_in_stock') then
        raise exception 'Field % cannot be cleared.', v_key;
      end if;
    elsif v_key in ('price_kobo','original_price_kobo','stock_quantity') then
      if jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[0-9]+$' then
        raise exception 'Field % must be a non-negative integer.', v_key;
      end if;
    elsif v_key = 'is_in_stock' then
      if jsonb_typeof(v_value) <> 'boolean' then raise exception 'In-stock must be boolean.'; end if;
    elsif jsonb_typeof(v_value) <> 'string' then
      raise exception 'Field % must be text.', v_key;
    end if;
  end loop;
  perform pg_advisory_xact_lock(429003);
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.'; end if;
  v_before := v_product;
  perform 1 from public.vendors where id = v_product.vendor_id
    and status = 'ACTIVE'::public.vendor_status and is_verified is true for share;
  if not found then raise exception 'Selected vendor must be active and verified.'; end if;
  perform 1 from public.campuses where id = v_product.campus_id and is_active is true for share;
  if not found then raise exception 'Selected campus must be active.'; end if;
  perform 1 from public.vendor_campuses where vendor_id = v_product.vendor_id
    and campus_id = v_product.campus_id and is_active is true for share;
  if not found then raise exception 'Vendor-campus association must be active.'; end if;

  -- jsonb_populate_record preserves absent keys and clears explicit JSON nulls.
  -- The allowlist and type checks above must precede this operation.
  v_product := jsonb_populate_record(v_product, p_patch);
  if p_patch ? 'name' then
    v_product.name := nullif(btrim(regexp_replace(v_product.name, '[[:space:]]+', ' ', 'g')), '');
    if v_product.name is null or length(v_product.name) > 255 then
      raise exception 'Product name must be between 1 and 255 characters.';
    end if;
    if exists(select 1 from public.products where vendor_id = v_product.vendor_id
      and campus_id = v_product.campus_id and id <> v_product.id
      and lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) = lower(v_product.name)) then
      raise exception 'A product with this name already exists for this vendor at this campus.';
    end if;
  end if;
  if p_patch ? 'description' then
    v_product.description := nullif(btrim(regexp_replace(v_product.description, '[[:space:]]+', ' ', 'g')), '');
    if length(v_product.description) > 2000 then raise exception 'Description must be 2000 characters or fewer.'; end if;
  end if;
  if p_patch ? 'image_url' then
    v_product.image_url := public._admin_product_image_url(v_product.image_url);
  end if;
  if p_patch ? 'category_id' or p_patch ? 'subcategory_id' then
    perform 1 from public.categories where id = v_product.category_id and is_active is true and parent_id is null for share;
    if not found then raise exception 'Selected category must be an active root category.'; end if;
    if v_product.subcategory_id is not null then
      perform 1 from public.categories where id = v_product.subcategory_id
        and parent_id = v_product.category_id and is_active is true for share;
      if not found then raise exception 'Selected subcategory must be an active child of the chosen category.'; end if;
    end if;
  end if;
  -- Validate the final row on EVERY update, including metadata-only and no-op.
  if v_product.price_kobo is null or v_product.price_kobo <= 0 or v_product.price_kobo > 999999999 then
    raise exception 'Invalid selling price: expected 1 to 999999999 kobo.';
  end if;
  if v_product.original_price_kobo is not null and
     (v_product.original_price_kobo < v_product.price_kobo or v_product.original_price_kobo > 999999999) then
    raise exception 'Original price must be at least selling price and at most 999999999 kobo.';
  end if;
  if p_patch ? 'stock_quantity' or p_patch ? 'is_in_stock' then
    -- Zero forces out-of-stock only as part of an explicit stock edit.
    if v_product.stock_quantity = 0 then v_product.is_in_stock := false; end if;
  end if;
  if v_product.stock_quantity < 0 or v_product.stock_quantity > 1000000 then
    raise exception 'Invalid stock quantity: expected NULL or 0 to 1000000.';
  end if;
  if v_product.is_in_stock is null or (v_product.stock_quantity = 0 and v_product.is_in_stock) then
    raise exception 'Invalid stock state: zero quantity must be out of stock. Explicitly update stock to correct it.';
  end if;
  if v_product.name is distinct from v_before.name then
    v_base_slug := trim(both '-' from lower(regexp_replace(v_product.name, '[^a-zA-Z0-9]+', '-', 'g')));
    if v_base_slug = '' then v_base_slug := 'product'; end if;
    v_product.slug := v_base_slug;
    while exists(select 1 from public.products where vendor_id = v_product.vendor_id
      and campus_id = v_product.campus_id and slug = v_product.slug and id <> v_product.id) loop
      v_suffix_idx := v_suffix_idx + 1;
      v_product.slug := v_base_slug || '-' || v_suffix_idx::text;
    end loop;
  end if;
  if v_product is not distinct from v_before then return to_jsonb(v_before); end if;
  update public.products set name=v_product.name, slug=v_product.slug,
    description=v_product.description, category_id=v_product.category_id,
    subcategory_id=v_product.subcategory_id, price_kobo=v_product.price_kobo,
    original_price_kobo=v_product.original_price_kobo, image_url=v_product.image_url,
    is_in_stock=v_product.is_in_stock, stock_quantity=v_product.stock_quantity, updated_at=now()
    where id=v_product.id returning * into v_product;
  return to_jsonb(v_product);
exception when unique_violation then
  raise exception 'Product name or slug already exists for this vendor at this campus. Refresh and retry.';
end;
$$;

-- Revoke from public/anon
revoke all on function public.admin_create_product(uuid, uuid, uuid, text, bigint, text, uuid, bigint, text, boolean, integer) from public, anon;
revoke all on function public.admin_update_product(uuid, jsonb) from public, anon;

-- Grant to authenticated + service_role
grant execute on function public.admin_create_product(uuid, uuid, uuid, text, bigint, text, uuid, bigint, text, boolean, integer) to authenticated, service_role;
grant execute on function public.admin_update_product(uuid, jsonb) to authenticated, service_role;
