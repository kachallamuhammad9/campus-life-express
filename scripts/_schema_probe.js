const envRaw = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
for (const line of envRaw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('TABLES vendor%', `select tablename from pg_tables where schemaname='public' and tablename ilike '%vendor%'`);
  await q('COLUMNS vendor_applications', `select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='vendor_applications' order by ordinal_position`);
  await q('RLS vendor_applications', `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname='vendor_applications'`);
  await q('POLICIES vendor_applications', `select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='vendor_applications'`);
  await q('CONSTRAINTS vendor_applications', `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.vendor_applications'::regclass`);
  await q('TRIGGERS vendor_applications', `select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.vendor_applications'::regclass and not tgisinternal`);
  await q('ANY application-number counters', `select sequencename from pg_sequences where schemaname='public' and sequencename ilike '%vendor_app%'`);
  await q('ENUM vendor_application_status', `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='vendor_application_status' order by enumsortorder`);
  await c.end();
})();

// ---- extended probe appended (read-only) ----
(async () => {
  const fs2 = require('fs'), path2 = require('path');
  const envRaw2 = fs2.readFileSync(path2.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envRaw2.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('COLUMNS FULL', `select column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length from information_schema.columns where table_schema='public' and table_name='vendor_applications' order by ordinal_position`);
  await q('INDEXES', `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='vendor_applications' order by indexname`);
  await q('RLS FLAGS', `select relrowsecurity, relforcerowsecurity from pg_class where oid='public.vendor_applications'::regclass`);
  await q('TABLE GRANTS', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='vendor_applications' order by grantee, privilege_type`);
  await q('SET_UPDATED_AT fn', `select to_regproc('public.set_updated_at') as fn`);
  await q('TABLE OWNER', `select tableowner from pg_tables where schemaname='public' and tablename='vendor_applications'`);
  await c.end();
})();
