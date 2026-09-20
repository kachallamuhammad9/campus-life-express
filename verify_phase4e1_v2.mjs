// Phase 4E.1 — READ-ONLY production verification (no inserts/updates/deletes/RPC calls)
// Safe to run against production at any time.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './frontend/node_modules/@supabase/supabase-js/dist/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'frontend', '.env'), 'utf8');
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const sb = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'));
const out = (t, v) => console.log(`\n=== ${t} ===\n` + JSON.stringify(v, null, 2));

// 1) Column visibility probes (select with limit 0 — never returns rows)
const expected = [
  'id', 'legacy_key', 'business_name', 'slug', 'category_slug', 'campus_slug',
  'location', 'contact_name', 'phone_number', 'email', 'description',
  'status', 'rejection_reason', 'reviewed_by', 'vendor_id',
  'application_number', 'campus_id', 'whatsapp_number', 'submitted_at',
  'reviewed_at', 'review_notes', 'created_at', 'updated_at'
];
for (const c of expected) {
  const { error } = await sb.from('vendor_applications').select(c).limit(0);
  const exists = !error || !/does not exist/i.test(error.message || '');
  out(`column probe: ${c}`, { exists, visibleToAnon: !error, error: error?.message });
}

// 2) Anon SELECT probe — read-only. With correct RLS/grants this must be DENIED.
const { data: sel, error: selErr } = await sb.from('vendor_applications').select('application_number,status,business_name').limit(5);
out('anon SELECT vendor_applications (should be DENIED / empty)', {
  rowCount: sel?.length ?? null, denied: Boolean(selErr), error: selErr?.message, code: selErr?.code
});

// 3) RPC submit_vendor_application — NOT executed (read-only verification).
out('RPC submit_vendor_application', {
  note: 'NOT executed (read-only verification). Existence verified via migration file + manual SQL editor check.'
});

// 4) Active campuses (read-only)
const { data: campuses, error: campErr } = await sb.from('campuses').select('id,name,slug,is_active').eq('is_active', true);
out('active campuses', { campuses, error: campErr?.message });

// 5) Baseline counts (head: true — count only, no rows fetched)
for (const t of ['vendor_applications', 'vendors', 'vendor_campuses', 'user_roles', 'products', 'services', 'orders', 'payments']) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  out(`baseline count: ${t}`, { count, error: error?.message });
}

console.log('\nDONE — read-only verification complete. No mutations performed.');
