// Disposable databases only. No production credentials or environment files loaded.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from './.vercel/phase4e2-sql-tools/node_modules/@electric-sql/pglite/dist/index.js';
import pg from 'pg';
import {serviceNairaToKobo,servicePatch} from './js/admin-services.js';
const native=process.argv.includes('--native');
const config={host:'127.0.0.1',port:55449,user:'clx_service_test',database:'service_suite'};
const client=native?new pg.Client(config):null;
if(client)await client.connect();
const db=client?{query:(...a)=>client.query(...a),exec:s=>client.query(s),close:()=>client.end()}:new PGlite();
const read=f=>readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8');
let passed=0;
async function test(name,fn){await fn();console.log('PASS: '+name);passed++;}
const one=async(s,a=[])=>(await db.query(s,a)).rows[0];
const admin='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const uid=id=>db.query("select set_config('test.uid',$1,false)",[id]);
try{
 await db.exec(`do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
 end$$;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('test.uid',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
 for(const f of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>/^000[1-9]_|^0010_|^0013_|^0014_|^0015_/.test(f)).sort())await db.exec(read(f).replace('create extension if not exists pgcrypto;',''));
 await db.exec(`create table public.vendor_applications(id uuid primary key default gen_random_uuid(),legacy_key text unique,business_name text not null,slug text unique not null,category_slug text not null,campus_slug text not null,location text not null,contact_name text not null,phone_number text,email text,description text,status text not null default 'PENDING',rejection_reason text,reviewed_by uuid references profiles(id),vendor_id uuid references vendors(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());`);
 for(const f of ['0026_vendor_applications.sql','0027_allow_unowned_vendors.sql','0028_admin_vendor_application_review.sql','0029_admin_product_management.sql'])await db.exec(read(f));
 await db.exec('grant usage on schema public,auth to anon,authenticated; grant select on all tables in schema public to anon,authenticated; grant all on public.services to anon,authenticated;');
 for(const id of [admin,other]){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles(id,email,full_name) values($1,'local@example.invalid','Test User')",[id]);}
 await db.query("insert into user_roles(user_id,role) values($1,'ADMIN')",[admin]);await uid(admin);
 const campus=(await one("insert into campuses(slug,name,short_name) values('local','Local','LOC') returning id")).id;
 const root=(await one("insert into categories(slug,name) values('services','Services') returning id")).id;
 const food=(await one("insert into categories(slug,name) values('food','Food') returning id")).id;
 await db.exec("insert into categories(slug,name) values('shopping','Shopping'),('delivery','Delivery')");
 const child=(await one("insert into categories(slug,name,parent_id) values('services-printing','Printing',$1) returning id",[root])).id;
 const wrong=(await one("insert into categories(slug,name,parent_id) values('food-child','Food child',$1) returning id",[food])).id;
 const vendor=(await one("insert into vendors(name,slug,category_id,location,status,is_verified) values('Test Vendor','test',$1,'Test','ACTIVE',true) returning id",[root])).id;
 const owned=(await one("insert into vendors(name,slug,owner_user_id,category_id,location,status,is_verified) values('Owned','owned',$1,$2,'Test','ACTIVE',true) returning id",[other,root])).id;
 for(const v of [vendor,owned])await db.query('insert into vendor_campuses(vendor_id,campus_id) values($1,$2)',[v,campus]);
 const legacy=(await one("insert into services(provider_user_id,vendor_id,campus_id,category_id,name,slug,starting_price_kobo,price_type) values($1,$2,$3,$4,'Legacy','legacy',100,'FIXED') returning id",[other,owned,campus,food])).id;
 await db.query("insert into service_requests(service_id,requester_user_id,provider_user_id,vendor_id,campus_id,delivery_type,description) select $1,$2,$2,$3,$4,'PICKUP','Historical request '||i from generate_series(1,6)i",[legacy,other,owned,campus]);
 const snapshot=async()=>one("select (select md5(string_agg(to_jsonb(t)::text,'' order by id)) from service_requests t) requests,(select md5(string_agg(to_jsonb(t)::text,'' order by id)) from services t) services");
 const before=await snapshot();
 const productContract=async()=>one("select jsonb_agg(jsonb_build_object('name',proname,'body',prosrc,'acl',proacl::text,'config',proconfig) order by proname) functions from pg_proc where proname in ('admin_create_product','admin_update_product','_admin_product_image_url')");
 const productBefore=await productContract();
 await test('0030 compiles and mutates zero existing service/request rows',async()=>{await db.exec(read('0030_admin_service_management.sql'));assert.deepEqual(await snapshot(),before);});
 await test('0030 preserves product RPC bodies and security',async()=>assert.deepEqual(await productContract(),productBefore));
 let seq=0;
 const create=async(p={})=>{p={vendor_id:vendor,campus_id:campus,category_id:root,name:'Service '+(++seq),...p};const args=Object.entries(p);return (await one('select admin_create_service('+args.map(([k],i)=>'p_'+k+'=> $'+(i+1)).join(',')+') s',args.map(([,v])=>v))).s;};
 const update=async(id,patch)=>(await one('select admin_update_service($1,$2::jsonb) s',[id,JSON.stringify(patch)])).s;
 const row=async id=>(await one('select to_jsonb(s) s from services s where id=$1',[id])).s;
 let service;
 await test('ownerless creation defaults inactive, derives NULL, normalizes Unicode',async()=>{service=await create({name:'  Café\t &\n Print! ',subcategory_id:child,description:' \t',turnaround_time:' \n'});assert.equal(service.name,'Café & Print!');assert.equal(service.provider_user_id,null);assert.equal(service.is_active,false);assert.equal(service.description,null);assert.equal(service.turnaround_time,null);assert.equal(service.price_type,'QUOTE');assert.equal(service.starting_price_kobo,null);assert(service.slug);});
 await test('owned vendor derives owner, never admin',async()=>assert.equal((await create({vendor_id:owned})).provider_user_id,other));
 for(const id of ['',other])await test('create/update deny non-admin '+(id||'anon'),async()=>{await uid(id);await assert.rejects(create());await assert.rejects(update(service.id,{}));await uid(admin);});
 for(const [table,field,bad,good,where] of [['vendors','status','SUSPENDED','ACTIVE','id'],['vendors','is_verified',false,true,'id'],['campuses','is_active',false,true,'id'],['vendor_campuses','is_active',false,true,'vendor_id']])await test('reject ineligible '+table+'.'+field,async()=>{const id=table==='campuses'?campus:vendor;await db.query(`update ${table} set ${field}=$1 where ${where}=$2`,[bad,id]);await assert.rejects(create());await assert.rejects(update(service.id,{is_active:true}));await db.query(`update ${table} set ${field}=$1 where ${where}=$2`,[good,id]);});
 for(const [label,p] of Object.entries({wrong_root:{category_id:food},nonroot:{category_id:child},wrong_child:{subcategory_id:wrong},blank:{name:'\t\n '},null_name:{name:null},long_name:{name:'x'.repeat(256)},long_description:{description:'x'.repeat(2001)},long_turnaround:{turnaround_time:'x'.repeat(256)},bad_type:{price_type:'HOURLY'},fixed_missing:{price_type:'FIXED'},starting_missing:{price_type:'STARTING_FROM'},zero:{starting_price_kobo:0},negative:{starting_price_kobo:-1},overflow:{starting_price_kobo:1000000000},fraction:{starting_price_kobo:1.5},null_flag:{is_active:null},missing_vendor:{vendor_id:null},missing_campus:{campus_id:null}}))await test('create rejects '+label,()=>assert.rejects(create(p)));
 for(const type of ['FIXED','STARTING_FROM','QUOTE'])await test('valid '+type+' price',async()=>assert.equal((await create({price_type:type,starting_price_kobo:125050})).starting_price_kobo,125050));
 for(const url of ['https://:80/a','https://user@/a','https:///a','javascript:x','data:x','/relative','example.com/a','https://example.com/%zz'])await test('URL rejects '+url,async()=>{await assert.rejects(create({image_url:url}));await assert.rejects(update(service.id,{image_url:url}));});
 for(const url of ['https://example.com/a','http://example.com/a','https://cdn.example.com:8443/a','http://127.0.0.1/a'])await test('URL accepts '+url,async()=>assert.equal((await create({image_url:url})).image_url,url));
 await test('inactive child/root rejected',async()=>{for(const id of [child,root]){await db.query('update categories set is_active=false where id=$1',[id]);await assert.rejects(create({subcategory_id:child}));await db.query('update categories set is_active=true where id=$1',[id]);}});
 await test('missing association rejected',async()=>{const c=(await one("insert into campuses(slug,name,short_name) values('missing','Missing','MIS') returning id")).id;await assert.rejects(create({campus_id:c}));});
 await test('duplicate normalized name rejected',()=>assert.rejects(create({name:' café   & Print! '})));
 await test('base slug collision resolved without overwrite',async()=>{const a=await create({name:'Slug/A'}),b=await create({name:'Slug A'});assert.notEqual(a.slug,b.slug);});
 for(const key of ['id','vendor_id','campus_id','provider_user_id','legacy_key','created_at','updated_at','slug','unknown'])await test('patch rejects '+key,()=>assert.rejects(update(service.id,{[key]:null})));
 await test('JSON types reject numeric strings and nonbooleans',async()=>{for(const p of [{starting_price_kobo:'125'},{starting_price_kobo:1.2},{is_active:null},{requires_appointment:'false'},{name:3},{price_type:null}])await assert.rejects(update(service.id,p));});
 await test('nullable absent keys preserved and explicit NULL clears',async()=>{
  const values={description:'Keep',image_url:'https://example.com/a',turnaround_time:'One day',starting_price_kobo:200,subcategory_id:child};await update(service.id,values);
  const result=await update(service.id,{requires_appointment:true});for(const [k,v] of Object.entries(values))assert.equal(result[k],v);
  const cleared=await update(service.id,Object.fromEntries(Object.keys(values).map(k=>[k,null])));for(const k of Object.keys(values))assert.equal(cleared[k],null);
 });
 await test('final price/type interactions checked',async()=>{await assert.rejects(update(service.id,{price_type:'FIXED'}));await update(service.id,{price_type:'FIXED',starting_price_kobo:100});await assert.rejects(update(service.id,{starting_price_kobo:null}));await update(service.id,{price_type:'QUOTE',starting_price_kobo:null});});
 await test('legacy ordinary update fails, isolated quarantine works only',async()=>{await assert.rejects(update(legacy,{description:'No'}));await assert.rejects(update(legacy,{is_active:false,description:'No'}));const before=await row(legacy);const after=await update(legacy,{is_active:false});for(const k of Object.keys(before).filter(k=>!['is_active','updated_at'].includes(k)))assert.deepEqual(after[k],before[k]);await assert.rejects(update(legacy,{is_active:true}));});
 await test('explicit correction of legacy category accepted',async()=>{await update(legacy,{category_id:root,subcategory_id:child});assert.equal((await row(legacy)).category_id,root);});
 await test('metadata edit rejects zero-price legacy state',async()=>{await db.query('update services set starting_price_kobo=0 where id=$1',[service.id]);await assert.rejects(update(service.id,{description:'No'}));await update(service.id,{starting_price_kobo:100});});
 await test('rename collision rejected and idempotency preserved',async()=>{const x=await create();await assert.rejects(update(x.id,{name:service.name}));const b=await row(x.id);await update(x.id,{});assert.deepEqual(await row(x.id),b);});
 await test('all browser write privileges absent and no delete RPC',async()=>{for(const role of ['anon','authenticated'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await one('select has_table_privilege($1,\'public.services\',$2) allowed',[role,privilege])).allowed,false);assert.equal((await one("select count(*)::int n from pg_proc where proname='admin_delete_service'")).n,0);});
 await test('helpers private, RPC gates correctly granted',async()=>{for(const role of ['anon','authenticated','service_role'])assert.equal((await one("select has_function_privilege($1,'public._admin_service_image_url(text)','EXECUTE') allowed",[role])).allowed,false);assert.equal((await one("select has_function_privilege('anon','public.admin_update_service(uuid,jsonb)','EXECUTE') allowed")).allowed,false);assert.equal((await one("select has_function_privilege('authenticated','public.admin_update_service(uuid,jsonb)','EXECUTE') allowed")).allowed,true);});
 const visible=async(actor,role)=>{await uid(actor);await db.exec('set role '+role);try{return(await one('select count(*)::int n from services where id=$1',[service.id])).n;}finally{await db.exec('reset role');await uid(admin);}};
 await test('public inactive hidden; valid publication visible',async()=>{assert.equal(await visible('','anon'),0);await update(service.id,{is_active:true});assert.equal(await visible('','anon'),1);assert.equal(await visible(other,'authenticated'),1);});
 for(const [table,key,id] of [['campuses','id',campus],['vendor_campuses','vendor_id',vendor],['categories','id',root],['categories','id',child]])await test('public hides inactive '+table+' '+id,async()=>{await update(service.id,{subcategory_id:child});await db.query(`update ${table} set is_active=false where ${key}=$1`,[id]);assert.equal(await visible('','anon'),0);assert.equal(await visible(other,'authenticated'),0);await db.query(`update ${table} set is_active=true where ${key}=$1`,[id]);});
 await test('public hides unverified vendor',async()=>{await db.query('update vendors set is_verified=false where id=$1',[vendor]);assert.equal(await visible('','anon'),0);await db.query('update vendors set is_verified=true where id=$1',[vendor]);});
 let appSeq=0;
 for(const category of ['services','food','shopping','delivery'])await test('approval '+category,async()=>{const n=++appSeq;const app=(await one("insert into vendor_applications(business_name,slug,category_slug,campus_slug,campus_id,location,contact_name,phone_number,whatsapp_number,application_number) values($1,$1,$2,'local',$3,'Local','Local Contact',$4,$4,$1) returning id",['APP'+n,category,campus,'080'+String(n).padStart(8,'0')])).id;
  if(category==='delivery')await assert.rejects(db.query('select admin_approve_vendor_application($1)',[app]));else{await db.query('select admin_approve_vendor_application($1)',[app]);await db.query('select admin_approve_vendor_application($1)',[app]);assert.equal((await one('select v.owner_user_id from vendors v join vendor_applications a on a.vendor_id=v.id where a.id=$1',[app])).owner_user_id,null);}
 });
 await test('historical requests remain byte-equivalent, providerless requests reject',async()=>{assert.equal((await snapshot()).requests,before.requests);await assert.rejects(db.query("insert into service_requests(service_id,requester_user_id,provider_user_id,vendor_id,campus_id,delivery_type,description) values($1,$2,$2,$3,$4,'PICKUP','No')",[service.id,other,vendor,campus]));});
 await test('request trigger accepts valid existing context without historical rewrite',async()=>{await db.exec('begin');try{await db.exec('update service_requests set description=description');}finally{await db.exec('rollback');}assert.equal((await snapshot()).requests,before.requests);});
 await test('actual product create/update still work after 0030',async()=>{const p=(await one("select admin_create_product($1,$2,$3,'Product regression',100,p_is_in_stock=>false) p",[vendor,campus,food])).p;const changed=(await one('select admin_update_product($1,$2) p',[p.id,JSON.stringify({price_kobo:200})])).p;assert.equal(changed.price_kobo,200);assert.equal(changed.is_in_stock,false);});
 await test('ordinary customer cannot see owner inspection rows, owner can inspect',async()=>{await update(legacy,{is_active:false});await uid(other);await db.exec('set role authenticated');assert.equal((await one('select count(*)::int n from services where id=$1',[legacy])).n,1);await db.exec('reset role');await uid('');await db.exec('set role anon');assert.equal((await one('select count(*)::int n from services where id=$1',[legacy])).n,0);await db.exec('reset role');await uid(admin);});
 for(const [input,expected] of [['1',100],['1.5',150],['1250.50',125050],['0.01',1],['0',null],['-1',null],['1.001',null],['NaN',null],['Infinity',null],['1,000',null],['1e3',null]])await test('UI price '+input,()=>assert.equal(serviceNairaToKobo(input),expected));
 await test('UI patch distinguishes explicit null and unchanged',()=>assert.deepEqual(servicePatch({description:'old',name:'x'},{description:null,name:'x'}),{description:null}));
 if(native){
  async function concurrent(a,b){const first=new pg.Client(config),second=new pg.Client(config);await first.connect();await second.connect();try{await first.query("select set_config('test.uid',$1,false)",[admin]);await second.query("select set_config('test.uid',$1,false)",[admin]);await first.query('begin');const r=await a(first);let done=false;const wait=b(second).then(r=>({ok:true,r}),e=>({ok:false,code:e.code})).finally(()=>done=true);await new Promise(r=>setTimeout(r,150));assert.equal(done,false);await first.query('commit');return[r,await wait];}finally{await first.end();await second.end();}}
  const make=(name)=>c=>c.query('select admin_create_service($1,$2,$3,$4) s',[vendor,campus,root,name]);
  await test('CONCURRENCY same normalized name one winner',async()=>{const [,b]=await concurrent(make('Concurrent Same'),make('Concurrent   Same'));assert.equal(b.ok,false);});
  await test('CONCURRENCY colliding slugs both unique',async()=>{const [a,b]=await concurrent(make('Concurrent/Slug'),make('Concurrent Slug'));assert(b.ok);assert.notEqual(a.rows[0].s.slug,b.r.rows[0].s.slug);});
  await test('CONCURRENCY conflicting rename loser unchanged',async()=>{const a=await create(),b=await create();const rename=id=>c=>c.query('select admin_update_service($1,$2) s',[id,JSON.stringify({name:'Concurrent Rename'})]);const [,r]=await concurrent(rename(a.id),rename(b.id));assert.equal(r.ok,false);assert.equal((await row(b.id)).name,b.name);});
 }
 console.log(`SERVICE TESTS: ${passed}/${passed} PASS (${native?'native PostgreSQL':'PGlite'})`);
}finally{await db.close();}
