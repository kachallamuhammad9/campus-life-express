const fs = require('fs'); const path = require('path'); const { Client } = require('pg');
let raw; try { raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); } catch (e) { raw = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8'); }
const url = raw.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
const u = new URL(url);
(async () => {
    const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
    await c.connect();
    const e = await c.query("select t.typname, string_agg(e.enumlabel,',') labels from pg_type t join pg_enum e on e.enumtypid=t.oid group by t.typname order by t.typname");
    e.rows.forEach(r => console.log(r.typname, '=', r.labels));
    // enum default columns
    const cols = await c.query("select table_name,column_name,data_type,udt_name,column_default from information_schema.columns where table_schema='public' and udt_name in ('vendor_status','product_status','service_status','listing_status','condition','price_type','user_role') order by table_name");
    cols.rows.forEach(r => console.log('col:', r.table_name + '.' + r.column_name, r.udt_name, 'def', r.column_default));
    await c.end();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
