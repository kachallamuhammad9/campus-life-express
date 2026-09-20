// READ-ONLY production inspection — campuses schema + row counts. No mutations.
const fs = require('fs');
for (const l of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    const r = await c.query(sql);
    console.log(`=== ${label} ===`);
    console.log(JSON.stringify(r.rows, null, 1));
  };
  await q('campuses columns', "select ordinal_position, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='campuses' order by ordinal_position");
  await q('campus count/active', 'select count(*)::int n, bool_or(is_active) any_active from public.campuses');
  await q('vendor_applications rows', 'select count(*)::int n from public.vendor_applications');
  await q('updated_at trigger', "select trigger_name, event_manipulation from information_schema.triggers where event_object_schema='public' and event_object_table='vendor_applications'");
  await q('policies now', "select policyname, cmd from pg_policies where schemaname='public' and tablename='vendor_applications'");
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
