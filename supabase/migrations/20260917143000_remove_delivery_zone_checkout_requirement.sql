-- UNIMAID MVP uses a landmark plus an exact location, not delivery zones.
-- Existing delivery-zone reference data and RLS policies remain unchanged.
begin;

alter table public.customer_orders drop constraint customer_orders_check;
alter table public.customer_orders add constraint customer_orders_fulfillment_details_check check (
  (fulfillment_type = 'DELIVERY' and length(trim(coalesce(delivery_location, ''))) > 0)
  or (fulfillment_type = 'PICKUP' and delivery_fee_kobo = 0)
);

do $body$
declare v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  where p.oid = 'public.create_customer_order(jsonb,uuid,text,text,text,text,text,uuid,text,text)'::regprocedure;

  -- Keep the previously reviewed server-side item, price, stock and RLS-safe
  -- order-creation logic intact; only remove the obsolete zone requirement.
  v_definition := replace(v_definition,
    'if length(trim(coalesce(p_delivery_location, ''''))) = 0 or p_delivery_zone_id is null then return jsonb_build_object(''success'', false, ''code'', ''DELIVERY_ZONE_REQUIRED'', ''message'', ''An active delivery zone and exact location are required for delivery.''); end if;',
    'if length(trim(coalesce(p_delivery_location, ''''))) = 0 then return jsonb_build_object(''success'', false, ''code'', ''DELIVERY_LOCATION_REQUIRED'', ''message'', ''Enter the exact delivery location.''); end if;');
  v_definition := replace(v_definition,
    'if not exists (select 1 from public.delivery_zones dz where dz.id = p_delivery_zone_id and dz.campus_id = p_campus_id and dz.is_active) then return jsonb_build_object(''success'', false, ''code'', ''INVALID_DELIVERY_ZONE'', ''message'', ''The selected delivery zone is unavailable.''); end if;',
    '');
  v_definition := replace(v_definition,
    'case when p_fulfillment_type=''DELIVERY'' then p_delivery_zone_id end,case when p_fulfillment_type=''DELIVERY'' then p_nearest_landmark end',
    'null,case when p_fulfillment_type=''DELIVERY'' then p_nearest_landmark end');
  execute v_definition;
end;
$body$;

commit;
