#!/usr/bin/env node
/**
 * CLX functional-acceptance cleanup — STAGING ONLY.
 * Deletes ONLY the temporary records created during the 2026-08-31 smoke test:
 *   - vendor_applications named 'Smoke Test Demo Vendor', status PENDING, vendor_id NULL
 *   - two marketplace_listings 'Engineering Mathematics Textbook (Live Flow Test)', PENDING_REVIEW
 * Safety:
 *   - aborts unless DATABASE_URL resolves to staging ref bdjfkuddpupqaswzkrth
 *   - SELECT-first: prints every target record and count before touching anything
 *   - uses a transaction; verifies deleted counts inside the txn; rolls back on mismatch
 *   - no broad DELETE conditions
 * Usage: node scripts/cleanup-smoke-test.js [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const STAGING_REF = 'bdjfkuddpupqaswzkrth';
const DRY_RUN = process.argv.includes('--dry-run');

function assertStaging(url) {
  const u = new URL(url);
  const isPooler = u.hostname.includes('pooler');
  const ref = isPooler ? decodeURIComponent(u.username).split('.')[1] : u.hostname.split('.')[0].replace(/^db\./, '');
  if (ref !== STAGING_REF) {
    console.error(`ABORT: DATABASE_URL resolves to project ref "${ref}", expected staging ${STAGING_REF}.`);
    process.exit(1);
  }
  return u;
}

// Exact IDs discovered during the functional acceptance test.
const VA_IDS = [
  'e88c5587', '2070b9a5', 'a6319788', '5424e324', '0601e5bb',
  '422d4a96', '3bfcf7a3', '94905e08', '56094f7a', '29abc249',
].map(p => p + '%');

const LISTING_IDS = [
  'e3344af9-b928-4194-ad7e-ba4fcf9a1b59',
  'ea592281-29ea-47e0-a82a-6efc5c63783c',
];

const BASELINE_TABLES = [
  'campuses', 'categories', 'vendors', 'products', 'services',
  'marketplace_listings', 'delivery_zones', 'profiles', 'user_roles',
  'vendor_applications',
];

async function main() {
  if (!process.env.DATABASE_URL) { console.error('ABORT: DATABASE_URL not set'); process.exit(1); }
  const u = assertStaging(process.env.DATABASE_URL);
  const db = new Client({
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  console.log(`[identity] verified staging ref ${STAGING_REF}`);

  // ---------- identity check on actual data ----------
  const listingRows = (await db.query(
    `select id, title, status, created_at from marketplace_listings where id::text = any($1)`,
    [LISTING_IDS]
  )).rows;
  if (listingRows.length !== LISTING_IDS.length) {
    console.error(`ABORT: expected ${LISTING_IDS.length} target listings, found ${listingRows.length}.`);
    listingRows.forEach(r => console.error('  found:', r.id, r.title, r.status));
    process.exit(1);
  }
  for (const r of listingRows) {
    if (r.title !== 'Engineering Mathematics Textbook (Live Flow Test)' || r.status !== 'PENDING_REVIEW') {
      console.error(`ABORT: listing ${r.id} does not match expected title/status. Got: ${r.title} / ${r.status}`);
      process.exit(1);
    }
  }

  const vaRows = (await db.query(
    `select id::text, business_name, status, vendor_id, created_at
       from vendor_applications
      where (id::text like any($1))
        and business_name = 'Smoke Test Demo Vendor'
        and status = 'PENDING'
        and vendor_id is null`,
    [VA_IDS]
  )).rows;
  // sanity: also confirm there is no OTHER row sharing these id prefixes that we are NOT deleting
  const vaAll = (await db.query(
    `select id::text, business_name, status, vendor_id, created_at from vendor_applications where id::text like any($1)`,
    [VA_IDS]
  )).rows;
  if (vaRows.length !== vaAll.length) {
    console.error('ABORT: some rows matching the ID prefixes do NOT match the smoke-test signature. Diff:');
    vaAll.filter(r => !vaRows.includes(r)).forEach(r => console.error('  skipped:', r));
    process.exit(1);
  }
  if (vaRows.length === 0) {
    console.error('ABORT: no vendor_applications matched the smoke-test signature — nothing to delete.');
    process.exit(1);
  }

  console.log('\n=== TARGET vendor_applications ===');
  vaRows.forEach(r => console.log(' ', r.id, '|', r.business_name, '|', r.status, '| vendor_id:', r.vendor_id, '|', r.created_at));
  console.log('count:', vaRows.length);
  console.log('\n=== TARGET marketplace_listings ===');
  listingRows.forEach(r => console.log(' ', r.id, '|', r.title, '|', r.status, '|', r.created_at));
  console.log('count:', listingRows.length);

  // ---------- baseline counts ----------
  const baseline = {};
  for (const t of BASELINE_TABLES) {
    baseline[t] = +(await db.query(`select count(*)::int as c from ${t}`)).rows[0].c;
  }
  console.log('\n=== BASELINE COUNTS ===');
  console.log(JSON.stringify(baseline, null, 2));

  if (DRY_RUN) {
    console.log('[DRY RUN] no changes were made.');
    await db.end();
    return;
  }

  // ---------- transactional delete ----------
  try {
    await db.query('BEGIN');
    const d1 = await db.query(
      `delete from vendor_applications
        where id::text = any($1)
          and business_name = 'Smoke Test Demo Vendor'
          and status = 'PENDING'
          and vendor_id is null`,
      [vaRows.map(r => r.id)]
    );
    const d2 = await db.query(
      `delete from marketplace_listings
        where id::text = any($1)
          and title = 'Engineering Mathematics Textbook (Live Flow Test)'
          and status = 'PENDING_REVIEW'`,
      [LISTING_IDS]
    );
    if (d1.rowCount !== vaRows.length) throw new Error(`vendor_applications delete count ${d1.rowCount} != expected ${vaRows.length}`);
    if (d2.rowCount !== LISTING_IDS.length) throw new Error(`marketplace_listings delete count ${d2.rowCount} != expected ${LISTING_IDS.length}`);
    console.log(`\n[txn] deleted ${d1.rowCount} vendor_applications, ${d2.rowCount} marketplace_listings`);
    await db.query('COMMIT');
    console.log('[txn] COMMITTED');
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('DELETE FAILED (rolled back):', e.message);
    await db.end();
    process.exit(1);
  }

  // ---------- post-delete verification ----------
  console.log('\n=== POST-DELETE VERIFICATION ===');
  const remainVa = (await db.query(
    `select count(*)::int as c from vendor_applications
      where business_name = 'Smoke Test Demo Vendor' and status='PENDING' and vendor_id is null`
  )).rows[0].c;
  const remainListing = (await db.query(
    `select count(*)::int as c from marketplace_listings where id::text = any($1)`, [LISTING_IDS]
  )).rows[0].c;
  const orphanVa = (await db.query(
    `select count(*)::int as c from vendor_applications va
       left join vendors v on v.id = va.vendor_id
      where va.vendor_id is not null and v.id is null`
  )).rows[0].c;
  const after = {};
  for (const t of BASELINE_TABLES) {
    after[t] = +(await db.query(`select count(*)::int as c from ${t}`)).rows[0].c;
  }
  console.log('remaining smoke-test vendor_applications:', remainVa);
  console.log('remaining target marketplace_listings:', remainListing);
  console.log('orphan vendor_applications (vendor_id set but vendor missing):', orphanVa);
  console.log('\n=== COUNTS AFTER ===');
  console.log(JSON.stringify(after, null, 2));
  console.log('\n=== DELTA (after - before) ===');
  for (const t of BASELINE_TABLES) {
    const d = after[t] - baseline[t];
    console.log(`  ${t}: ${baseline[t]} -> ${after[t]}  (delta ${d >= 0 ? '+' : ''}${d})`);
  }

  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
