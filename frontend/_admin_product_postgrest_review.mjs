// Actual PostgREST transport, isolated native PostgreSQL only. No production env.
import { spawn } from 'node:child_process';
import { writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PostgrestClient } from '@supabase/postgrest-js';
import { adminCreateProduct, adminUpdateProduct } from './js/admin-products.js';
const dir=fileURLToPath(new URL('./.vercel/phase4e3-review/',import.meta.url));
const db=new pg.Client({host:'127.0.0.1',port:55439,user:'clx_review',database:'postgres'});
const secret=randomBytes(32).toString('hex');
const admin='00000000-0000-4000-8000-000000000001';
const token=sub=>{
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const body=Buffer.from(JSON.stringify({role:'authenticated',sub,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
    return header+'.'+body+'.'+createHmac('sha256',secret).update(header+'.'+body).digest('base64url');
};
let server,passed=0;
async function test(name,fn){await fn();passed++;console.log('POSTGREST PASS: '+name);}
try{
    await db.connect();
    await db.query(`create role clx_review_authenticator login noinherit;
        grant anon,authenticated to clx_review_authenticator;
        create or replace function auth.uid() returns uuid language sql as $$
          select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
        $$;`);
    const config=join(dir,'postgrest.conf');
    writeFileSync(config,`db-uri = "postgres://clx_review_authenticator@127.0.0.1:55439/postgres"
db-schemas = "public"
db-anon-role = "anon"
server-host = "127.0.0.1"
server-port = 55440
jwt-secret = "${secret}"
`);
    function findExe(path){for(const e of readdirSync(path,{withFileTypes:true})){if(e.name==='postgrest.exe')return join(path,e.name);if(e.isDirectory()){const v=findExe(join(path,e.name));if(v)return v;}}}
    server=spawn(findExe(join(dir,'postgrest')),[config],{windowsHide:true,env:{...process.env,PATH:'C:\\Program Files\\PostgreSQL\\18\\bin;'+process.env.PATH},stdio:['ignore','pipe','pipe']});
    let logs='';server.stderr.on('data',x=>logs+=x);server.stdout.on('data',x=>logs+=x);
    let ready=false;
    for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:55440/');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    if(!ready){writeFileSync(join(dir,'postgrest-startup.log'),logs);throw new Error('Isolated PostgREST did not start; see local startup log.');}
    const client=new PostgrestClient('http://127.0.0.1:55440',{headers:{Authorization:'Bearer '+token(admin)}});
    const ids=(await db.query("select v.id as vendor,c.id as campus,k.id as category from vendors v join vendor_campuses vc on vc.vendor_id=v.id join campuses c on c.id=vc.campus_id cross join categories k where k.slug='root' limit 1")).rows[0];
    let product;
    await test('browser create named UUIDs, bigint, optional nulls and boolean',async()=>{
        const r=await adminCreateProduct({vendor_id:ids.vendor,campus_id:ids.campus,category_id:ids.category,name:'PostgREST Review '+Date.now(),price_kobo:999999999,is_in_stock:false},client);
        assert.equal(r.success,true,r.error);product=r.product;assert.equal(product.price_kobo,999999999);assert.equal(product.description,null);assert.equal(product.is_in_stock,false);assert.equal(product.vendor_id,ids.vendor);
    });
    await test('browser JSONB patch carries integers, text and boolean',async()=>{
        const r=await adminUpdateProduct(product.id,{price_kobo:125050,description:'Preserve',original_price_kobo:200000,image_url:'https://example.invalid/a',stock_quantity:5,is_in_stock:true},client);
        assert(r.success,r.error);assert.equal(r.product.price_kobo,125050);assert.equal(r.product.is_in_stock,true);
    });
    await test('absent nullable keys survive transport unchanged',async()=>{
        const r=await adminUpdateProduct(product.id,{name:'PostgREST Renamed'},client);assert(r.success,r.error);
        for(const [k,v] of Object.entries({description:'Preserve',original_price_kobo:200000,image_url:'https://example.invalid/a',stock_quantity:5}))assert.equal(r.product[k],v);
    });
    await test('explicit JSON null clears every nullable field',async()=>{
        const patch={description:null,image_url:null,original_price_kobo:null,stock_quantity:null};
        const r=await adminUpdateProduct(product.id,patch,client);assert(r.success,r.error);for(const k of Object.keys(patch))assert.equal(r.product[k],null);
    });
    await test('repaired create accepts valid active subcategory',async()=>{
        const child=(await db.query("select id from categories where parent_id=$1 and is_active limit 1",[ids.category])).rows[0].id;
        const r=await adminCreateProduct({vendor_id:ids.vendor,campus_id:ids.campus,category_id:ids.category,subcategory_id:child,name:'PostgREST Child',price_kobo:100},client);
        assert(r.success,r.error);assert.equal(r.product.subcategory_id,child);
    });
    await test('HTTP create rejects mismatched subcategory',async()=>{
        const child=(await db.query('select id from categories where parent_id=$1 limit 1',[ids.category])).rows[0].id;
        const other=(await db.query("select id from categories where parent_id is null and id<>$1 limit 1",[ids.category])).rows[0].id;
        const r=await adminCreateProduct({vendor_id:ids.vendor,campus_id:ids.campus,category_id:other,subcategory_id:child,name:'Mismatched child',price_kobo:100},client);
        assert.equal(r.success,false);
    });
    await test('metadata-only HTTP update rejects invalid legacy stock unchanged',async()=>{
        await db.query('update products set stock_quantity=0,is_in_stock=true where id=$1',[product.id]);
        const before=(await db.query('select * from products where id=$1',[product.id])).rows[0];
        try{
            assert.equal((await adminUpdateProduct(product.id,{description:'must fail'},client)).success,false);
            assert.deepEqual((await db.query('select * from products where id=$1',[product.id])).rows[0],before);
        }finally{await db.query('update products set stock_quantity=null,is_in_stock=true where id=$1',[product.id]);}
    });
    await test('repaired create/update reject hostname-less URLs',async()=>{
        for(const image_url of ['https://:80/a','https://user@/a']){
            const r=await adminCreateProduct({vendor_id:ids.vendor,campus_id:ids.campus,category_id:ids.category,name:'Bad image',price_kobo:100,image_url},client);
            assert.equal(r.success,false);assert.equal((await adminUpdateProduct(product.id,{image_url},client)).success,false);
        }
    });
    await test('metadata-only HTTP update rejects invalid legacy price',async()=>{
        await db.query('update products set price_kobo=0 where id=$1',[product.id]);
        try{assert.equal((await adminUpdateProduct(product.id,{description:'must fail'},client)).success,false);}
        finally{await db.query('update products set price_kobo=125050 where id=$1',[product.id]);}
    });
    await test('metadata-only HTTP update preserves valid price',async()=>{
        const r=await adminUpdateProduct(product.id,{description:'valid metadata'},client);assert(r.success,r.error);assert.equal(r.product.price_kobo,125050);
    });
    await test('unknown/protected patch keys rejected over HTTP',async()=>{
        for(const patch of [{vendor_id:ids.vendor},{campus_id:ids.campus},{unknown:1}])assert.equal((await adminUpdateProduct(product.id,patch,client)).success,false);
    });
    await test('anon and non-admin RPC denied over HTTP',async()=>{
        for(const c of [new PostgrestClient('http://127.0.0.1:55440'),new PostgrestClient('http://127.0.0.1:55440',{headers:{Authorization:'Bearer '+token('00000000-0000-4000-8000-000000000099')}})])assert.equal((await adminUpdateProduct(product.id,{},c)).success,false);
    });
    await test('anon/authenticated direct HTTP writes denied; SELECT works',async()=>{
        for(const c of [client,new PostgrestClient('http://127.0.0.1:55440')]){
            assert((await c.from('products').insert({name:'Forbidden'})).error);
            assert((await c.from('products').update({name:'Forbidden'}).eq('id',product.id)).error);
            assert((await c.from('products').delete().eq('id',product.id)).error);
            const r=await c.from('products').select('id').eq('id',product.id);assert.equal(r.error,null);assert.equal(r.data.length,1);
        }
    });
    console.log(`${passed}/${passed} actual PostgREST contract tests passed.`);
}catch(e){console.error('POSTGREST REVIEW FAILED: '+e.message);process.exitCode=1;}
finally{server?.kill();await db.end();}
