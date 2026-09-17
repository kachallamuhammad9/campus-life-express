// _admin_product_management_tests.mjs
// Local-only. No HTTP, Supabase session, or production connection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from './.vercel/phase4e2-sql-tools/node_modules/@electric-sql/pglite/dist/index.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql  = read('supabase/migrations/0029_admin_product_management.sql');
const source = read('frontend/js/admin-products.js');
const html = read('frontend/admin.html');
const ui = await import('./js/admin-products.js');

let passed = 0;
async function test(name, fn) { await fn(); console.log('PASS: ' + name); passed++; }

// ── Migration integrity ─────────────────────────────────────────────────────

await test('older migrations remain byte-identical', () => {
    for (const [file, hash] of [
        ['0026_vendor_applications.sql',             'e1a40bf919fd4b30889863329d738cf1d5097f80301f21e0d74caacaaad45749'],
        ['0027_allow_unowned_vendors.sql',            'b80ea628feaf2831b956dcf661a4302af2ec0fceb5d01eb0a9b369fed327b8f3'],
        ['0028_admin_vendor_application_review.sql',  '3e9e5c02431e938e69fc441f19a575bd37ca1b535a0d11ef84367b5a9d68e486'],
    ]) {
        assert.equal(createHash('sha256').update(read('supabase/migrations/' + file)).digest('hex'), hash);
    }
});

await test('0029 revokes direct writes from anon and authenticated', () => {
    assert.match(sql, /revoke insert, update, delete on public\.products from public, anon, authenticated/i);
});

await test('0029 drops owner write policies', () => {
    assert.match(sql, /drop policy if exists products_owner_insert/);
    assert.match(sql, /drop policy if exists products_owner_update/);
    assert.match(sql, /drop policy if exists products_owner_delete/);
});

await test('0029 preserves products_select_public (not dropped)', () => {
    assert.doesNotMatch(sql, /drop policy.*products_select_public/i);
});

// ── Security and no-mutation contract ──────────────────────────────────────

await test('0029 contains no DML against auth/user_roles/services/profiles/vendor_applications', () => {
    assert.doesNotMatch(sql,
        /(?:insert into|update|delete from)\s+(?:public\.)?(?:auth\.users|user_roles|profiles|services|vendor_applications)\b/i);
});

await test('0029 contains no protected application number or vendor ID literals', () => {
    assert.ok(!sql.includes('CLX-VA-2026-0001'));
    assert.ok(!sql.includes('CLX-VA-2026-0002'));
    assert.ok(!sql.includes('CLX-VA-2026-0003'));
    assert.ok(!sql.includes('04d707b1-c1d9-45d8-a12d-032c374fd5a5'));
});

await test('admin-products.js: no direct table mutations (no .insert/.update/.delete/.upsert)', () => {
    assert.doesNotMatch(source, /\.(?:insert|update|delete|upsert)\s*\(/);
});

await test('admin-products.js: no service_role key usage', () => {
    assert.doesNotMatch(source, /service_role/);
});

await test('admin-products.js: uses RPC for create and update', () => {
    assert.match(source, /client\.rpc\('admin_create_product'/);
    assert.match(source, /client\.rpc\('admin_update_product'/);
});

// ── nairaToKobo conversion ─────────────────────────────────────────────────

await test('nairaToKobo: integer naira', () => {
    assert.equal(ui.nairaToKobo('2500'), 250000);
    assert.equal(ui.nairaToKobo('0'), null);
    assert.equal(ui.nairaToKobo('1'), 100);
});

await test('nairaToKobo: decimal naira (float-safe)', () => {
    assert.equal(ui.nairaToKobo('2500.50'), 250050);
    assert.equal(ui.nairaToKobo('0.01'), 1);
    assert.equal(ui.nairaToKobo('9999999.99'), 999999999);
});

await test('nairaToKobo: rejects invalid inputs', () => {
    for (const bad of ['', '-', 'abc', '1.2.3', '-500', '1000000000.00', '1250.555', '1,2', '1e3', '99999999999999999']) {
        assert.equal(ui.nairaToKobo(bad), null, `should reject: ${bad}`);
    }
});

await test('nairaToKobo: single-decimal normalizes correctly', () => {
    assert.equal(ui.nairaToKobo('10.5'), 1050);
    assert.equal(ui.nairaToKobo('10.1'), 1010);
});

await test('koboToNaira: round-trips correctly', () => {
    assert.equal(ui.koboToNaira(250000), '2500.00');
    assert.equal(ui.koboToNaira(50), '0.50');
    assert.equal(ui.koboToNaira(1), '0.01');
    assert.equal(ui.koboToNaira(0), '0.00');
});

await test('koboToNaira: handles null/undefined gracefully', () => {
    assert.equal(ui.koboToNaira(null), '');
    assert.equal(ui.koboToNaira(undefined), '');
});

await test('formatNaira: formats kobo as Nigerian Naira', () => {
    const result = ui.formatNaira(250000);
    assert.ok(result.includes('2,500') || result.includes('2500'), `got: ${result}`);
    assert.equal(ui.formatNaira(null), '—');
});

// ── RPC parameter contract ─────────────────────────────────────────────────

await test('adminCreateProduct: maps parameters correctly to RPC', async () => {
    let captured;
    const fakeClient = { rpc: async (name, params) => { captured = { name, params }; return { data: { id: 'new-uuid', name: 'Test' }, error: null }; } };
    const result = await ui.adminCreateProduct({
        vendor_id: 'v1', campus_id: 'c1', category_id: 'cat1',
        name: 'Test Product', price_kobo: 250000, description: 'A test',
        subcategory_id: null, original_price_kobo: null,
        image_url: null, is_popular: false, is_in_stock: true, stock_quantity: 50,
    }, fakeClient);
    assert.equal(captured.name, 'admin_create_product');
    assert.equal(captured.params.p_vendor_id, 'v1');
    assert.equal(captured.params.p_campus_id, 'c1');
    assert.equal(captured.params.p_name, 'Test Product');
    assert.equal(captured.params.p_price_kobo, 250000);
    assert.equal(captured.params.p_stock_quantity, 50);
    assert.equal(result.success, true);
});

await test('adminUpdateProduct: maps productId and patch to RPC', async () => {
    let captured;
    const fakeClient = { rpc: async (name, params) => { captured = { name, params }; return { data: { id: 'prod-123' }, error: null }; } };
    const patch = { is_in_stock: false };
    const result = await ui.adminUpdateProduct('prod-123', patch, fakeClient);
    assert.equal(captured.name, 'admin_update_product');
    assert.equal(captured.params.p_product_id, 'prod-123');
    assert.deepEqual(captured.params.p_patch, { is_in_stock: false });
    assert.equal(result.success, true);
});

await test('adminCreateProduct: returns failure on RPC error', async () => {
    const badClient = { rpc: async () => ({ data: null, error: { message: 'internal DB secret' } }) };
    const result = await ui.adminCreateProduct({ vendor_id: 'v', campus_id: 'c', category_id: 'cat', name: 'X', price_kobo: 100 }, badClient);
    assert.equal(result.success, false);
    assert.ok(result.error, 'should have error message');
});

await test('adminUpdateProduct: returns failure on missing data response', async () => {
    const badClient = { rpc: async () => ({ data: null, error: null }) };
    const result = await ui.adminUpdateProduct('p1', {}, badClient);
    assert.equal(result.success, false);
});

// ── HTML integration ────────────────────────────────────────────────────────

await test('admin.html imports createAdminProducts', () => {
    assert.match(html, /import \{ createAdminProducts \} from '\.\/js\/admin-products\.js'/);
});

await test('admin.html mounts #admin-products-section container', () => {
    assert.match(html, /id="admin-products-section"/);
});

await test('admin.html calls productsAdmin.init() after authorization', () => {
    assert.match(html, /productsAdmin\.init\(\)/);
});

await test('admin.html calls productsAdmin.reset() on sign-out', () => {
    assert.match(html, /productsAdmin\.reset\(\)/);
});

// ── admin-products.js UI contract ──────────────────────────────────────────

await test('admin-products.js exports nairaToKobo, koboToNaira, formatNaira, adminCreateProduct, adminUpdateProduct, createAdminProducts', () => {
    assert.equal(typeof ui.nairaToKobo, 'function');
    assert.equal(typeof ui.koboToNaira, 'function');
    assert.equal(typeof ui.formatNaira, 'function');
    assert.equal(typeof ui.adminCreateProduct, 'function');
    assert.equal(typeof ui.adminUpdateProduct, 'function');
    assert.equal(typeof ui.createAdminProducts, 'function');
    assert.equal(typeof ui.fetchVendors, 'function');
    assert.equal(typeof ui.fetchCategories, 'function');
    assert.equal(typeof ui.fetchProducts, 'function');
});

await test('admin-products.js: confirmation required before stock toggle', () => {
    assert.match(source, /window\.confirm/);
});

await test('admin-products.js: no optimistic status edits to product row', () => {
    assert.doesNotMatch(source, /product\.is_in_stock\s*=(?!=)/);
    assert.doesNotMatch(source, /product\.name\s*=(?!=)/);
});

await test('admin-products.js: creates reset() and init() on returned object', () => {
    assert.match(source, /return \{ init, reset, editProduct, refresh: loadProducts \}/);
});

await test('admin-products.js: form validates price before submission', () => {
    assert.match(source, /nairaToKobo\(/);
    assert.match(source, /Enter a valid price/);
});

await test('admin-products.js: busy guard prevents double submission', () => {
    assert.match(source, /if \(busy\) return/);
});

// Execute the actual migration against disposable PostgreSQL, never a remote URL.
const db = new PGlite();
try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`);
    await db.exec(read('supabase/migrations/0001_extensions_and_types.sql').replace('create extension if not exists pgcrypto;', ''));
    for (const file of ['0002_reference_tables.sql','0003_profiles_and_roles.sql','0004_vendors.sql','0005_catalog.sql','0013_security_helper_functions.sql','0027_allow_unowned_vendors.sql']) await db.exec(read('supabase/migrations/'+file));
    const policies = read('supabase/migrations/0015_rls_policies.sql');
    await db.exec('alter table public.products enable row level security;');
    await db.exec(policies.slice(policies.indexOf('DROP POLICY IF EXISTS "products_select_public"'), policies.indexOf('-- 11. PRODUCT IMAGES')));
    await db.exec('grant usage on schema public,auth to anon,authenticated; grant select on all tables in schema public to anon,authenticated; grant insert,update,delete on public.products to authenticated;');
    await test('SQL 0029 compiles', () => db.exec(sql));
    const admin='00000000-0000-4000-8000-000000000001';
    await db.query('insert into auth.users values ($1)',[admin]);
    await db.query("insert into profiles(id,email,full_name) values($1,'admin@example.invalid','Local Admin')",[admin]);
    await db.query("insert into user_roles(user_id,role) values($1,'ADMIN')",[admin]);
    const uid = value => db.query("select set_config('test.uid',$1,false)",[value]);
    await uid(admin);
    const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
    const campus=(await one("insert into campuses(slug,name,short_name) values('local','Local','LOC') returning id")).id;
    const cat=(await one("insert into categories(slug,name) values('root','Root') returning id")).id;
    const cat2=(await one("insert into categories(slug,name) values('other','Other') returning id")).id;
    const sub=(await one("insert into categories(slug,name,parent_id) values('child','Child',$1) returning id",[cat])).id;
    const vendor=(await one("insert into vendors(name,slug,category_id,location,status,is_verified) values('Local','local',$1,'Local','ACTIVE',true) returning id",[cat])).id;
    await db.query('insert into vendor_campuses(vendor_id,campus_id) values($1,$2)',[vendor,campus]);
    let n=0;
    const create = async (p={}) => {
        p={vendor_id:vendor,campus_id:campus,category_id:cat,name:'Product '+(++n),price_kobo:125000,...p};
        return (await one('select admin_create_product($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as p',
            [p.vendor_id,p.campus_id,p.category_id,p.name,p.price_kobo,p.description??null,p.subcategory_id??null,p.original_price_kobo??null,p.image_url??null,p.is_in_stock??true,p.stock_quantity??null])).p;
    };
    const update=async(id,patch)=>(await one('select admin_update_product($1,$2::jsonb) as p',[id,JSON.stringify(patch)])).p;
    const row=async id=>one('select * from products where id=$1',[id]);
    let product;
    await test('SQL valid create and server defaults',async()=>{
        product=await create({name:'  Café\t  &\n Rice!  ',description:' \t\n ',stock_quantity:0});
        assert.equal(product.name,'Café & Rice!'); assert.equal(product.description,null);
        assert.equal(product.is_in_stock,false); assert(product.id); assert(product.slug); assert.equal(product.is_popular,false);
    });
    for(const actor of ['', '00000000-0000-4000-8000-000000000099']) await test(`SQL authorization rejects ${actor ? 'non-admin':'missing actor'}`,async()=>{
        await uid(actor); await assert.rejects(create()); await assert.rejects(update(product.id,{})); await uid(admin);
    });
    for(const [table,field,bad,good] of [['vendors','status', 'SUSPENDED','ACTIVE'],['vendors','is_verified',false,true],['campuses','is_active',false,true],['vendor_campuses','is_active',false,true]]) {
        await test(`SQL create/update reject ${table}.${field} ineligible`,async()=>{
            await db.query(`update ${table} set ${field}=$1`,[bad]);
            await assert.rejects(create()); await assert.rejects(update(product.id,{}));
            await db.query(`update ${table} set ${field}=$1`,[good]);
        });
    }
    for(const [label,patch] of [
        ['null name',{name:null}],['empty name',{name:''}],['spaces name',{name:'   '}],['whitespace name',{name:'\t\n\r '}],
        ['long name',{name:'x'.repeat(256)}],['zero price',{price_kobo:0}],['negative price',{price_kobo:-1}],['excessive price',{price_kobo:1000000000}],
        ['fractional kobo',{price_kobo:1.5}],['original below price',{original_price_kobo:1}],['original excessive',{original_price_kobo:1000000000}],
        ['bad URL',{image_url:'javascript:alert(1)'}],['relative URL',{image_url:'/image.jpg'}],['empty host',{image_url:'https://'}],
        ['long URL',{image_url:'https://x/'+ 'x'.repeat(2048)}],['negative stock',{stock_quantity:-1}],['fractional stock',{stock_quantity:1.5}],
        ['long description',{description:'x'.repeat(2001)}],['child as root',{category_id:sub}],['wrong subcategory',{category_id:cat2,subcategory_id:sub}],
        ['missing category',{category_id:'00000000-0000-4000-8000-000000000099'}],
        ['normalized duplicate',{name:' café \n &  Rice! '}],
    ]) await test('SQL create rejects '+label,()=>assert.rejects(create(patch)));
    await test('SQL original price accepted',async()=>assert.equal((await create({original_price_kobo:125000})).original_price_kobo,125000));
    for (const field of ['vendor_id','campus_id']) await test('SQL missing '+field+' rejected',()=>assert.rejects(create({[field]:'00000000-0000-4000-8000-000000000099'})));
    await test('SQL missing product rejected',()=>assert.rejects(update('00000000-0000-4000-8000-000000000099',{})));
    await test('SQL maximum Unicode name and description accepted',async()=>{
        const result=await create({name:'商'.repeat(255),description:'é'.repeat(2000)});
        assert.equal(result.name,'商'.repeat(255));assert.equal(result.description.length,2000);
    });
    await test('SQL inactive subcategory rejected on create/update',async()=>{
        await db.query('update categories set is_active=false where id=$1',[sub]);
        await assert.rejects(create({subcategory_id:sub}));await assert.rejects(update(product.id,{subcategory_id:sub}));
        await db.query('update categories set is_active=true where id=$1',[sub]);
    });
    await test('SQL blank image becomes null',async()=>assert.equal((await create({image_url:' \t\n '})).image_url,null));
    await test('SQL malformed patch objects rejected',async()=>{
        for(const patch of [null,[],42,'name'])await assert.rejects(update(product.id,patch));
    });
    await test('SQL slug collision suffixes distinct names',async()=>{
        const a=await create({name:'Collision!'}),b=await create({name:'Collision?'});
        assert.equal(a.slug,'collision'); assert.equal(b.slug,'collision-2');
    });
    await test('SQL positive quantity can be manually out of stock',async()=>assert.equal((await create({stock_quantity:4,is_in_stock:false})).is_in_stock,false));
    for(const [label,patch,expected] of [
        ['metadata',{description:'new description',image_url:'https://example.invalid/a.png'},{}],
        ['price',{price_kobo:22200,original_price_kobo:30000},{}],
        ['stock',{stock_quantity:5,is_in_stock:true},{}],
        ['category',{category_id:cat,subcategory_id:sub},{}],
        ['name',{name:'Changed name'}, {slug:'changed-name'}],
        ['clear description',{description:null},{}],['clear image',{image_url:null},{}],
        ['clear original',{original_price_kobo:null},{}],['clear quantity',{stock_quantity:null},{}],
        ['zero quantity',{stock_quantity:0,is_in_stock:true},{is_in_stock:false}],
    ]) await test('SQL update '+label,async()=>{
        const result=await update(product.id,patch);
        for(const [k,v] of Object.entries({...patch,...expected})) assert.equal(result[k],v);
    });
    for(const [label,patch] of [
        ['unknown key',{surprise:true}],['vendor immutable',{vendor_id:vendor}],['campus immutable',{campus_id:campus}],
        ['popularity protected',{is_popular:true}],['rating protected',{rating:5}],['id protected',{id:product.id}],
        ['created_at protected',{created_at:'2026-01-01'}],['review_count protected',{review_count:5}],
        ['duplicate rename',{name:'Collision!'}],['zero price',{price_kobo:0}],['negative price',{price_kobo:-1}],
        ['fractional price',{price_kobo:1.5}],['price string',{price_kobo:'100'}],['null required',{name:null}],
        ['bad category',{category_id:sub}],['retained incompatible subcategory',{category_id:cat2}],
        ['negative stock',{stock_quantity:-1}],['bad boolean',{is_in_stock:'false'}],['bad description type',{description:42}],
        ['original below price',{original_price_kobo:1}],['bad image',{image_url:'data:image/png,xx'}],
    ]) await test('SQL update rejects '+label,async()=>{
        const before=await row(product.id); await assert.rejects(update(product.id,patch)); assert.deepEqual(await row(product.id),before);
    });
    await test('SQL absent keys and idempotence preserve row and timestamp',async()=>{
        const before=await row(product.id); await update(product.id,{}); await update(product.id,{name:before.name});
        assert.deepEqual(await row(product.id),before);
    });
    await test('SQL rename regenerates slug and resolves collision',async()=>assert.equal((await update(product.id,{name:'Collision.'})).slug,'collision-3'));
    await test('SQL category change with explicit subcategory clear succeeds',async()=>assert.equal((await update(product.id,{category_id:cat2,subcategory_id:null})).subcategory_id,null));
    await test('SQL inactive categories rejected',async()=>{
        await db.query('update categories set is_active=false where id=$1',[cat]);
        await assert.rejects(create()); await assert.rejects(update(product.id,{category_id:cat}));
        await update(product.id,{description:'unrelated metadata'});
        await db.query('update categories set is_active=true where id=$1',[cat]);
    });
    for(const action of ['insert','update','delete']) await test('SQL direct '+action+' denied for authenticated admin',async()=>{
        await db.exec('set role authenticated');
        try { await assert.rejects(db.exec({insert:"insert into products(name) values('x')",update:"update products set name='x'",delete:'delete from products'}[action]),/permission denied/); }
        finally { await db.exec('reset role'); }
    });
    await test('SQL anon RPC denied and public SELECT preserved',async()=>{
        await uid(''); await db.exec('set role anon');
        try { await assert.rejects(create(),/permission denied/); await assert.rejects(update(product.id,{}),/permission denied/); assert((await db.query('select * from products')).rows.length>0); }
        finally { await db.exec('reset role'); await uid(admin); }
    });
    await test('SQL authenticated admin RPC grant works',async()=>{
        await db.exec('set role authenticated'); try { assert((await create()).id); } finally { await db.exec('reset role'); }
    });
    await test('SQL service_role has execute but still needs actor',async()=>{
        assert.equal((await one("select has_function_privilege('service_role','admin_update_product(uuid,jsonb)','execute') as ok")).ok,true);
        await uid(''); await assert.rejects(update(product.id,{})); await uid(admin);
    });
    await test('SQL dangerous browser table privileges absent',async()=>{
        for(const role of ['anon','authenticated'])for(const privilege of ['insert','update','delete','truncate','references','trigger'])
            assert.equal((await one('select has_table_privilege($1,\'public.products\',$2) as ok',[role,privilege])).ok,false);
    });
    await test('repair: valid child category create and update succeed',async()=>{
        const p=await create({subcategory_id:sub});assert.equal(p.subcategory_id,sub);
        assert.equal((await update(p.id,{category_id:cat,subcategory_id:sub})).subcategory_id,sub);
        assert.equal((await create({subcategory_id:null})).subcategory_id,null);
    });
    await test('repair: mismatched child fails without weakening root checks',async()=>{
        await assert.rejects(create({category_id:cat2,subcategory_id:sub}));
        await assert.rejects(create({category_id:sub}));
        await assert.rejects(create({subcategory_id:cat}));
    });
    // Constraints are relaxed ONLY inside a rolled-back isolated fixture transaction
    // to reproduce legacy negative values impossible under the current table CHECKs.
    async function legacyReject(values,patch){
        await db.exec('begin');
        try{
            const p=await create({price_kobo:100});
            const constraints=(await db.query("select conname from pg_constraint where conrelid='public.products'::regclass and contype='c' and pg_get_constraintdef(oid) ~ 'price_kobo|stock_quantity'")).rows;
            for(const {conname} of constraints)await db.exec('alter table products drop constraint "'+conname.replaceAll('"','""')+'"');
            const keys=Object.keys(values);
            await db.query('update products set '+keys.map((k,i)=>k+'=$'+(i+1)).join(',')+' where id=$'+(keys.length+1),[...Object.values(values),p.id]);
            const before=await row(p.id);
            await db.exec('savepoint validation');
            await assert.rejects(update(p.id,patch),/price|stock/i);
            await db.exec('rollback to savepoint validation');
            assert.deepEqual(await row(p.id),before);
        }finally{await db.exec('rollback');}
    }
    for(const value of [0,-1,1000000000])for(const [label,patch] of [
        ['description',{description:'metadata'}],['image',{image_url:'https://example.com/a'}],
        ['category',{category_id:cat2}],['name',{name:'Legacy rename'}],['stock',{is_in_stock:false}],['no-op',{}]
    ])await test(`repair: legacy price ${value} rejects ${label} patch`,()=>legacyReject({price_kobo:value},patch));
    for(const value of [99,1000000000])for(const patch of [{description:'metadata'},{}])
        await test(`repair: invalid original ${value} rejects ${Object.keys(patch).length?'metadata':'no-op'}`,()=>legacyReject({original_price_kobo:value},patch));
    for(const values of [{stock_quantity:-1},{stock_quantity:1000001},{stock_quantity:0,is_in_stock:true}])for(const patch of [{description:'metadata'},{}])
        await test('repair: legacy stock '+JSON.stringify(values)+' rejects '+(Object.keys(patch).length?'metadata':'no-op'),()=>legacyReject(values,patch));
    await test('repair: valid metadata update preserves price and original',async()=>{
        const p=await create({price_kobo:100,original_price_kobo:200});
        const r=await update(p.id,{description:'metadata'});assert.equal(r.price_kobo,100);assert.equal(r.original_price_kobo,200);
        assert.equal((await update(p.id,{is_in_stock:false})).price_kobo,100);
        await assert.rejects(update(p.id,{price_kobo:201}));
        assert.equal((await update(p.id,{price_kobo:50})).original_price_kobo,200);
        assert.equal((await update(p.id,{price_kobo:300,original_price_kobo:null})).price_kobo,300);
        assert.equal((await update(p.id,{price_kobo:400,original_price_kobo:500})).original_price_kobo,500);
    });
    for(const url of ['https://:80/a','https://user@/a','https:///a','http:///x','javascript:alert(1)',
        'data:image/png;base64,...','file:///a','/relative/path','example.com/image.jpg',
        'https://user@example.com/a','https://example..com/a','https://-bad.com/a','https://example.com:65536/a',
        'https://example.com:0/a','https://999.1.1.1/a','https://127.1/a','https://127.00.0.1/a','https://[::1]/a',
        'https://example.com\\evil/a','https://example.com/%zz','https://例え.com/a'])await test('repair: both RPCs reject URL '+url,async()=>{
            await assert.rejects(create({image_url:url}),/Image URL/);
            await assert.rejects(update(product.id,{image_url:url}),/Image URL/);
        });
    for(const url of ['https://example.com/image.jpg','http://example.com/a.png',
        'https://cdn.example.com:8443/path/file.webp','https://192.0.2.1/a',
        'HTTPS://Example.COM/a%20b?x=1#image','https://xn--r8jz45g.com/a',null,' \t\n '])await test('repair: both RPCs accept URL '+JSON.stringify(url),async()=>{
            const expected=url?.trim()||null;
            assert.equal((await create({image_url:url})).image_url,expected);
            assert.equal((await update(product.id,{image_url:url})).image_url,expected);
        });
    await test('repair: URL helper inaccessible to all API roles',async()=>{
        for(const role of ['anon','authenticated','service_role'])assert.equal((await one("select has_function_privilege($1,'public._admin_product_image_url(text)','execute') as ok",[role])).ok,false);
    });
} finally { await db.close(); }

console.log(`\n${passed} passed, 0 failed`);
