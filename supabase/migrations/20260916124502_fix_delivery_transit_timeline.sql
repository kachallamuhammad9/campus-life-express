-- Delivery status semantics correction. Existing historical records are preserved.
begin;

create or replace function public.admin_advance_delivery_request(p_customer_order_id uuid,p_target_status public.delivery_status) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); c jsonb; next_parent public.customer_order_status;
begin
 if v_actor is null or public.is_admin() is not true then raise exception 'Admin authorization required.'; end if;
 c:=public._admin_delivery_context(p_customer_order_id);
 if c->>'fulfillment_type'<>'DELIVERY' or c->>'payment_status'<>'PAID' or c->>'rider_id' is null then raise exception 'Delivery is not eligible.'; end if;
 if c->>'delivery_status'=p_target_status::text then return jsonb_build_object('success',true,'already_applied',true,'status',c->>'parent_status'); end if;
 if not ((c->>'delivery_status'='ACCEPTED' and p_target_status='PICKED_UP') or (c->>'delivery_status'='PICKED_UP' and p_target_status='IN_TRANSIT') or (c->>'delivery_status'='IN_TRANSIT' and p_target_status='DELIVERED')) then raise exception 'Invalid delivery transition.'; end if;
 if (p_target_status='PICKED_UP' and c->>'parent_status'<>'RIDER_ASSIGNED') or (p_target_status='IN_TRANSIT' and c->>'parent_status'<>'RIDER_ASSIGNED') or (p_target_status='DELIVERED' and c->>'parent_status'<>'OUT_FOR_DELIVERY') then raise exception 'Parent order is not eligible.'; end if;
 update public.delivery_requests set status=p_target_status,picked_up_at=case when p_target_status='PICKED_UP' then now() else picked_up_at end,delivered_at=case when p_target_status='DELIVERED' then now() else delivered_at end where id=(c->>'delivery_id')::uuid;
 if p_target_status='PICKED_UP' then
   return jsonb_build_object('success',true,'already_applied',false,'status','RIDER_ASSIGNED');
 elsif p_target_status='IN_TRANSIT' then next_parent:='OUT_FOR_DELIVERY'; else next_parent:='DELIVERED'; end if;
 update public.customer_orders set status=next_parent where id=p_customer_order_id;
 insert into public.customer_order_status_history(customer_order_id,status,actor_user_id) values(p_customer_order_id,next_parent,v_actor);
 return jsonb_build_object('success',true,'already_applied',false,'status',next_parent);
end $$;

revoke all on function public.admin_advance_delivery_request(uuid,public.delivery_status) from public,anon;
grant execute on function public.admin_advance_delivery_request(uuid,public.delivery_status) to authenticated,service_role;
commit;
