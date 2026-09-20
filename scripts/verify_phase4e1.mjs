// Phase 4E.1 — production schema verification (read-only + permission probes)
// Run: node scripts/verify_phase4e1.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../frontend/node_modules/@supabase/supabase-js/dist/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, 'frontend', '.env'), 'utf8');
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const url = get('VITE_SUPABASE_URL');
const key = get('VITE_SUPABASE_ANON_KEY');
const sb = createClient(url, key);

const out = (t, v) => console.log(`\n=== ${t} ===\n` + JSON.stringify(v, null, 2));

// ---- inspect real production structure & policies via RPC-free direct SQL is impossible from anon;
// ---- use supabase-js to hit information_schema through an authenticated session is also blocked.
// ---- Probe columns using SELECT only. Permission mutation tests belong in an isolated database.
const cols = ['id', 'application_number', 'business_name', 'contact_name', 'phone', 'whatsapp', 'campus_id', 'category', 'location', 'description', 'status', 'reviewed_by', 'reviewed_at', 'review_notes', 'slug', 'created_at', 'updated_at', 'user_id', 'applicant_id', 'email'];
for (const c of cols) {
    const { error } = await sb.from('vendor_applications').select(c).limit(0);
    out(`column probe: ${c}`, { exists: !error || !/does not exist/.test(error.message || ''), error: error?.message });
}

const { error: selErr } = await sb.from('vendor_applications').select('application_number').limit(3);
out('anon SELECT vendor_applications', { allowed: !selErr, error: selErr?.message, code: selErr?.code });

const { data: campuses, error: campErr } = await sb.from('campuses').select('id,name,is_active').eq('is_active', true);
out('active campuses', { error: campErr?.message, campuses: campuses?.map(c => c.name) });

const { data: mig, error: migErr } = await sb.from('schema_migrations').select('version').order('version', { ascending: false }).limit(8);
out('migration history probe (schema_migrations)', migErr ? { error: migErr.message } : mig);
console.log('\nDONE');
