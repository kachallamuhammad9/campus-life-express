const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const CONN = process.env.DATABASE_URL;
if (!CONN) { console.error('No DATABASE_URL'); process.exit(1); }
const host = new URL(CONN).host;
console.log('DB host:', host);
if (!/supabase\.(com|co)/.test(host)) { console.error('ABORT: not a Supabase host'); process.exit(1); }
if (!/ref=.*(staging|ykbzsprn)/i.test(CONN) && !/staging/i.test(CONN)) {
  console.error('ABORT: connection does not clearly identify STAGING. Host:', host);
  process.exit(1);
}
console.log('Confirmed STAGING connection.');

const APP_IDS = [
  'e88c5587-0eb7-4a44-8204-6bd966d27fe9','2070b9a5-0db4-4c9a-8445-2a08b198f263','a6319788-c954-4701-9287-070370031d43',
  '5424e324-79ca-4965-b9ba-e51218fe1151','0601e5bb-324b-4677-8244-4b5e90d403f8','422d4a96-147f-41f3-924c-cfad6df68399',
  '3bfcf7a3-dfbf-47db-96de-c25ff515ed4b','94905e08-280d-46f6-9218-bcb37fb774c7','56094f7a-8423-472a-88ba-e0dfbf6e90d0',
  '29abc249-18d4-4eae-8665-1253a205bbb2'
];
const LISTING_IDS = ['e3344af9-b928-4194-ad7e-ba4fcf9a1b59','ea592281-29ea-47e0-a82a-6efc5c63783c'];
const q = (c, sql, p) => c.query(sql, p);
const counts = async (c) => {
  const tables = ['campuses','categories','vendors','products','services','marketplace_listings','delivery_zones','profiles','user_roles','vendor_applications'];
  const out = {};
  for (const t of tables) { try { const r = await q(c, `select count(*)::int n from ${t}`); out[t] = r.rows[0].n; } catch { out[t] = 'N/A'; } }
  return out;
};

(async () => {
  const c = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log('--- PRE-CLEANUP master counts ---');
  const before = await counts(c); console.log(before);

  // 1. Confirm exact target records
  const apps = await q(c, `select id, business_name, status, vendor_id, created_at from vendor_applications where id = any($1::uuid[])`, [APP_IDS]);
  const extraApps = await q(c, `select id, business_name, status, vendor_id, created_at from vendor_applications where business_name ilike '%Smoke Test Demo Vendor%' and id <> all($1::uuid[])`, [APP_IDS]);
  const listings = await q(c, `select id, title, status, created_at from marketplace_listings where id = any($1::uuid[])`, [LISTING_IDS]);

  console.log('Matched vendor_applications:', apps.rows.length);
  console.log(JSON.stringify(apps.rows, null, 1));
  console.log('Extra matching-name applications (NOT in approved list):', extraApps.rows.length);
  if (extraApps.rows.length) { console.log(JSON.stringify(extraApps.rows, null, 1)); }
  console.log('Matched marketplace_listings:', listings.rows.length);
  console.log(JSON.stringify(listings.rows, null, 1));

  const appTargets = apps.rows.filter(r => r.business_name === 'Smoke Test Demo Vendor' && r.status === 'PENDING' && r.vendor_id === null);
  const listingTargets = listings.rows.filter(r => r.title === 'Engineering Mathematics Textbook (Live Flow Test)' && r.status === 'PENDING_REVIEW');
  if (appTargets.length !== apps.rows.length || appTargets.length === 0) {
    console.error('ABORT: vendor_applications did not match expected criteria. Rolling back (nothing deleted).');
    await c.end(); process.exit(1);
  }
  if (listingTargets.length !== listings.rows.length || listingTargets.length !== LISTING_IDS.length) {
    console.error('ABORT: marketplace_listings did not match expected criteria. Rolling back (nothing deleted).');
    await c.end(); process.exit(1);
  }

  // 2. Transactional delete
  await q(c, 'BEGIN');
  try {
    const d1 = await q(c, `delete from vendor_applications where id = any($1::uuid[])`, [appTargets.map(r => r.id)]);
    console.log('vendor_applications deleted:', d1.rowCount);
    const d2 = await q(c, `delete from marketplace_listings where id = any($1::uuid[])`, [listingTargets.map(r => r.id)]);
    console.log('marketplace_listings deleted:', d2.rowCount);
    if (d1.rowCount !== appTargets.length || d2.rowCount !== listingTargets.length) throw new Error('Delete count mismatch - rolling back');
    await q(c, 'COMMIT');
    console.log('COMMITTED.');
  } catch (e) {
    await q(c, 'ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    await c.end(); process.exit(1);
  }

  // 3. Post verification
  console.log('--- POST-CLEANUP verification ---');
  const after = await counts(c); console.log(after);
  const left1 = await q(c, `select count(*)::int n from vendor_applications where id = any($1::uuid[])`, [APP_IDS]);
  const left2 = await q(c, `select count(*)::int n from vendor_applications where business_name ilike '%Smoke Test Demo Vendor%'`);
  const left3 = await q(c, `select count(*)::int n from marketplace_listings where id = any($1::uuid[])`, [LISTING_IDS]);
  const left4 = await q(c, `select count(*)::int n from marketplace_listings where title ilike '%Live Flow Test%'`);
  console.log('Remaining target vendor_applications:', left1.rows[0].n);
  console.log('Remaining any-name Smoke Test Demo Vendor apps:', left2.rows[0].n);
  console.log('Remaining target marketplace_listings:', left3.rows[0].n);
  console.log('Remaining "Live Flow Test" listings:', left4.rows[0].n);

  console.log('--- Count diff before/after ---');
  for (const k of Object.keys(before)) {
    if (before[k] !== after[k]) console.log(`${k}: ${before[k]} -> ${after[k]}`);
  }
  console.log('CLEANUP RESULT: PASS');
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
