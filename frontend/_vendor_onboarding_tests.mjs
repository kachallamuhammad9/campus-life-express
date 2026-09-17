/**
 * Phase 4E.1 — Vendor Registration Intake (static safety tests)
 * Run: node frontend/_vendor_onboarding_tests.mjs
 *
 * These tests statically verify that vendor onboarding:
 * - wires the real Supabase RPC `submit_vendor_application`
 * - has no mock/toast-only submission path left behind
 * - cannot insert into vendor_applications directly from the browser
 * - cannot set status / reviewer fields from the browser
 * - loads active campuses from Supabase (not hardcoded)
 * - guards against double submission
 * - has no legacy Express API dependency
 * - never touches service_role credentials or live vendor tables
 * - confirms the official CLX WhatsApp destination is +2349150736638
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, condition, detail = '') {
    results.push({ name, pass: Boolean(condition), detail });
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail && !condition ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- source files
const htmlPath = join(here, 'vendor-onboarding.html');
const jsPath = join(here, 'js', 'vendor-onboarding.js');
const migrationPath = join(here, '..', 'supabase', 'migrations', '0026_vendor_applications.sql');

check('vendor-onboarding.html exists', existsSync(htmlPath));
check('frontend/js/vendor-onboarding.js exists', existsSync(jsPath));
check('migration 0026_vendor_applications.sql exists', existsSync(migrationPath));

const html = readFileSync(htmlPath, 'utf8');
const js = readFileSync(jsPath, 'utf8');
const migration = readFileSync(migrationPath, 'utf8');

// ---------------------------------------------------------------- html wiring
check('1. HTML imports vendor-onboarding.js module',
    html.includes('js/vendor-onboarding.js'));
check('1b. module script is type="module"', /type="module"/.test(html));

check('2. fake toast-only submission removed',
    !html.includes("showToast('success', 'Application submitted successfully!'") &&
    !html.includes('Application submitted successfully!') && js.includes('Application submitted successfully.'),
    'legacy hardcoded toast text must not remain in HTML');

check('3. Supabase RPC name is submit_vendor_application',
    js.includes('submit_vendor_application') && js.includes('rpc('));

check('4. no browser direct INSERT into vendor_applications',
    !js.includes("from('vendor_applications')"),
    'browser must not touch vendor_applications table directly');

// ---------------------------------------------------------------- status / reviewer isolation
const unsafeWriteIndicators = [/\bstatus\s*:/i, /APPROVED/, /UNDER_REVIEW/, /NEEDS_INFORMATION/, /reviewed_by/i, /review_notes/i, /reviewed_at/i];
const submissionCall = js.slice(js.indexOf('submit_vendor_application'), js.indexOf('submit_vendor_application') + 3000);
check('5. frontend cannot set APPROVED or any lifecycle status',
    !unsafeWriteIndicators.some(r => r.test(submissionCall)),
    'submission payload must contain no status field');
check('6. frontend cannot provide reviewer fields',
    !submissionCall.includes('reviewed_by') && !/\breviewer\b/i.test(submissionCall),
    'submission payload must contain no reviewer fields');

// ---------------------------------------------------------------- campus integration
check('7. active campuses loaded from Supabase campuses table',
    js.includes("from('campuses')") && js.includes('is_active'),
    'campus dropdown must be populated from live campuses');
check('7b. no hardcoded UNIMAID campus value in submission logic',
    !js.includes("value: 'unimaid'") && !js.includes("id: 'unimaid'"));

// ---------------------------------------------------------------- submit UX
check('8. submit button disabled while processing', js.includes('btn.disabled = submitting'));
check('9. duplicate-click protection exists', /submitting|isSubmitting/.test(js));
check('10. application number displayed after success',
    js.includes('application_number') && js.includes('Application Number'));
check('11. Pending Review displayed', js.includes('Pending Review'));

// ---------------------------------------------------------------- whatsapp
check('12. official WhatsApp destination is 2349150736638',
    js.includes("WA_ME_NUMBER = '2349150736638'") && js.includes('wa.me/'),
    'wa.me link must use the official machine-form number');

// ---------------------------------------------------------------- legacy express
const legacyPatterns = ['/api/vendors', 'localhost:3000', 'localhost:4000', 'fetchJson(', 'clx_auth_token'];
check('13. no legacy Express onboarding endpoint',
    !legacyPatterns.some(p => html.toLowerCase().includes(p) || js.toLowerCase().includes(p)),
    `found legacy reference: ${legacyPatterns.filter(p => html.toLowerCase().includes(p) || js.toLowerCase().includes(p)).join(', ')}`);

// ---------------------------------------------------------------- credentials
const secretPatterns = ['SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_', 'DATABASE_PASSWORD', 'private_key', 'service_role_key'];
check('14. no service-role credential anywhere in onboarding',
    !secretPatterns.some(p => html.includes(p) || js.includes(p)),
    `found secret reference: ${secretPatterns.filter(p => html.includes(p) || js.includes(p)).join(', ')}`);

// ---------------------------------------------------------------- no live vendor creation
const liveTables = ['vendors', 'vendor_campuses', 'user_roles', 'products', 'services'];
check('15. no live vendor creation from browser',
    !liveTables.some(t => js.includes(`from('${t}')`) || js.includes(`from("${t}")`)),
    'submission must only hit submit_vendor_application RPC');

// ---------------------------------------------------------------- migration static review
check('migration enables RLS on vendor_applications',
    /alter table public\.vendor_applications enable row level security/i.test(migration));
check('migration has no anon SELECT policy on vendor_applications',
    !/create policy[\s\S]{0,200}vendor_applications[\s\S]{0,200}for select[\s\S]{0,100}to\s+(anon|public)/i.test(migration));
check('migration has no anon UPDATE policy on vendor_applications',
    !/create policy[\s\S]{0,200}vendor_applications[\s\S]{0,200}for update[\s\S]{0,100}to\s+(anon|public)/i.test(migration));
check('migration has no anon DELETE policy on vendor_applications',
    !/create policy[\s\S]{0,200}vendor_applications[\s\S]{0,200}for delete[\s\S]{0,100}to\s+(anon|public)/i.test(migration));
check('migration has no broad anon INSERT policy on vendor_applications',
    !/create policy[\s\S]{0,300}vendor_applications[\s\S]{0,300}for insert[\s\S]{0,100}to\s+(anon|public)/i.test(migration),
    'submission must go through RPC, not direct anon INSERT');
check('migration marks RPC SECURITY DEFINER',
    /security definer/i.test(migration));
check('migration hardens search_path',
    /set search_path = ''/i.test(migration) ||
    /set search_path = pg_catalog, public, pg_temp/i.test(migration));
check('migration forces status PENDING in RPC',
    /'PENDING'::public\.vendor_application_status/.test(migration));
check('migration has no status input parameter on RPC',
    !/status\s+vendor_application_status\s*,?/i.test(migration.split('submit_vendor_application')[1] || ''));
check('migration has no reviewer input parameter on RPC',
    !/reviewed_by/i.test(migration.split('submit_vendor_application')[1] || ''));
check('migration generates application number server-side',
    /CLX-VA-/.test(migration) && /_vendor_app_next_number/.test(migration));
check('migration revokes then grants execute to anon/authenticated',
    /revoke all on function public\.submit_vendor_application/i.test(migration) &&
    /grant execute on function public\.submit_vendor_application\([\s\S]*?\)\s+to anon/i.test(migration));
check('migration locks down application number helper from anon/authenticated',
    /revoke all on function public\._vendor_app_next_number\(int\) from public, anon, authenticated/i.test(migration));
check('migration does not insert into vendors/vendor_campuses/user_roles/products/services',
    !/insert\s+into\s+public\.(vendors|vendor_campuses|user_roles|products|services)\b/i.test(migration));
check('migration does not alter existing protected tables',
    !/alter table public\.(vendors|products|orders|payments|services|campuses)\b/i.test(migration) ||
    !/drop (table|column|policy)/i.test(migration),
    'only additive statements allowed');
check('migration adds updated_at trigger on vendor_applications', /set_updated_at/.test(migration));
check('migration validates active campus inside RPC',
    /v_campus_active\s+is\s+not\s+true/i.test(migration));
check('migration includes duplicate-submission window check',
    /clock_timestamp\(\)\s*-\s*interval/i.test(migration) && /duplicate/i.test(migration));
check('migration does not return internal UUID from RPC',
    !/application_uuid/i.test(migration));

// ---------------------------------------------------------------- Phase 4E.1 repair: existing production table safety
check('repair: migration never drops/truncates the existing table',
    !/drop\s+table[\s\S]{0,40}vendor_applications/i.test(migration) &&
    !/truncate\s+(table\s+)?public\.vendor_applications/i.test(migration) &&
    !/^\s*truncate/im.test(migration));
check('repair: migration guards that existing table must be present',
    /vendor_applications does not exist/i.test(migration));
check('repair: unsafe public insert policy explicitly dropped',
    /drop policy if exists vendor_applications_insert_public on public\.vendor_applications/i.test(migration));
check('repair: existing TEXT status migrated to enum',
    /alter column status type public\.vendor_application_status/i.test(migration));
check('repair: existing status values normalized before conversion',
    /update public\.vendor_applications set status/i.test(migration));
check('repair: application_number becomes NOT NULL',
    /alter column application_number set not null/i.test(migration));
check('repair: application_number gets UNIQUE constraint',
    /add constraint vendor_applications_application_number_key unique \(application_number\)/i.test(migration));
check('repair: reviewed_by reused (no duplicate reviewer column)',
    !/add column if not exists reviewed_by_user_id/i.test(migration) &&
    /add column if not exists reviewed_at/i.test(migration) &&
    /add column if not exists review_notes/i.test(migration));
check('repair: zero-row migration — no destructive backfill or row deletion',
    !/delete from public\.vendor_applications/i.test(migration));
check('repair: five-state lifecycle enum created',
    /create type public\.vendor_application_status as enum/i.test(migration) &&
    /'PENDING'\s*,\s*'UNDER_REVIEW'\s*,\s*'APPROVED'\s*,\s*'REJECTED'\s*,\s*'NEEDS_INFORMATION'/s.test(migration));
check('repair: old TEXT status CHECK dropped before conversion',
    /drop constraint if exists.*status/i.test(migration));
check('repair: campus_slug derived from campuses table server-side',
    /select c\.slug, c\.short_name, c\.name, c\.is_active\s+into v_campus_slug, v_campus_short, v_campus_name, v_campus_active\s+from public\.campuses/i.test(migration));
check('repair: slug generated server-side from business name + application number',
    /v_slug.*\|\|.*v_application_number|lower\(regexp_replace\(v_business_name/i.test(migration));
check('repair: RPC returns only safe fields (no internal UUID exposure)',
    /select v_application_number as application_number/.test(migration) &&
    /as status, v_submitted_at as submitted_at/.test(migration) &&
    !/returning id|returning \*/i.test(migration));
check('repair: verification script is read-only',
    !/insert into|update |delete from|\.rpc\(/i.test(readFileSync(join(here, '..', 'verify_phase4e1_v2.mjs'), 'utf8')));
check('repair: direct write privileges revoked from anon and authenticated',
    /revoke all on public\.vendor_applications from public, anon, authenticated/i.test(migration));
check('repair: anon SELECT revoked',
    /revoke all on public\.vendor_applications from public, anon, authenticated/i.test(migration));
check('repair: counter table locked from anon/authenticated',
    /revoke all on public\.vendor_application_counters from public, anon, authenticated/i.test(migration));
check('repair: hardened search_path on SECURITY DEFINER functions',
    /set search_path = pg_catalog, public, pg_temp/i.test(migration));
check('repair: updated_at trigger does not duplicate',
    /drop trigger if exists trg_vendor_applications_updated_at/i.test(migration));

// Contracts below strip comments and normalize whitespace, rather than matching prose.
const sql = migration.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const declaration = sql.match(/function public\.submit_vendor_application\((.*?)\) returns table/)[1];
const params = declaration.split(',').map(x => x.trim());
check('SQL: legacy CHECK removal is table-qualified', sql.includes('alter table public.vendor_applications drop constraint if exists vendor_applications_status_check;') && !/(?:begin|;) drop constraint/.test(sql));
check('SQL: required inputs precede optional inputs', params.length === 9 && params.slice(0, 7).every(p => !p.includes('default')) && params.slice(7).every(p => p.endsWith('text default null')));
check('RPC: parameter names match frontend payload exactly', params.map(p => p.split(' ')[0]).sort().join() === [...js.matchAll(/\b(p_\w+):/g)].map(m => m[1]).sort().join());
check('RPC: required parameter order is explicit', params.slice(0,7).map(p=>p.split(' ')[0]).join() === 'p_campus_id,p_business_name,p_contact_name,p_phone_number,p_whatsapp_number,p_category_slug,p_location');
const padding = sql.match(/lpad\(v_seq::text, greatest\((\d+), length\(v_seq::text\)\), '0'\)/);
check('number: padding grows with sequence length', Boolean(padding));
for (const [n, expected] of [[1,'0001'],[42,'0042'],[9999,'9999'],[10000,'10000'],[10001,'10001']]) {
    const actual = padding && String(n).padStart(Math.max(Number(padding[1]), String(n).length), '0');
    check(`number: ${n} formats as ${expected}`, actual === expected);
}
// Execute the regular expressions extracted from the real SQL phone helper.
const phoneBody = sql.match(/function public\._vendor_app_normalize_ng_phone.*?as \$\$(.*?)end \$\$/)[1];
const stripPattern = phoneBody.match(/regexp_replace\(coalesce\(p_raw, ''\), '([^']+)'/)[1];
const validPattern = phoneBody.match(/if v !~ '([^']+)' then return null/)[1];
function normalizePhone(raw) {
    let v = (raw ?? '').replace(new RegExp(stripPattern, 'g'), '');
    if (!new RegExp(validPattern).test(v)) return null;
    if (v.startsWith('+')) v = v.slice(1);
    else if (v.startsWith('0')) v = '234' + v.slice(1);
    return '+' + v;
}
check('phone: accepted branches match SQL normalization', phoneBody.includes("if left(v, 1) = '+' then v := substr(v, 2); elsif left(v, 1) = '0' then v := '234' || substr(v, 2);") && phoneBody.includes("return '+' || v"));
for (const raw of ['09150736638','2349150736638','+2349150736638','+234 (915) 073-6638']) check(`phone accepts ${raw}`, normalizePhone(raw) === '+2349150736638');
for (const raw of ['abc09150736638','+23491+50736638','12345','++2349150736638','234915073663','23491507366388','1234567890','',null]) check(`phone rejects ${JSON.stringify(raw)}`, normalizePhone(raw) === null);
check('phone: both fields use the same private helper', sql.includes('v_phone := public._vendor_app_normalize_ng_phone(p_phone_number)') && sql.includes('v_whatsapp := public._vendor_app_normalize_ng_phone(p_whatsapp_number)'));
const lock = sql.indexOf('perform pg_advisory_xact_lock(');
const duplicate = sql.indexOf('if exists ( select 1 from public.vendor_applications va');
const insert = sql.indexOf('insert into public.vendor_applications (');
check('duplicate: transaction lock precedes duplicate SELECT and INSERT', lock >= 0 && duplicate > lock && insert > duplicate);
check('duplicate: lock key covers exact normalized identity', sql.includes('jsonb_build_array(p_campus_id, lower(v_business), v_whatsapp)::text, 0)') && sql.includes('lower(btrim(va.business_name)) = lower(v_business)') && sql.includes('va.whatsapp_number = v_whatsapp'));
check('duplicate: five-minute window permits later reapplication', sql.includes("va.submitted_at > clock_timestamp() - interval '5 minutes'") && !/unique \(campus_id/.test(sql));
check('grants: PUBLIC and both browser roles revoked before admin grants', sql.indexOf('revoke all on public.vendor_applications from public, anon, authenticated;') < sql.indexOf('grant select, update on public.vendor_applications to authenticated;'));
check('grants: admin UPDATE requires is_admin in USING and WITH CHECK', /for update to authenticated using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/.test(sql) && sql.includes('grant select, update on public.vendor_applications to authenticated;'));
check('grants: no browser INSERT/DELETE grant', !/grant (?:all|insert|delete).*?on public\.vendor_applications/.test(sql));
check('campus: NULL/false both rejected', sql.includes('if v_campus_active is not true then'));
check('campus: stored slug then normalized short/name fallbacks, then reject', sql.includes("v_campus_slug := nullif(lower(btrim(v_campus_slug)), '')") && sql.includes("regexp_replace(coalesce(v_campus_short, ''), '[^a-zA-Z0-9]+', '-', 'g')") && sql.includes("regexp_replace(coalesce(v_campus_name, ''), '[^a-zA-Z0-9]+', '-', 'g')") && sql.includes("if v_campus_slug is null then raise exception 'Campus record has no usable slug/identifier.'"));
check('helper: phone normalizer inaccessible to browser roles', sql.includes('revoke all on function public._vendor_app_normalize_ng_phone(text) from public, anon, authenticated;'));
for (const file of ['verify_phase4e1_v2.mjs','scripts/verify_phase4e1.mjs','scripts/verify_phase4e1_v2.mjs']) {
    const verifier = readFileSync(join(here, '..', file), 'utf8').replace(/\/\/[^\n]*/g, '');
    check(`verifier is read-only: ${file}`, !/\.(insert|update|delete|upsert|rpc)\s*\(/.test(verifier) && !/\b(?:exec|spawn|query)\s*\(/.test(verifier));
}
// Import actual frontend logic without a document: auto-init and network calls cannot run.
const onboarding = await import('./js/vendor-onboarding.js');
for (const data of [null, [], {}, [{application_number:'',status:'PENDING'}], [{application_number:'   ',status:'PENDING'}], [{application_number:'CLX-VA-2026-0001'}], [{application_number:'CLX-VA-2026-0001',status:'APPROVED'}]]) {
    check(`response rejects ${JSON.stringify(data)}`, onboarding.getSubmittedApplication({success:true,data}) === null);
}
check('response accepts one confirmed application', onboarding.getSubmittedApplication({success:true,data:[{application_number:'CLX-VA-2026-0001',status:'PENDING'}]})?.status === 'PENDING');
check('response error never accepted', onboarding.getSubmittedApplication({success:false,data:{application_number:'CLX-VA-2026-0001',status:'PENDING'}}) === null);
check('response gate precedes success/reset, preserves invalid form', /const app = getSubmittedApplication\(result\);\s*if \(app\) \{\s*showSuccess\(app\);\s*form.reset\(\);/.test(js));
for (const [id, field, limit] of [['onboard-business-name','business',150],['onboard-contact-person','contact',120],['onboard-location','location',200],['onboard-description','description',2000],['onboard-email','email',254]]) {
    const tag = html.match(new RegExp('<(?:input|textarea)[^>]*id="'+id+'"[^>]*>'))?.[0] || '';
    check(`length limit ${field}: HTML/server agree`, tag.includes(`maxlength="${limit}"`) && new RegExp('length\\((?:coalesce\\()?v_'+field+'(?:, \'\'\\))?\\) > '+limit).test(sql));
}
// Real client validation at boundaries; document is a local stub, no RPC is called.
const formValues = {
    'onboard-campus-select': '11111111-1111-4111-8111-111111111111',
    'onboard-business-name': 'Test Business', 'onboard-contact-person': 'Test Contact',
    'onboard-phone': '09150736638', 'onboard-whatsapp': '+2349150736638',
    'onboard-email': '', 'onboard-category': 'food', 'onboard-location': 'Campus shop',
    'onboard-description': ''
};
globalThis.document = { getElementById: id => ({ value: formValues[id] }) };
check('client: valid form returns named RPC payload', Boolean(onboarding.validateForm().payload));
for (const [id, limit] of [['onboard-business-name',150],['onboard-contact-person',120],['onboard-location',200],['onboard-description',2000],['onboard-email',254]]) {
    const original = formValues[id];
    formValues[id] = id === 'onboard-email' ? 'a'.repeat(limit - 6) + '@x.com' : 'a'.repeat(limit);
    check(`client: ${id} accepts boundary ${limit}`, Boolean(onboarding.validateForm().payload));
    formValues[id] = 'a' + formValues[id];
    check(`client: ${id} rejects ${limit + 1}`, Boolean(onboarding.validateForm().error));
    formValues[id] = original;
}
delete globalThis.document;
// ---------------------------------------------------------------- summary
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
    console.log('FAILED CHECKS:');
    failed.forEach(f => console.log(` - ${f.name}`));
    process.exit(1);
}
console.log('ALL PHASE 4E.1 VENDOR ONBOARDING TESTS PASSED');
