// READ-ONLY post-seed verification for staging. Never prints secrets.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const one = async (sql, params) => (await c.query(sql, params)).rows[0];
  console.log('== FINAL ROW COUNTS ==');
  for (const t of ['campuses', 'categories', 'vendors', 'vendor_campuses', 'vendor_operating_hours', 'products', 'services', 'marketplace_listings', 'delivery_zones', 'profiles', 'user_roles']) {
    console.log(t.padEnd(24), (await one(`select count(*)::int n from ${t}`)).n);
  }

  console.log('== FK INTEGRITY ==');
  const orphanProducts = (await one(`select count(*)::int n from products p left join vendors v on v.id=p.vendor_id left join categories c on c.id=p.category_id left join campuses cm on cm.id=p.campus_id where v.id is null or c.id is null or cm.id is null`)).n;
  const orphanServices = (await one(`select count(*)::int n from services s left join vendors v on v.id=s.vendor_id left join categories c on c.id=s.category_id left join campuses cm on cm.id=s.campus_id left join profiles p on p.id=s.provider_user_id where c.id is null or cm.id is null or p.id is null or (s.vendor_id is not null and v.id is null)`)).n;
  const orphanListings = (await one(`select count(*)::int n from marketplace_listings m left join profiles p on p.id=m.seller_user_id left join categories c on c.id=m.category_id left join campuses cm on cm.id=m.campus_id where p.id is null or c.id is null or cm.id is null`)).n;
  const orphanVC = (await one(`select count(*)::int n from vendor_campuses vc left join vendors v on v.id=vc.vendor_id left join campuses c on c.id=vc.campus_id where v.id is null or c.id is null`)).n;
  const orphanHours = (await one(`select count(*)::int n from vendor_operating_hours h where not exists (select 1 from vendor_campuses vc where vc.vendor_id=h.vendor_id and vc.campus_id=h.campus_id)`)).n;
  console.log({ orphanProducts, orphanServices, orphanListings, orphanVendorCampuses: orphanVC, orphanHours });

  console.log('== VENDOR-CAMPUS RELATIONSHIPS ==');
  (await c.query(`select v.slug vendor, array_agg(c.slug order by c.slug) campuses from vendor_campuses vc join vendors v on v.id=vc.vendor_id join campuses c on c.id=vc.campus_id where v.legacy_key like 'demo:%' group by v.slug order by v.slug`)).rows
    .forEach(r => console.log(r.vendor, '->', r.campuses.join(', ')));

  console.log('== DEMO RECORD BREAKDOWN ==');
  console.log('demo vendors      :', (await one(`select count(*)::int n from vendors where legacy_key like 'demo:%'`)).n);
  console.log('demo products     :', (await one(`select count(*)::int n from products where legacy_key like 'demo:%'`)).n);
  console.log('demo services     :', (await one(`select count(*)::int n from services where legacy_key like 'demo:%'`)).n);
  console.log('demo listings     :', (await one(`select count(*)::int n from marketplace_listings where legacy_key like 'demo:%'`)).n);
  console.log('  published       :', (await one(`select count(*)::int n from marketplace_listings where legacy_key like 'demo:%' and status='PUBLISHED'`)).n);
  console.log('  pending review  :', (await one(`select count(*)::int n from marketplace_listings where legacy_key like 'demo:%' and status='PENDING_REVIEW'`)).n);

  console.log('== PRESERVATION CHECK (existing pre-seed records) ==');
  console.log('non-demo vendors  :', (await one(`select count(*)::int n from vendors where legacy_key is null or legacy_key not like 'demo:%'`)).n);
  console.log('non-demo products :', (await one(`select count(*)::int n from products where legacy_key is null or legacy_key not like 'demo:%'`)).n);
  console.log('non-demo services :', (await one(`select count(*)::int n from services where legacy_key is null or legacy_key not like 'demo:%'`)).n);
  console.log('non-demo listings :', (await one(`select count(*)::int n from marketplace_listings where legacy_key is null or legacy_key not like 'demo:%'`)).n);
  console.log('delivery zones    :', (await one(`select count(*)::int n from delivery_zones`)).n);

  console.log('== RLS ENABLED ==');
  const rls = (await c.query(`select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity = false order by relname`)).rows;
  console.log('public tables WITHOUT rls:', rls.length ? rls.map(r => r.relname).join(', ') : 'none (all enabled)');

  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
