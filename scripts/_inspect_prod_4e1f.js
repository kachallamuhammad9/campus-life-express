const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
for (const l of env.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log(`\n=== ${label} ERROR ===\n${e.message}`); }
  };
  await q('policies on vendor_applications', `select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='vendor_applications'`);
  await q('table acl vendor_applications', `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='vendor_applications' order by grantee, privilege_type`);
  await q('rls flag', `select relrowsecurity, relforcerowsecurity from pg_class where oid='public.vendor_applications'::regclass`);
  await q('policies on vendors', `select policyname, cmd, roles, left(coalesce(qual,''),80) qual, left(coalesce(with_check,''),80) wc from pg_policies where schemaname='public' and tablename='vendors'`);
  await q('table acl vendors', `select grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants where table_schema='public' and table_name='vendors' group by grantee`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
