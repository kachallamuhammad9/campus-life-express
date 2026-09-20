// Disposable localhost PostgreSQL only. Credentials remain under ignored ../.qa/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = dirname(fileURLToPath(import.meta.url));
const password = readFileSync(join(root, '..', '.qa', 'postgres-phase4f', 'owner-password.txt'), 'utf8').trim();
const config = { host: '127.0.0.1', port: 55440, database: 'clx_phase4f_validation', user: 'clx_phase4f_owner', password };
const db = new pg.Client(config);
const admin = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`PASS: ${name}`); };
const one = async (text, values = []) => (await db.query(text, values)).rows[0];
const uid = (id) => db.query("select set_config('test.uid',$1,false)", [id]);
const rejects = async (fn) => assert.rejects(fn);

await db.connect();
try {
  await db.query('insert into auth.users(id) values($1),($2) on conflict do nothing', [admin, other]);
  await db.query("insert into profiles(id,email,full_name) values($1,'admin@qa.invalid','QA Admin'),($2,'user@qa.invalid','QA User') on conflict do nothing", [admin, other]);
  await db.query("insert into user_roles(user_id,role) values($1,'ADMIN') on conflict do nothing", [admin]);
  const campus = (await one('select id from campuses where is_active order by slug limit 1')).id;
  const otherCampus = (await one("insert into campuses(slug,name,short_name,is_active) values('phase4f-qa','Phase 4F QA','P4F',true) on conflict (slug) do update set is_active=true returning id")).id;
  const category = (await one('select id from categories where is_active order by slug limit 1')).id;
  const vendor = (await one("insert into vendors(name,slug,category_id,location,status,is_verified) values('QA Vendor','qa-vendor',$1,'QA','ACTIVE',true) on conflict (slug) do update set status='ACTIVE',is_verified=true returning id", [category])).id;
  await db.query('insert into vendor_campuses(vendor_id,campus_id) values($1,$2) on conflict do nothing', [vendor, campus]);
  await uid(admin);
  const createRider = (name, phone, campusId = campus, active = true, available = true) => one('select admin_create_rider($1,$2,$3,$4,$5) rider', [name, phone, campusId, active, available]).then((r) => r.rider);
  const rider = await createRider('  QA   Rider  ', '08012345678');
  await test('rider create normalizes phone and name', async () => {
    assert.equal(rider.name, 'QA Rider');
    assert.equal((await one('select phone from riders where id=$1', [rider.id])).phone, '+2348012345678');
  });
  await test('rider create rejects anon, non-admin, bad phone, duplicate, and inactive campus', async () => {
    await uid(''); await rejects(() => createRider('Anon', '08012345679'));
    await uid(other); await rejects(() => createRider('User', '08012345679'));
    await uid(admin); await rejects(() => createRider('Bad', '123')); await rejects(() => createRider('Duplicate', '2348012345678'));
    await db.query('update campuses set is_active=false where id=$1', [otherCampus]); await rejects(() => createRider('Inactive', '08012345679', otherCampus)); await db.query('update campuses set is_active=true where id=$1', [otherCampus]);
  });
  await test('rider update supports flags but rejects immutable and unknown fields', async () => {
    const updated = (await one("select admin_update_rider($1,$2::jsonb) rider", [rider.id, JSON.stringify({ is_active: false, is_available: false })])).rider;
    assert.equal(updated.is_active, false); assert.equal(updated.is_available, false);
    await rejects(() => one("select admin_update_rider($1,$2::jsonb)", [rider.id, JSON.stringify({ campus_id: otherCampus })]));
    await db.query('update riders set is_active=true,is_available=true where id=$1', [rider.id]);
  });
  const makeOrder = async (kind, status = 'READY_FOR_DISPATCH', paid = true, childReady = true) => {
    const token = `tracking-token-${Math.random().toString(36).slice(2).padEnd(32, 'x')}`;
    const order = (await one(`insert into customer_orders(order_number,customer_user_id,customer_name,customer_phone,campus_id,fulfillment_type,delivery_zone_id,delivery_location,subtotal_kobo,delivery_fee_kobo,service_fee_kobo,total_kobo,status,tracking_token_hash)
      values('CLX-2026-'||lpad((floor(random()*9000)+1000)::text,4,'0'),$1,'QA Customer','08000000000',$2,$3,case when $3='DELIVERY' then (select id from delivery_zones where campus_id=$2 and is_active limit 1) end,case when $3='DELIVERY' then 'QA destination' end,100,case when $3='DELIVERY' then 50 else 0 end,0,case when $3='DELIVERY' then 150 else 100 end,$4,crypt($5,gen_salt('bf'))) returning id,order_number`, [other, campus, kind, status, token])).id;
    await db.query("insert into orders(vendor_id,campus_id,delivery_address,phone_number,type,subtotal_kobo,total_kobo,payment_method,payment_status,status,customer_order_id,vendor_group_number) values($1,$2,'QA','08000000000','FOOD',100,100,'BANK_TRANSFER','PAID',$3,$4,1)", [vendor, campus, childReady ? 'READY' : 'PENDING', order]);
    await db.query("insert into customer_order_payments(customer_order_id,payment_method,amount_kobo,status) values($1,'BANK_TRANSFER',$2,$3)", [order, kind === 'DELIVERY' ? 150 : 100, paid ? 'PAID' : 'PENDING']);
    await db.query("insert into customer_order_status_history(customer_order_id,status) values($1,'ORDER_RECEIVED')", [order]);
    if (kind === 'DELIVERY') await db.query("insert into delivery_requests(requester_user_id,campus_id,customer_order_id,task_type,pickup_location,dropoff_location,status) values($1,$2,$3,'DELIVERY','QA pickup','QA destination','REQUESTED')", [other, campus, order]);
    return order;
  };
  const delivery = await makeOrder('DELIVERY');
  await test('assignment validates mode, payment, child readiness, status, campus, active and availability', async () => {
    const pickup = await makeOrder('PICKUP', 'READY_FOR_PICKUP'); await rejects(() => one('select admin_assign_delivery_rider($1,$2)', [pickup, rider.id]));
    const unpaid = await makeOrder('DELIVERY', 'READY_FOR_DISPATCH', false); await rejects(() => one('select admin_assign_delivery_rider($1,$2)', [unpaid, rider.id]));
    const unready = await makeOrder('DELIVERY', 'READY_FOR_DISPATCH', true, false); await rejects(() => one('select admin_assign_delivery_rider($1,$2)', [unready, rider.id]));
    const wrongStatus = await makeOrder('DELIVERY', 'PREPARING'); await rejects(() => one('select admin_assign_delivery_rider($1,$2)', [wrongStatus, rider.id]));
    const otherRider = await createRider('Other Campus', '08012345679', otherCampus); await rejects(() => one('select admin_assign_delivery_rider($1,$2)', [delivery, otherRider.id]));
    await db.query('update riders set is_active=false where id=$1', [rider.id]); await rejects(() => one('select admin_assign_delivery_rider($1,$2)', [delivery, rider.id])); await db.query('update riders set is_active=true where id=$1', [rider.id]);
  });
  await test('assignment updates delivery, parent, availability and history', async () => {
    const result = (await one('select admin_assign_delivery_rider($1,$2) result', [delivery, rider.id])).result;
    assert.equal(result.status, 'RIDER_ASSIGNED');
    assert.deepEqual(await one('select status,rider_id from delivery_requests where customer_order_id=$1', [delivery]), { status: 'ACCEPTED', rider_id: rider.id });
    assert.equal((await one('select status from customer_orders where id=$1', [delivery])).status, 'RIDER_ASSIGNED'); assert.equal((await one('select is_available from riders where id=$1', [rider.id])).is_available, false);
    assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='RIDER_ASSIGNED'", [delivery])).n, 1);
  });
  await test('delivery progression maps parent state and does not duplicate in-transit history', async () => {
    await one("select admin_advance_delivery_request($1,'PICKED_UP')", [delivery]); assert.equal((await one('select status from customer_orders where id=$1',[delivery])).status,'OUT_FOR_DELIVERY');
    await one("select admin_advance_delivery_request($1,'IN_TRANSIT')", [delivery]); assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='OUT_FOR_DELIVERY'",[delivery])).n,1);
    await one("select admin_advance_delivery_request($1,'DELIVERED')", [delivery]); assert.equal((await one('select status from customer_orders where id=$1',[delivery])).status,'DELIVERED');
    await rejects(() => one("select admin_advance_delivery_request($1,'PICKED_UP')", [delivery]));
  });
  await test('delivery completion appends once and restores rider availability', async () => {
    await one('select admin_complete_delivery_order($1)', [delivery]); assert.equal((await one('select status from customer_orders where id=$1',[delivery])).status,'COMPLETED'); assert.equal((await one('select is_available from riders where id=$1',[rider.id])).is_available,true);
    assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='COMPLETED'",[delivery])).n,1); await rejects(() => one('select admin_complete_delivery_order($1)',[delivery]));
  });
  await test('pickup completion requires paid ready pickup and appends once', async () => {
    const pickup = await makeOrder('PICKUP','READY_FOR_PICKUP'); await one('select admin_complete_pickup_order($1)',[pickup]); assert.equal((await one('select status from customer_orders where id=$1',[pickup])).status,'COMPLETED'); await rejects(() => one('select admin_complete_pickup_order($1)',[pickup]));
  });
  await test('tracking exposes ordered safe history and delivery rider name only', async () => {
    const token = 'phase4f-valid-tracking-token-000000';
    await db.query("update customer_orders set tracking_token_hash=crypt($2,gen_salt('bf')) where id=$1", [delivery, token]);
    const tracked = (await one("select get_customer_order_tracking(order_number, $2) tracked from customer_orders where id=$1",[delivery, token])).tracked;
    assert.equal(tracked.success, true); assert.equal(tracked.fulfillment_type, 'DELIVERY'); assert.equal(tracked.status, 'COMPLETED'); assert.equal(tracked.delivery_status, 'DELIVERED'); assert.equal(tracked.rider_name, 'QA Rider');
    const history = tracked.history.map((entry) => entry.status); assert.deepEqual(history, ['ORDER_RECEIVED', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']);
    const text = JSON.stringify(tracked); assert(!/rider_id|rider_user_id|tracking_token_hash|actor_user_id|phone/.test(text));
  });
  await test('non-admin and anon direct writes are denied by RLS/grants', async () => {
    for (const role of ['anon','authenticated']) for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) assert.equal((await one("select has_table_privilege($1,'public.riders',$2) allowed",[role,privilege])).allowed,false);
    await db.query('set role authenticated'); await uid(other); await rejects(() => db.query("insert into riders(name,phone,campus_id) values('No','+2348012345670',$1)",[campus])); await rejects(() => db.query("update delivery_requests set rider_id=$1 where customer_order_id=$2",[rider.id,delivery])); await db.query('reset role'); await uid(admin);
  });
  await test('no rider delete RPC or auth user was created', async () => {
    assert.equal((await one("select count(*)::int n from pg_proc where proname='admin_delete_rider'")).n,0);
    assert.equal((await one('select count(*)::int n from auth.users')).n,2);
  });
  const race = async (firstText, firstValues, secondText, secondValues) => {
    const first = new pg.Client(config), second = new pg.Client(config);
    await first.connect(); await second.connect();
    try {
      await first.query('begin'); await second.query('begin');
      await first.query("select set_config('test.uid',$1,false)", [admin]); await second.query("select set_config('test.uid',$1,false)", [admin]);
      const firstResult = await first.query(firstText, firstValues);
      let settled = false;
      const secondResult = second.query(secondText, secondValues).then((result) => ({ ok: true, result }), (error) => ({ ok: false, error })).finally(() => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 120)); assert.equal(settled, false, 'second transaction must wait on the first lock');
      await first.query('commit'); const outcome = await secondResult; if (outcome.ok) await second.query('commit'); else await second.query('rollback');
      return { firstResult, outcome };
    } finally { await first.end(); await second.end(); }
  };
  await test('concurrency: two riders cannot both claim the same order', async () => {
    const order = await makeOrder('DELIVERY'); const secondRider = await createRider('Second Rider', '08012345670');
    const result = await race('select admin_assign_delivery_rider($1,$2)', [order, rider.id], 'select admin_assign_delivery_rider($1,$2)', [order, secondRider.id]);
    assert.equal(result.outcome.ok, false); assert.equal((await one('select count(*)::int n from delivery_requests where customer_order_id=$1 and rider_id is not null',[order])).n,1);
  });
  await test('concurrency: one rider cannot be assigned to two orders', async () => {
    await db.query('update riders set is_available=true where id=$1',[rider.id]); const firstOrder = await makeOrder('DELIVERY'); const secondOrder = await makeOrder('DELIVERY');
    const result = await race('select admin_assign_delivery_rider($1,$2)', [firstOrder, rider.id], 'select admin_assign_delivery_rider($1,$2)', [secondOrder, rider.id]);
    assert.equal(result.outcome.ok, false); assert.equal((await one('select count(*)::int n from delivery_requests where customer_order_id in ($1,$2) and rider_id=$3',[firstOrder,secondOrder,rider.id])).n,1);
  });
  await test('concurrency: delivery advance and completion do not duplicate history', async () => {
    const order = await makeOrder('DELIVERY'); const advancingRider = await createRider('Advance Rider', '08012345671'); await one('select admin_assign_delivery_rider($1,$2)',[order,advancingRider.id]);
    const advance = await race("select admin_advance_delivery_request($1,'PICKED_UP')", [order], "select admin_advance_delivery_request($1,'PICKED_UP')", [order]);
    assert.equal(advance.outcome.ok, true); assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='OUT_FOR_DELIVERY'",[order])).n,1);
    await one("select admin_advance_delivery_request($1,'IN_TRANSIT')",[order]); await one("select admin_advance_delivery_request($1,'DELIVERED')",[order]);
    const complete = await race('select admin_complete_delivery_order($1)',[order],'select admin_complete_delivery_order($1)',[order]);
    assert.equal(complete.outcome.ok, false); assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='COMPLETED'",[order])).n,1);
  });
  console.log(`RUNTIME TESTS: ${passed}/${passed} PASS`);
} finally { await db.end(); }