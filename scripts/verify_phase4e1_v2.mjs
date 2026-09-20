// Phase 4E.1 — corrected production verification (0026 actual columns)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../frontend/node_modules/@supabase/supabase-js/dist/index.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, 'frontend', '.env'), 'utf8');
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const sb = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'));
const out = (t, v) => console.log(`\n=== ${t} ===\n` + JSON.stringify(v, null, 2));

for (const c of ['id', 'application_number', 'campus_id', 'business_name', 'contact_person_name', 'phone', 'whatsapp_number', 'email', 'business_category', 'business_location', 'description', 'status', 'submitted_at', 'reviewed_at', 'reviewed_by_user_id', 'review_notes', 'created_at', 'updated_at']) {
  const { error } = await sb.from('vendor_applications').select(c).limit(0);
  out(`column probe: ${c}`, { exists: !error || !/does not exist/.test(error.message || ''), error: error?.message });
}

const { data: sel, error: selErr } = await sb.from('vendor_applications').select('application_number,status,business_name').limit(5);
out('anon SELECT rows returned', { rowCount: sel?.length ?? null, error: selErr?.message, code: selErr?.code, rows: sel });

// Mutation and RPC permission probes run only in isolated SQL tests.

const { error: cntErr } = await sb.from('vendor_application_counters').select('*').limit(1);
out('anon SELECT vendor_application_counters (must fail or empty)', { error: cntErr?.message, code: cntErr?.code });

const { data: campuses, error: campErr } = await sb.from('campuses').select('id,name,is_active').eq('is_active', true);
out('active campuses', { campuses, error: campErr?.message });

for (const t of ['vendors', 'vendor_campuses', 'user_roles', 'products', 'services', 'orders', 'payments']) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  out(`baseline count: ${t}`, { count, error: error?.message });
}
console.log('\nDONE');
