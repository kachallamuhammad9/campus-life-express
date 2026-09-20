// Disposable localhost PostgreSQL only. Never loads production credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const config={host:'127.0.0.1',port:55440,database:'clx_refund_validation',user:'clx_phase4f_owner',password:readFileSync(new URL('../.qa/postgres-phase4f/owner-password.txt',import.meta.url),'utf8').trim()};
assert.equal(config.host,'127.0.0.1');assert.equal(config.database,'clx_refund_validation');
const db=new pg.Client(config);await db.connect();
const one=async(s,p=[])=>(await db.query(s,p)).rows[0];
let passed=0;const test=async(n,f)=>{await f();passed++;console.log('PASS: '+n)};
const admin=randomUUID(),customer=randomUUID(),stranger=randomUUID();
const uid=id=>db.query("select set_config('test.uid',$1,false)",[id||'']);
const request=(id,reason='Item unavailable')=>one('select admin_request_order_refund($1,$2) r',[id,reason]).then(x=>x.r);
const confirm=(id,returned=true,reference=null)=>one('select admin_confirm_order_refund($1,$2,$3) r',[id,returned,reference]).then(x=>x.r);
const blocked=async(sql,args)=>{let failed=false;try{const result=await one(sql,args);failed=result?.r?.success===false;}catch{failed=true}assert(failed,'operation must reject');};
try{
 await db.query('insert into auth.users(id) values($1),($2),($3)',[admin,customer,stranger]);
 for(const [id,name]of[[admin,'Refund Admin'],[customer,'Refund Customer'],[stranger,'Other Customer']])await db.query('insert into profiles(id,email,full_name) values($1,$2,$3)',[id,id+'@qa.invalid',name]);
 await db.query("insert into user_roles(user_id,role) values($1,'ADMIN')",[admin]);await uid(admin);
 const campus=(await one('select id from campuses where is_active limit 1')).id;
 const vendor=(await one("select id from vendors where status='ACTIVE' limit 1")).id;
 const category=(await one("select id from categories where slug='food' limit 1")).id;
 const product=(await one("insert into products(vendor_id,campus_id,category_id,name,slug,price_kobo) values($1,$2,$3,$4,$4,100) returning id",[vendor,campus,category,'refund-'+randomUUID()])).id;
 const vendor2=(await one("insert into vendors(name,slug,category_id,location,status,is_verified) values($1,$1,$2,'Local','ACTIVE',true) returning id",['refund-vendor-'+randomUUID(),category])).id;
 await db.query('insert into vendor_campuses(vendor_id,campus_id) values($1,$2)',[vendor2,campus]);
 const product2=(await one("insert into products(vendor_id,campus_id,category_id,name,slug,price_kobo) values($1,$2,$3,$4,$4,100) returning id",[vendor2,campus,category,'refund-'+randomUUID()])).id;
 const zone=(await one('select id from delivery_zones where campus_id=$1 and is_active limit 1',[campus])).id;
 const token='refund-local-only-tracking-token-000000000';
 const make=async({paid=true,multi=false,delivery=false}={})=>{
  const total=(multi?200:100)+(delivery?50:0);const id=randomUUID();
  const number=(await one('select public.next_customer_order_number() n')).n;
  await db.query("insert into customer_orders(id,order_number,customer_user_id,customer_name,customer_phone,campus_id,fulfillment_type,delivery_zone_id,delivery_location,subtotal_kobo,delivery_fee_kobo,total_kobo,tracking_token_hash) values($1,$2,$3,'Local Refund Customer','08000000000',$4,$5,$6,$7,$8,$9,$10,extensions.crypt($11,extensions.gen_salt('bf',4)))",[id,number,customer,campus,delivery?'DELIVERY':'PICKUP',delivery?zone:null,delivery?'Local destination':null,multi?200:100,delivery?50:0,total,token]);
  const children=[];for(let i=0;i<(multi?2:1);i++){const child=(await one("insert into orders(vendor_id,campus_id,phone_number,type,subtotal_kobo,total_kobo,payment_method,customer_order_id,vendor_group_number) values($1,$2,'08000000000','FOOD',100,100,'BANK_TRANSFER',$3,$4) returning id",[i?vendor2:vendor,campus,id,i+1])).id;children.push(child);await db.query("insert into order_items(order_id,product_id,quantity,unit_price_kobo,total_price_kobo,product_name_snapshot,vendor_name_snapshot,currency_code) values($1,$2,1,100,100,'Rice','Local Vendor','NGN')",[child,i?product2:product]);}
  await db.query("insert into customer_order_payments(customer_order_id,payment_method,amount_kobo) values($1,'BANK_TRANSFER',$2)",[id,total]);
  if(delivery)await db.query("insert into delivery_requests(requester_user_id,campus_id,customer_order_id,task_type,pickup_location,dropoff_location) values($1,$2,$3,'DELIVERY','Local pickup','Local destination')",[customer,campus,id]);
  if(paid)assert.equal((await one('select verify_customer_order_payment($1) r',[id])).r.success,true);
  return{id,number,children,total};
 };
 const progress=async(o)=>{for(const status of ['CONFIRMED','PREPARING','READY'])for(const id of o.children)assert.equal((await one('select admin_advance_vendor_order($1,$2) r',[id,status])).r.success,true)};
 const unpaid=await make({paid:false});
 await test('unpaid cannot request or confirm refund; ordinary cancellation still works',async()=>{await assert.rejects(()=>request(unpaid.id));await assert.rejects(()=>confirm(unpaid.id));assert.equal((await one("select admin_cancel_customer_order($1,'Payment not received') r",[unpaid.id])).r.status,'CANCELLED');assert.equal((await one('select count(*)::int n from customer_order_refunds where customer_order_id=$1',[unpaid.id])).n,0)});
 const paid=await make({multi:true,delivery:true});
 await test('paid whole-order request stops every child and delivery; amount comes from verified payment',async()=>{assert.equal((await request(paid.id)).amount_kobo,paid.total);assert.deepEqual((await db.query('select distinct status::text status from orders where customer_order_id=$1',[paid.id])).rows,[{status:'CANCELLED'}]);assert.equal((await one('select status from delivery_requests where customer_order_id=$1',[paid.id])).status,'CANCELLED');assert.equal((await one('select status from customer_order_payments where customer_order_id=$1',[paid.id])).status,'PAID');assert.equal((await one('select status from customer_orders where id=$1',[paid.id])).status,'REFUND_PENDING')});
 await test('request retry is idempotent and does not overwrite reason or duplicate history',async()=>{assert.equal((await request(paid.id,'Other')).already_applied,true);assert.equal((await one('select reason from customer_order_refunds where customer_order_id=$1',[paid.id])).reason,'Item unavailable');assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='REFUND_PENDING'",[paid.id])).n,1)});
 const rejectAll=async(o)=>{
  for(const status of ['CONFIRMED','PREPARING','READY'])await blocked('select admin_advance_vendor_order($1,$2) r',[o.children[0],status]);
  await blocked('select admin_assign_delivery_rider($1,$2) r',[o.id,randomUUID()]);
  for(const status of ['PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED'])await blocked('select admin_advance_delivery_request($1,$2) r',[o.id,status]);
  await blocked('select admin_complete_pickup_order($1) r',[o.id]);await blocked('select admin_complete_delivery_order($1) r',[o.id]);
  await blocked('select verify_customer_order_payment($1) r',[o.id]);await blocked("select admin_cancel_customer_order($1,'Other') r",[o.id]);
 };
 await test('refund pending rejects vendor, assignment, delivery, pickup, completion, verification and unpaid cancellation',()=>rejectAll(paid));
 await test('confirmation requires explicit money-returned attestation',()=>assert.rejects(()=>confirm(paid.id,false)));
 await test('confirm refund sets terminal states and writes history exactly once',async()=>{assert.equal((await confirm(paid.id,true,'Local receipt reference')).status,'REFUNDED');assert.equal((await confirm(paid.id)).already_applied,true);assert.equal((await one('select status from customer_order_payments where customer_order_id=$1',[paid.id])).status,'REFUNDED');assert.equal((await one('select status from customer_orders where id=$1',[paid.id])).status,'REFUNDED');assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='REFUNDED'",[paid.id])).n,1);assert.equal((await one('select admin_reference from customer_order_refunds where customer_order_id=$1',[paid.id])).admin_reference,'Local receipt reference')});
 await test('refunded rejects every normal progression and new refund request',async()=>{await rejectAll(paid);await assert.rejects(()=>request(paid.id))});
 await test('database triggers reject direct reopening and history deletion',async()=>{await assert.rejects(()=>db.query("update customer_orders set status='PAYMENT_CONFIRMED' where id=$1",[paid.id]));await assert.rejects(()=>db.query("update orders set status='CONFIRMED' where id=$1",[paid.children[0]]));await assert.rejects(()=>db.query('delete from delivery_requests where customer_order_id=$1',[paid.id]));await assert.rejects(()=>db.query("update customer_order_payments set status='PAID' where customer_order_id=$1",[paid.id]));});
 await test('non-admin and anonymous cannot administer refunds',async()=>{for(const actor of [customer,null]){await uid(actor);await assert.rejects(()=>request(paid.id));await assert.rejects(()=>confirm(paid.id))}await uid(admin)});
 await test('customer safe response and RLS isolate another customer and private admin record',async()=>{
  await uid(customer);const own=(await one('select get_customer_order_refunds($1) r',[[paid.number]])).r;assert.equal(own[0].refund.amount_kobo,paid.total);assert.deepEqual(Object.keys(own[0].refund).sort(),['amount_kobo','confirmed_at','reason','requested_at','status']);
  await db.query('set role authenticated');assert.equal((await one('select count(*)::int n from customer_order_refunds')).n,0);await assert.rejects(()=>db.query("update customer_order_refunds set reason='Other' where customer_order_id=$1",[paid.id]));await db.query('reset role');
  await uid(stranger);assert.deepEqual((await one('select get_customer_order_refunds($1) r',[[paid.number]])).r,[]);
  await db.query('set role authenticated');assert.equal((await one('select count(*)::int n from customer_orders where id=$1',[paid.id])).n,0);await db.query('reset role');await uid(admin);
 });
 await test('token tracking returns safe refund fields; invalid token reveals nothing',async()=>{const r=(await one('select get_customer_order_tracking($1,$2) r',[paid.number,token])).r;assert.equal(r.refund.status,'REFUNDED');assert(!JSON.stringify(r).includes(admin));assert(!JSON.stringify(r).includes('Local receipt'));assert(!JSON.stringify(r).includes(paid.id));assert.equal((await one('select get_customer_order_tracking($1,$2) r',[paid.number,'invalid-token-00000000000000000000000'])).r.success,false)});
 await test('one progressed vendor blocks whole-order exception while parent can still be PAYMENT_CONFIRMED',async()=>{const o=await make({multi:true});await one("select admin_advance_vendor_order($1,'CONFIRMED') r",[o.children[0]]);await one("select admin_advance_vendor_order($1,'PREPARING') r",[o.children[0]]);assert.equal((await one('select status from customer_orders where id=$1',[o.id])).status,'PAYMENT_CONFIRMED');await assert.rejects(()=>request(o.id));assert.equal((await one('select count(*)::int n from customer_order_refunds where customer_order_id=$1',[o.id])).n,0)});
 await test('all confirmed vendors are eligible before preparation',async()=>{const o=await make({multi:true});for(const child of o.children)await one("select admin_advance_vendor_order($1,'CONFIRMED') r",[child]);assert.equal((await request(o.id)).status,'REFUND_PENDING')});
 await test('paid amount mismatch and invalid reason fail without writes',async()=>{const o=await make();await db.query('update customer_order_payments set amount_kobo=101 where customer_order_id=$1',[o.id]);await assert.rejects(()=>request(o.id));await assert.rejects(()=>request(o.id,null));assert.equal((await one('select count(*)::int n from customer_order_refunds where customer_order_id=$1',[o.id])).n,0)});
 await test('successful pickup preserved; completed pickup cannot enter refund workflow',async()=>{const o=await make();await progress(o);assert.equal((await one('select admin_complete_pickup_order($1) r',[o.id])).r.status,'COMPLETED');await assert.rejects(()=>request(o.id))});
 await test('successful delivery preserved; assigned/delivered/completed orders reject exception',async()=>{const o=await make({delivery:true});await progress(o);const rider=(await one("select admin_create_rider('Refund QA Rider',$1,$2,true,true) r",['080'+String(Date.now()).slice(-8),campus])).r;await one('select admin_assign_delivery_rider($1,$2) r',[o.id,rider.id]);await assert.rejects(()=>request(o.id));for(const status of ['PICKED_UP','IN_TRANSIT','DELIVERED'])await one('select admin_advance_delivery_request($1,$2) r',[o.id,status]);await assert.rejects(()=>request(o.id));assert.equal((await one('select admin_complete_delivery_order($1) r',[o.id])).r.status,'COMPLETED');await assert.rejects(()=>request(o.id))});
 await test('concurrent request retries serialize to one refund and one history event',async()=>{const o=await make();const second=new pg.Client(config);await second.connect();try{await second.query("select set_config('test.uid',$1,false)",[admin]);await db.query('begin');await request(o.id);let done=false;const pending=second.query("select admin_request_order_refund($1,'Other') r",[o.id]).then(x=>{done=true;return x.rows[0].r});await new Promise(r=>setTimeout(r,100));assert.equal(done,false);await db.query('commit');assert.equal((await pending).already_applied,true);assert.equal((await one('select count(*)::int n from customer_order_refunds where customer_order_id=$1',[o.id])).n,1)}finally{await second.end()}});
 await test('concurrent confirmations serialize without duplicate financial/history effects',async()=>{const o=await make();await request(o.id);const second=new pg.Client(config);await second.connect();try{await second.query("select set_config('test.uid',$1,false)",[admin]);await db.query('begin');await confirm(o.id);const pending=second.query('select admin_confirm_order_refund($1,true,null) r',[o.id]);await db.query('commit');assert.equal((await pending).rows[0].r.already_applied,true);assert.equal((await one("select count(*)::int n from customer_order_status_history where customer_order_id=$1 and status='REFUNDED'",[o.id])).n,1)}finally{await second.end()}});
 console.log(`MANUAL REFUND DATABASE: ${passed}/${passed} PASS`);
}finally{await db.query('rollback').catch(()=>{});await db.end()}
