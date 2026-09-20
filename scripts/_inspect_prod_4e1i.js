const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
for (const l of env.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const u = new URL(process.env.DATABASE_URL.trim().replace(/^"|"$/g, ''));
  u.password = decodeURIComponent(u.password);
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('columns', `select ordinal_position, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length from information_schema.columns where table_schema='public' and table_name='vendor_applications' order by ordinal_position`);
  await q('constraints', `select conname, contype, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.vendor_applications'::regclass order by contype, conname`);
  await q('indexes', `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='vendor_applications'`);
  await q('row count', `select count(*)::int total from public.vendor_applications`);
  await q('status distribution', `select coalesce(status,'<NULL>') status, count(*)::int n from public.vendor_applications group by status order by n desc`);
  await q('distinct status patterns', `select distinct status from public.vendor_applications limit 50`);
  await q('sample minimal (no PII)', `select id, application_number, status, extract(year from coalesce(submitted_at, created_at)) yr, submitted_at is not null as has_submitted, created_at from public.vendor_applications order by created_at limit 20`);
  await q('status column type', `select data_type, udt_name, column_default from information_schema.columns where table_schema='public' and table_name='vendor_applications' and column_name='status'`);
  await q('submitted/created nullability', `select column_name, is_nullable, data_type from information_schema.columns where table_schema='public' and table_name='vendor_applications' and column_name in ('submitted_at','created_at','phone','whatsapp','campus_id')`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
