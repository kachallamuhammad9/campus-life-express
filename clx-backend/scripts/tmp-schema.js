// READ-ONLY schema inspection. Never prints secrets.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tables = ['vendors', 'vendor_campuses', 'vendor_operating_hours', 'vendor_applications', 'products', 'product_images', 'services', 'marketplace_listings', 'delivery_zones', 'profiles', 'user_roles', 'campuses', 'categories', 'product_categories'];
  for (const t of tables) {
    const r = await c.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
    if (!r.rows.length) { console.log(`-- ${t}: NOT FOUND`); continue; }
    console.log(`-- ${t}`);
    r.rows.forEach(x => console.log(`   ${x.column_name} | ${x.data_type} | null:${x.is_nullable} | def:${x.column_default ? x.column_default.slice(0, 40) : '-'}`));
  }
  // constraints / uniques relevant to idempotency
  const uq = await c.query(`select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def from pg_constraint where contype in ('u','p') and conrelid::regclass::text in ('vendors','products','services','marketplace_listings','vendor_campuses','vendor_operating_hours','categories','campuses','vendor_applications') order by 1`);
  console.log('-- unique/pk constraints');
  uq.rows.forEach(x => console.log(`   ${x.tbl}.${x.conname}: ${x.def}`));
  // RLS
  const rls = await c.query(`select c.relname, c.relrowsecurity, c.relowner::regrole from pg_class c where relnamespace='public'::regnamespace and relkind='r' order by relname`);
  console.log('-- RLS'); rls.rows.forEach(x => console.log(`   ${x.relname}: rls=${x.relrowsecurity}`));
  const en = await c.query(`select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid order by 1,2`);
  console.log('-- enums'); en.rows.forEach(x => console.log(`   ${x.typname}: ${x.enumlabel}`));
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
