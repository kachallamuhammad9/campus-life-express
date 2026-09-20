require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s) => { try { const r = await p.query(s); return r.rows; } catch (e) { return [{ ERR: e.message }]; } };
(async () => {
  console.log('--campuses--', await q('select id,slug,name from campuses order by id'));
  console.log('--vendors--', await q('select status,count(*)::int c from vendors group by status'));
  console.log('--products--', await q('select status,count(*)::int c from products group by status'));
  console.log('--services--', await q('select status,count(*)::int c from services group by status'));
  console.log('--listings--', await q('select status,count(*)::int c from marketplace_listings group by status'));
  console.log('--apps--', await q('select status,count(*)::int c from vendor_applications group by status'));
  console.log('--zones--', await q('select count(*)::int c from delivery_zones'));
  console.log('--cats--', await q('select count(*)::int c from categories'));
  console.log('--profiles--', await q('select count(*)::int c from profiles'));
  console.log('--roles--', await q('select role,count(*)::int c from user_roles group by role'));
  await p.end();
})();
