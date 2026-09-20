// READ-ONLY enum + constraint inspection.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const enums = await c.query(`select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) vals from pg_type t join pg_enum e on e.enumtypid=t.oid group by t.typname`);
  enums.rows.forEach(x => console.log(`enum ${x.typname}: ${x.vals}`));
  const uq = await c.query(`select c.conrelid::regclass::text tbl, c.conname, pg_get_constraintdef(c.oid) def from pg_constraint c where c.contype in ('u','p') order by 1`);
  uq.rows.forEach(x => console.log(`${x.tbl} | ${x.conname} | ${x.def}`));
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
