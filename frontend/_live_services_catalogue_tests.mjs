import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePublicServices, serviceContactUrl, serviceImage, servicePriceLabel, SERVICE_PLACEHOLDER } from './js/service-catalogue.js';

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS: ${name}`); }
const context = {
    vendors: [{ id: 'vendor', name: '<Vendor>', status: 'ACTIVE', is_verified: true }, { id: 'unverified', name: 'Unverified', status: 'ACTIVE', is_verified: false }],
    campuses: [{ id: 'campus', slug: 'unimaid', name: 'University of Maiduguri', is_active: true }, { id: 'inactive-campus', slug: 'kiu', name: 'Kashim Ibrahim University', is_active: false }],
    categories: [{ id: 'root', slug: 'services', name: 'Campus Services', parent_id: null, is_active: true }, { id: 'child', slug: 'printing', name: 'Printing', parent_id: 'root', is_active: true }, { id: 'food', slug: 'food', name: 'Food', parent_id: null, is_active: true }, { id: 'inactive-child', slug: 'inactive', name: 'Inactive', parent_id: 'root', is_active: false }],
    pairs: [{ vendor_id: 'vendor', campus_id: 'campus', is_active: true }]
};
const base = { id: 'service', slug: 'print', name: '<Print>', description: '<description>', vendor_id: 'vendor', campus_id: 'campus', category_id: 'root', subcategory_id: 'child', starting_price_kobo: 500000, price_type: 'FIXED', image_url: null, turnaround_time: null, requires_file_upload: false, requires_appointment: false, is_active: true };
const rows = (overrides = {}, filters = {}) => normalizePublicServices([{ ...base, ...overrides }], context, filters);

await test('authoritative eligible service normalizes without invented rating/review data', () => {
    const [service] = rows();
    assert.equal(service.source, 'supabase'); assert.equal(service.providerName, '<Vendor>'); assert.equal('rating' in service, false); assert.equal('reviewCount' in service, false);
});
await test('inactive service, vendor, campus, association, root and child are excluded', () => {
    assert.equal(rows({ is_active: false }).length, 0); assert.equal(rows({ vendor_id: 'unverified' }).length, 0);
    assert.equal(rows({ campus_id: 'inactive-campus' }).length, 0); assert.equal(rows({ category_id: 'food' }).length, 0);
    assert.equal(rows({ subcategory_id: 'inactive-child' }).length, 0); assert.equal(normalizePublicServices([base], { ...context, pairs: [] }).length, 0);
});
await test('legacy invalid hierarchy and inactive-campus records stay hidden', () => {
    assert.equal(rows({ category_id: 'food', subcategory_id: 'child' }).length, 0);
    assert.equal(rows({ campus_id: 'inactive-campus' }).length, 0);
});
await test('campus, category, subcategory and search filters apply to normalized live data', () => {
    assert.equal(rows({}, { campus: 'unimaid' }).length, 1); assert.equal(rows({}, { campus: 'other' }).length, 0);
    assert.equal(rows({}, { category: 'services' }).length, 1); assert.equal(rows({}, { subcategory: 'printing' }).length, 1);
    assert.equal(rows({}, { search: 'vendor' }).length, 1); assert.equal(rows({}, { search: 'missing' }).length, 0);
});
await test('pricing labels preserve fixed, starting-from and quote semantics', () => {
    assert.equal(servicePriceLabel('FIXED', 500000), '₦5,000'); assert.equal(servicePriceLabel('STARTING_FROM', 500000), 'From ₦5,000');
    assert.equal(servicePriceLabel('QUOTE', null), 'Request quote'); assert.match(servicePriceLabel('QUOTE', 500000), /^Request quote/);
});
await test('image handling uses a placeholder for null or unsafe URLs', () => {
    assert.equal(serviceImage(null), SERVICE_PLACEHOLDER); assert.equal(serviceImage('javascript:alert(1)'), SERVICE_PLACEHOLDER);
    assert.equal(serviceImage('https://example.com/image.png'), 'https://example.com/image.png');
});
await test('WhatsApp CTA has no internal ID/token and creates no request/order', () => {
    const url = serviceContactUrl(rows()[0]); assert.match(url, /^https:\/\/wa\.me\/2349150736638\?text=/);
    assert.equal(url.includes('service'), false); assert.equal(url.includes('token'), false); assert.equal(url.includes('service_requests'), false);
});
await test('services page imports the live module and no retired API/request flow', () => {
    const source = readFileSync(new URL('./services.html', import.meta.url), 'utf8');
    assert.match(source, /initServicesPage/); assert.doesNotMatch(source, /api\.services\.list|requestService|service-request-modal|RETIRED_API/);
});
await test('safe card renderer uses DOM text and attributes, not raw service innerHTML', () => {
    const source = readFileSync(new URL('./js/services-page.js', import.meta.url), 'utf8');
    assert.match(source, /textContent/); assert.doesNotMatch(source, /innerHTML/);
});
console.log(`LIVE SERVICES CATALOGUE: ${passed}/${passed} PASS`);