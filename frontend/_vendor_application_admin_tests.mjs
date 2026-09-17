// Local-only tests. No HTTP, credentials, Supabase session or production connection.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrations/0028_admin_vendor_application_review.sql');
const source = read('frontend/js/vendor-applications-admin.js');
const html = read('frontend/admin.html');
const ui = await import('./js/vendor-applications-admin.js');
let passed = 0;
async function test(name, fn) { await fn(); console.log('PASS: ' + name); passed++; }
await test('old migrations remain byte-identical', () => {
    for (const [file, hash] of [
        ['0026_vendor_applications.sql', 'e1a40bf919fd4b30889863329d738cf1d5097f80301f21e0d74caacaaad45749'],
        ['0027_allow_unowned_vendors.sql', 'b80ea628feaf2831b956dcf661a4302af2ec0fceb5d01eb0a9b369fed327b8f3']
    ]) {
        assert.equal(createHash('sha256').update(read('supabase/migrations/' + file)).digest('hex'), hash);
    }
});
for (const name of ['admin_review_vendor_application', 'admin_approve_vendor_application']) {
    await test(name + ' security, actor, lock and ACL contract', () => {
        const body = sql.split('create or replace function public.' + name)[1].split('$$;')[0];
        assert.match(body, /language plpgsql security definer/);
        assert.match(body, /set search_path = pg_catalog, public, pg_temp/);
        assert.match(body, /v_actor is null or public.is_admin\(\) is not true/);
        assert.match(body, /where id = p_application_id for update/);
        assert(sql.includes('revoke all on function public.' + name));
        assert.match(sql, /from public, anon;/);
    });
}
await test('no account/catalogue DML, no protected application or frontend direct write', () => {
    assert.doesNotMatch(sql, /(?:insert into|update|delete from)\s+(?:public\.)?(?:user_roles|profiles|products|services|auth\.users)\b/i);
    assert.doesNotMatch(source, /\.(?:insert|update|delete|upsert)\s*\(/);
    assert(!sql.includes('CLX-VA-2026-0001') && !source.includes('CLX-VA-2026-0001'));
    assert.doesNotMatch(source, /service_role/);
});
await test('approval serializes identity lookup and finalizes last', () => {
    assert(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('insert into public.vendors'));
    assert(sql.indexOf('insert into public.vendors') < sql.indexOf('insert into public.vendor_campuses'));
    assert(sql.indexOf('insert into public.vendor_campuses') < sql.indexOf("update public.vendor_applications set status = 'APPROVED'"));
    assert.match(sql, /on conflict \(vendor_id, campus_id\) do nothing/);
});
const expected = { PENDING: ['UNDER_REVIEW','NEEDS_INFORMATION','REJECTED','APPROVED'], UNDER_REVIEW: ['NEEDS_INFORMATION','REJECTED','APPROVED'], NEEDS_INFORMATION: ['UNDER_REVIEW','REJECTED'], APPROVED: [], REJECTED: [], FUTURE: [] };
for (const [status, targets] of Object.entries(expected)) await test('UI actions ' + status, () => assert.deepEqual(ui.actionsForStatus(status).map(a => a.target), targets));
await test('RPC parameter contract and whitespace validation', async () => {
    let call;
    const client = { rpc: async (name, params) => { call = { name, params }; return { data: { application_number: 'LOCAL-APP', status: params.p_target_status || 'APPROVED', already_approved: true } }; } };
    assert((await ui.reviewApplication('local-id','REJECTED',' note ',' reason ',client)).success);
    assert.deepEqual(call, { name: 'admin_review_vendor_application', params: { p_application_id:'local-id',p_target_status:'REJECTED',p_review_note:'note',p_rejection_reason:'reason' } });
    for (const status of ['PENDING','APPROVED','FUTURE']) assert.equal((await ui.reviewApplication('local-id',status,'','',client)).success,false);
    for (const status of ['REJECTED','NEEDS_INFORMATION']) assert.equal((await ui.reviewApplication('local-id',status,' ',' ',client)).success,false);
    assert((await ui.approveApplication('local-id',client)).alreadyApproved);
    assert.deepEqual(call,{name:'admin_approve_vendor_application',params:{p_application_id:'local-id'}});
});
await test('frontend rejects invalid responses and hides raw errors', async () => {
    for (const response of [{data:null},{data:{status:'APPROVED'}},{error:{message:'internal SQL secret'}}]) {
        const result = await ui.approveApplication('local-id',{rpc:async()=>response});
        assert.equal(result.success,false); assert(!result.error.includes('internal SQL'));
    }
});
await test('search and status filter', () => {
    const row={application_number:'LOCAL-A',business_name:'Shop',contact_name:'Person',phone_number:'0123',whatsapp_number:'0456',status:'PENDING'};
    for(const q of ['local-a','shop','person','0123','0456']) assert.equal(ui.filterApplications([row],'PENDING',q).length,1);
    assert.equal(ui.filterApplications([row],'REJECTED','').length,0);
});
await test('UI auth gate, confirmation, duplicate guard and authoritative refresh', () => {
    assert(html.includes('applicationAdmin.load()') && html.includes('applicationAdmin.reset()'));
    assert.match(source, /window\.confirm\(`Approve/);
    assert.match(source, /if \(!button \|\| busy\) return/);
    assert.match(source, /if \(!result.success\)[\s\S]*await load\(\)/);
    assert.match(source, /rows = \[\]; render\(\); message\('Loading/);
    assert.doesNotMatch(source, /row\.status\s*=(?!=)/);
});
await test('approval confirmation communicates verification responsibility and scope', () => {
    const confirmation = source.match(/window\.confirm\(`([\s\S]*?)`\)/)?.[1];
    assert(confirmation);
    assert.match(confirmation, /you confirm that CLX has reviewed and verified the submitted business and contact details/);
    assert.match(confirmation, /creates an active, verified vendor record or links an existing verified vendor/);
    assert.match(confirmation, /does not create products, services, or vendor login credentials/);
});

// Optional isolated PostgreSQL runtime suite. Install PGlite outside the public
// build: npm install --prefix .vercel/phase4e2-sql-tools --ignore-scripts @electric-sql/pglite
const engine = new URL('./.vercel/phase4e2-sql-tools/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url);
if (existsSync(engine)) {
    const { PGlite } = await import(engine.href);
    const db = new PGlite(); // In-memory only; cannot connect to production.
    try {
        await db.exec(`create role anon; create role authenticated; create role service_role;
            create schema auth; create table auth.users(id uuid primary key);
            create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid', true),'')::uuid$$;`);
        await db.exec(read('supabase/migrations/0001_extensions_and_types.sql').replace('create extension if not exists pgcrypto;', ''));
        for(const file of ['0002_reference_tables.sql','0003_profiles_and_roles.sql','0004_vendors.sql','0013_security_helper_functions.sql']) await db.exec(read('supabase/migrations/'+file));
        await db.exec(`create table public.vendor_applications (
          id uuid primary key default gen_random_uuid(), legacy_key text unique,
          business_name text not null, slug text not null unique, category_slug text not null,
          campus_slug text not null, location text not null, contact_name text not null,
          phone_number text, email text, description text, status text not null default 'PENDING',
          rejection_reason text, reviewed_by uuid references public.profiles(id), vendor_id uuid references public.vendors(id),
          created_at timestamptz not null default now(), updated_at timestamptz not null default now());`);
        for(const file of ['0026_vendor_applications.sql','0027_allow_unowned_vendors.sql','0028_admin_vendor_application_review.sql']) await db.exec(read('supabase/migrations/'+file));
        const admin='00000000-0000-4000-8000-000000000001';
        await db.query('insert into auth.users values ($1)',[admin]);
        await db.query("insert into public.profiles(id,email,full_name) values($1,'local@example.invalid','Local Admin')",[admin]);
        await db.query("insert into public.user_roles(user_id,role) values($1,'ADMIN')",[admin]);
        await db.query("select set_config('test.uid',$1,false)",[admin]);
        const campus=(await db.query("insert into public.campuses(slug,name,short_name) values('local','Local Campus','LOCAL') returning id")).rows[0].id;
        await db.exec("insert into public.categories(slug,name) values('food','Food'),('shopping','Shopping'),('services','Services');");
        let seq=0;
        async function fixture(status='PENDING', category='food') {
            const n=++seq;
            return (await db.query(`insert into public.vendor_applications(business_name,slug,category_slug,campus_slug,campus_id,location,contact_name,phone_number,whatsapp_number,application_number,status,rejection_reason)
                values($1,$1,$2,'local',$3,'Local location','Local contact',$4,$4,$1,$5::public.vendor_application_status,case when $5::public.vendor_application_status='REJECTED' then 'Local reason' end) returning *`,['LOCAL-'+n,category,campus,'080'+String(n).padStart(8,'0'),status])).rows[0];
        }
        const approve = id => db.query('select public.admin_approve_vendor_application($1) as result',[id]);
        const review = (id,target,note='note',reason='reason') => db.query('select public.admin_review_vendor_application($1,$2,$3,$4)',[id,target,note,reason]);
        const counts = async () => (await db.query('select (select count(*) from vendors)::int as vendors,(select count(*) from vendor_campuses)::int as campuses')).rows[0];
        const app = async id => (await db.query('select * from vendor_applications where id=$1',[id])).rows[0];
        for (const from of ui.APPLICATION_STATUSES) for (const target of ui.APPLICATION_STATUSES) {
            await test(`SQL review ${from} -> ${target}`, async () => {
                const row=await fixture(from); const before=await app(row.id);
                if ((expected[from]||[]).includes(target) && target !== 'APPROVED') {
                    await review(row.id,target,'  note  ','  reason  ');
                    const after=await app(row.id); assert.equal(after.status,target); assert.equal(after.reviewed_by,admin);
                    assert.equal(after.review_notes,'note'); assert.equal(after.rejection_reason,target==='REJECTED'?'reason':null);
                } else { await assert.rejects(review(row.id,target)); assert.deepEqual(await app(row.id),before); }
            });
        }
        await test('SQL required text and length limits',async()=>{
            const row=await fixture();
            await assert.rejects(review(row.id,'REJECTED','note',' '));
            await assert.rejects(review(row.id,'NEEDS_INFORMATION',' ',''));
            await assert.rejects(review(row.id,'UNDER_REVIEW','x'.repeat(2001),''));
            await assert.rejects(review(row.id,null));
        });
        for (const target of ['NEEDS_INFORMATION', 'REJECTED']) {
            const send = (id, value) => target === 'NEEDS_INFORMATION'
                ? review(id, target, value, null) : review(id, target, null, value);
            const field = target === 'NEEDS_INFORMATION' ? 'review_notes' : 'rejection_reason';
            for (const [name, value] of [['NULL', null], ['empty', ''], ['spaces', '     '], ['tab', '\t'], ['newline', '\n'], ['carriage return', '\r'], ['mixed whitespace', ' \t\n \r\t ']]) {
                await test(`SQL ${target} rejects ${name} without mutation`, async () => {
                    const row = await fixture(); const before = await app(row.id);
                    await assert.rejects(send(row.id, value));
                    assert.deepEqual(await app(row.id), before);
                });
            }
            await test(`SQL ${target} normalizes text and preserves Unicode/punctuation`, async () => {
                const row = await fixture();
                await send(row.id, ' \tNeed  updated\nID document — café, 商店!\r ');
                assert.equal((await app(row.id))[field], 'Need updated ID document — café, 商店!');
            });
            await test(`SQL ${target} accepts exactly 2000 characters after normalization`, async () => {
                const row = await fixture();
                const normalized = 'x'.repeat(999) + ' ' + 'é'.repeat(1000);
                await send(row.id, '\t ' + 'x'.repeat(999) + ' \n\r\t ' + 'é'.repeat(1000) + '\n');
                assert.equal((await app(row.id))[field], normalized);
            });
            await test(`SQL ${target} rejects 2001 characters after normalization`, async () => {
                const row = await fixture(); const before = await app(row.id);
                await assert.rejects(send(row.id, '\t' + 'x'.repeat(1000) + ' \n\t' + 'é'.repeat(1000) + '\r'));
                assert.deepEqual(await app(row.id), before);
            });
        }
        await test('SQL admin authorization and ACL',async()=>{
            const row=await fixture();
            for(const uid of ['', '00000000-0000-4000-8000-000000000099']) {
                await db.query("select set_config('test.uid',$1,false)",[uid]);
                await assert.rejects(approve(row.id)); await assert.rejects(review(row.id,'UNDER_REVIEW'));
            }
            await db.query("select set_config('test.uid',$1,false)",[admin]);
            const acl=(await db.query(`select has_function_privilege('anon','public.admin_approve_vendor_application(uuid)','execute') as anon,
                has_function_privilege('authenticated','public.admin_approve_vendor_application(uuid)','execute') as admin,
                has_table_privilege('authenticated','public.vendor_applications','update') as direct_update`)).rows[0];
            assert.deepEqual(acl,{anon:false,admin:true,direct_update:false});
        });
        for(const status of ['NEEDS_INFORMATION','REJECTED','APPROVED']) await test('SQL approval rejects '+status,async()=>{
            const row=await fixture(status), before=await counts(); await assert.rejects(approve(row.id)); assert.deepEqual(await counts(),before);
        });
        for(const status of ['PENDING','UNDER_REVIEW']) await test('SQL approval and no-op '+status,async()=>{
            const row=await fixture(status); const before=await counts();
            const result=(await approve(row.id)).rows[0].result;
            assert.equal(result.already_approved,false); assert.equal(result.status,'APPROVED');
            const updated=await app(row.id); assert(updated.vendor_id); assert.equal(updated.reviewed_by,admin);
            const vendor=(await db.query('select * from vendors where id=$1',[updated.vendor_id])).rows[0];
            assert.equal(vendor.owner_user_id,null); assert.equal(vendor.status,'ACTIVE'); assert.equal(vendor.is_verified,true);
            assert.equal(vendor.slug,'clx-vendor-'+createHash('md5').update('vendor-application:'+row.id).digest('hex')); assert.equal(vendor.phone_number,'+234'+row.phone_number.slice(1));
            assert.deepEqual(await counts(),{vendors:before.vendors+1,campuses:before.campuses+1});
            assert.equal((await approve(row.id)).rows[0].result.already_approved,true);
            assert.deepEqual(await app(row.id),updated);
            assert.deepEqual((await db.query('select * from vendors where id=$1',[updated.vendor_id])).rows[0],vendor);
            assert.deepEqual(await counts(),{vendors:before.vendors+1,campuses:before.campuses+1});
        });
        await test('SQL duplicate identity and explicit link reuse',async()=>{
            const row=await fixture(); await approve(row.id); const linked=await app(row.id);
            const other=await fixture(); await db.query('update vendor_applications set business_name=$1,phone_number=$2 where id=$3',[row.business_name,row.phone_number,other.id]);
            const before=await counts(); await assert.rejects(approve(other.id)); assert.deepEqual(await counts(),before);
            await db.query('update vendor_applications set vendor_id=$1 where id=$2',[linked.vendor_id,other.id]);
            await approve(other.id); assert.deepEqual(await counts(),before);
        });
        await test('SQL category/campus fail closed',async()=>{
            for(const category of ['unknown','services']) await assert.rejects(approve((await fixture('PENDING',category)).id));
            const row=await fixture(); await db.query('update campuses set is_active=false where id=$1',[campus]);
            await assert.rejects(approve(row.id)); await db.query('update campuses set is_active=true where id=$1',[campus]);
        });
        await test('SQL forced finalization failure rolls back vendor and campus',async()=>{
            const row=await fixture(); const before=await counts();
            await db.exec(`create function fail_finalization() returns trigger language plpgsql as $$begin raise exception 'Local rollback test'; end$$;
                create trigger fail_finalization before update on vendor_applications for each row execute function fail_finalization();`);
            await assert.rejects(approve(row.id)); assert.deepEqual(await counts(),before); assert.equal((await app(row.id)).vendor_id,null);
            await db.exec('drop trigger fail_finalization on vendor_applications;');
        });
        await test('SQL deterministic slug collision fails without linking',async()=>{
            const row=await fixture();
            await db.query(`insert into vendors(name,slug,category_id,location,status,is_verified) values('Different identity',$1,(select id from categories where slug='food'),'Different location','ACTIVE',true)`,['clx-vendor-'+createHash('md5').update('vendor-application:'+row.id).digest('hex')]);
            const before=await counts(); await assert.rejects(approve(row.id));
            assert.deepEqual(await counts(),before); assert.equal((await app(row.id)).vendor_id,null);
        });
        await test('SQL linked vendor inconsistency and missing campus fail closed',async()=>{
            const row=await fixture(); await approve(row.id); const approved=await app(row.id);
            await db.query("update vendors set status='SUSPENDED' where id=$1",[approved.vendor_id]);
            await assert.rejects(approve(row.id)); assert.deepEqual(await app(row.id),approved);
            await db.query("update vendors set status='ACTIVE' where id=$1",[approved.vendor_id]);
            await db.query('delete from vendor_campuses where vendor_id=$1',[approved.vendor_id]);
            const before=await counts(); await assert.rejects(approve(row.id)); assert.deepEqual(await counts(),before);
        });
        await test('SQL existing inactive association is never activated by approval',async()=>{
            const row=await fixture(); await approve(row.id); const linked=await app(row.id);
            const other=await fixture();
            await db.query('update vendor_applications set business_name=$1,phone_number=$2,vendor_id=$3 where id=$4',[row.business_name,row.phone_number,linked.vendor_id,other.id]);
            await db.query('update vendor_campuses set is_active=false where vendor_id=$1',[linked.vendor_id]);
            const before=await app(other.id); await assert.rejects(approve(other.id)); assert.deepEqual(await app(other.id),before);
        });
        await test('SQL account counts unchanged by approval',async()=>{
            assert.deepEqual((await db.query('select (select count(*) from auth.users)::int as users,(select count(*) from profiles)::int as profiles,(select count(*) from user_roles)::int as roles')).rows[0],{users:1,profiles:1,roles:1});
        });
    } finally { await db.close(); }
} else console.log('NOTE: PostgreSQL runtime checks skipped; install isolated PGlite as documented above.');
console.log(`\n${passed}/${passed} vendor application admin checks passed.`);
