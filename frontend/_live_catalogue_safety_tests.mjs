import { readFile } from 'node:fs/promises';

const catalogueSource = await readFile(new URL('./js/catalogue.js', import.meta.url), 'utf8');
const checkoutSource = await readFile(new URL('./js/customer-orders.js', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
const test = (name, condition) => {
    if (condition) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}`); }
};

test('product query has no direct products-to-campuses embed', !catalogueSource.includes('campuses(slug, name)'));
test('product query has no direct products-to-vendors embed', !catalogueSource.includes('vendors(name, slug, status)'));
test('campus filtering uses the real campus UUID column', catalogueSource.includes("query.eq('campus_id', selectedCampus.id)"));
test('active vendor-campus pairs gate live products', catalogueSource.includes('activeVendorCampusPairs.has'));
test('live normalized products carry provenance', catalogueSource.includes("isLiveProduct: true"));
test('checkout rejects untagged fallback products', checkoutSource.includes('item.isLiveProduct !== true'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);