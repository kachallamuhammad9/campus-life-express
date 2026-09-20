-- Fix the deterministic advisory-lock key conversion in create_customer_order_v2.
-- The historical migration is intentionally left unchanged.
do $$
declare
  fn_oid oid := 'public.create_customer_order_v2(jsonb,uuid,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure;
  fn_def text;
begin
  select pg_get_functiondef(fn_oid) into fn_def;
  if fn_def is null then
    raise exception 'Expected create_customer_order_v2 function is missing';
  end if;
  if position('v_lock_key := ''x'' || substring(encode(digest(p_idempotency_key::text, ''sha256''), ''hex''), 1, 16);' in fn_def) = 0 then
    raise exception 'Expected advisory-lock defect was not found; refusing replacement';
  end if;
  fn_def := replace(
    fn_def,
    'v_lock_key := ''x'' || substring(encode(digest(p_idempotency_key::text, ''sha256''), ''hex''), 1, 16);',
    'v_lock_key := (''x'' || substring(encode(digest(p_idempotency_key::text, ''sha256''), ''hex''), 1, 16))::bit(64)::bigint;'
  );
  execute fn_def;
end $$;
