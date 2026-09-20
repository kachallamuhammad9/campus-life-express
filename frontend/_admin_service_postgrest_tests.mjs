// Real HTTP RPC contract against disposable loopback PostgreSQL only.
import {spawn} from 'node:child_process';
import {readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomBytes,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:55449,user:'clx_service_test',database:'service_suite'});
const dir=fileURLToPath(new URL('./.vercel/phase4e4/',import.meta.url));
const secret=randomBytes(32).toString('hex');
const jwt=sub=>{const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role:'authenticated',sub,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');return a+'.'+b+'.'+createHmac('sha256',secret).update(a+'.'+b).digest('base64url');};
let server,passed=0;
async function test(name,fn){await fn();passed++;console.log('POSTGREST PASS: '+name);}
try{
 await db.connect();await db.query("do $$begin if not exists(select 1 from pg_roles where rolname='clx_service_authenticator') then create role clx_service_authenticator login noinherit; end if; end$$; grant anon,authenticated to clx_service_authenticator;");
 const conf=join(dir,'postgrest.conf');writeFileSync(conf,`db-uri = "postgres://clx_service_authenticator@127.0.0.1:55449/service_suite"\ndb-schemas = "public"\ndb-anon-role = "anon"\nserver-host = "127.0.0.1"\nserver-port = 55450\njwt-secret = "${secret}"\n`);
 function find(path){for(const e of readdirSync(path,{withFileTypes:true})){if(e.name==='postgrest.exe')return join(path,e.name);if(e.isDirectory()){const v=find(join(path,e.name));if(v)return v;}}}
 server=spawn(find(fileURLToPath(new URL('./.vercel/phase4e3-review/postgrest/',import.meta.url))),[conf],{windowsHide:true,env:{...process.env,PATH:'C:\\Program Files\\PostgreSQL\\18\\bin;'+process.env.PATH},stdio:'ignore'});
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:55450/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'Local PostgREST unavailable');
 const admin=jwt('00000000-0000-4000-8000-000000000001'),other=jwt('00000000-0000-4000-8000-000000000002');
 const call=async(path,body,token=admin,method='POST')=>{const r=await fetch('http://127.0.0.1:55450/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)};};
 const ids=(await db.query("select v.id vendor,c.id campus,k.id category,(select id from categories where slug='services-printing') child from vendors v cross join campuses c cross join categories k where v.slug='test' and c.slug='local' and k.slug='services'")).rows[0];
 const payload={p_vendor_id:ids.vendor,p_campus_id:ids.campus,p_category_id:ids.category,p_name:'HTTP Service',p_subcategory_id:ids.child,p_price_type:'FIXED',p_starting_price_kobo:999999999,p_description:null,p_image_url:null,p_turnaround_time:null,p_requires_file_upload:false,p_requires_appointment:true,p_is_active:false};
 let s;const update=p=>call('rpc/admin_update_service',{p_service_id:s.id,p_patch:p});
 await test('create exact named args UUID bigint null boolean',async()=>{const r=await call('rpc/admin_create_service',payload);assert(r.ok,JSON.stringify(r.data));s=r.data;assert.equal(s.starting_price_kobo,999999999);assert.equal(s.subcategory_id,ids.child);assert.equal(s.provider_user_id,null);assert.equal(s.is_active,false);});
 await test('JSON patch correct integer enum and booleans',async()=>{const r=await update({starting_price_kobo:125050,price_type:'QUOTE',requires_appointment:false,description:'Keep',image_url:'https://example.com/a',turnaround_time:'Day'});assert(r.ok);assert.equal(r.data.starting_price_kobo,125050);assert.equal(r.data.requires_appointment,false);});
 await test('absent nullable keys preserved',async()=>{const r=await update({name:'HTTP Rename'});assert(r.ok);assert.equal(r.data.description,'Keep');assert.equal(r.data.image_url,'https://example.com/a');assert.equal(r.data.turnaround_time,'Day');assert.equal(r.data.starting_price_kobo,125050);assert.equal(r.data.subcategory_id,ids.child);});
 await test('explicit null fields cleared',async()=>{const keys=['description','image_url','turnaround_time','starting_price_kobo','subcategory_id'];const r=await update(Object.fromEntries(keys.map(k=>[k,null])));assert(r.ok);for(const k of keys)assert.equal(r.data[k],null);});
 await test('fractional bigint create rejected without insertion',async()=>{const r=await call('rpc/admin_create_service',{...payload,p_name:'Fraction',p_starting_price_kobo:1.2});assert(!r.ok);});
 await test('patch numeric string and fractional price rejected',async()=>{for(const p of ['100',1.1])assert(!(await update({starting_price_kobo:p})).ok);});
 await test('malformed hostless URL rejected with validation error',async()=>{const r=await update({image_url:'https://:80/a'});assert(!r.ok);assert(!JSON.stringify(r.data).includes('postgres://'));});
 await test('unknown/immutable fields rejected',async()=>{for(const k of ['vendor_id','campus_id','provider_user_id','unknown'])assert(!(await update({[k]:null})).ok);});
 await test('anon and nonadmin deny both RPCs',async()=>{for(const token of ['',other]){assert(!(await call('rpc/admin_create_service',payload,token)).ok);assert(!(await call('rpc/admin_update_service',{p_service_id:s.id,p_patch:{}},token)).ok);}});
 await test('direct INSERT UPDATE DELETE denied',async()=>{for(const token of ['',other,admin])for(const method of ['POST','PATCH','DELETE'])assert(!(await call('services?id=eq.'+s.id,method==='DELETE'?undefined:{name:'Denied'},token,method)).ok);});
 await test('anon and ordinary signed-in public quarantine enforced',async()=>{for(const token of ['',other])assert.deepEqual((await call('services?id=eq.'+s.id+'&select=id',undefined,token,'GET')).data,[]);});
 await test('valid publish visible then quarantine hides',async()=>{assert((await update({is_active:true})).ok);assert.equal((await call('services?id=eq.'+s.id+'&select=id',undefined,'','GET')).data.length,1);assert((await update({is_active:false})).ok);assert.deepEqual((await call('services?id=eq.'+s.id+'&select=id',undefined,'','GET')).data,[]);});
 await test('metadata-only invalid-price fixture rejects but quarantine works',async()=>{await db.query('update services set starting_price_kobo=0 where id=$1',[s.id]);assert(!(await update({description:'No'})).ok);assert((await update({is_active:false})).ok);await db.query('update services set starting_price_kobo=null where id=$1',[s.id]);});
 await test('private helper unavailable through API',async()=>assert(!(await call('rpc/_admin_service_image_url',{p_url:null})).ok));
 console.log(`SERVICE POSTGREST: ${passed}/${passed} PASS`);
}finally{server?.kill();await db.end();}
