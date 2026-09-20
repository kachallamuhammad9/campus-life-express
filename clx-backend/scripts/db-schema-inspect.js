// READ-ONLY schema inspector for staging. Never prints secrets.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = [path.join(__dirname, '..', '..', '.env'), path.join(__dirname, '..', '.env'), path.join(process.cwd(), '.env')].find(p => fs.existsSync(p));
if (!envPath) { console.error('No .env found — ABORT'); process.exit(1); }
const raw = fs.readFileSync(envPath, 'utf8');
const line = raw.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const url = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
const u = new URL(url);

(async () => {
  // Safety: verify staging identity
  const host = u.hostname;
  const isPooler = host.includes('pooler');
  const ref = isPooler ? decodeURIComponent(u.username).split('.')[1] : host.split('.')[0].replace(/^db\./, '');
  if (ref !== 'bdjfkuddpupqaswzkrth') {
    console.error('NOT STAGING — ABORT');
    process.exit(1);
  }
  console.log('identity OK: staging ref', ref);

  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();

  const tables = ['vendors', 'products', 'services', 'marketplace_listings', 'vendor_campuses', 'vendor_operating_hours', 'product_images', 'listing_images', 'delivery_zones', 'categories', 'profiles', 'carts', 'cart_items', 'orders'];
  for (const t of tables) {
    const r = await c.query("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position", [t]);
    console.log('== ' + t);
    r.rows.forEach(x => console.log('  ' + x.column_name + ' | ' + x.data_type + ' | null:' + x.is_nullable + ' | def:' + (x.column_default || '')));
  }

  const cons = await c.query("select conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def from pg_constraint where connamespace='public'::regnamespace and contype in ('f','u') order by conrelid::regclass::text");
  console.log('== constraints (f/u)');
  cons.rows.forEach(x => console.log(x.tbl + ' | ' + x.conname + ' | ' + x.def));

  // sample existing rows for reference
  for (const t of ['vendors', 'products', 'services', 'marketplace_listings', 'delivery_zones', 'categories']) {
    const r = await c.query(`select to_jsonb(x) as row from "${t}" x limit 2`);
    console.log('== sample ' + t);
    r.rows.forEach(x => console.log('  ' + JSON.stringify(x.row).slice(0, 500)));
  }

  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
