// Applies a single .sql migration file to the verified staging DB (additive only).
// Usage: node scripts/apply-migration.js <migration-file-name>
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const STAGING_REF = 'bdjfkuddpupqaswzkrth';

(async () => {
  const fileName = process.argv[2];
  if (!fileName) { console.error('Usage: node apply-migration.js <file.sql>'); process.exit(1); }
  const filePath = path.join(__dirname, '..', 'supabase', 'migrations', fileName);
  if (!fs.existsSync(filePath)) { console.error('Migration file not found:', filePath); process.exit(1); }
  const sql = fs.readFileSync(filePath, 'utf8');

  const line = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
  const u = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
  const isPooler = u.hostname.includes('pooler');
  const ref = isPooler ? decodeURIComponent(u.username).split('.')[1] : u.hostname.split('.')[0].replace(/^db\./, '');
  if (ref !== STAGING_REF) { console.error('ABORT: not staging'); process.exit(1); }
  console.log('[identity] staging verified:', ref);

  const c = new Client({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(sql);
  console.log('[migration] applied:', fileName);
  await c.end();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
