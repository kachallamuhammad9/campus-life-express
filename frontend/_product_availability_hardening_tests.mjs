import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260916140443_enforce_product_availability_at_checkout.sql');
const admin = read('./js/admin-products.js');
const cart = read('./js/app.js');
const catalogue = read('./js/catalogue.js');
const api = read('./js/api.js');
const food = read('./food.html');
const shopping = read('./shopping.html');
const lifecycle = read('./js/admin-lifecycle.js');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS: ${name}`); };

test('uses the single canonical products.is_in_stock field', () => {
    assert.match(admin, /p_patch: patch/);
    assert.match(admin, /is_in_stock: !product\.is_in_stock/);
    assert.match(catalogue, /isInStock: row\.is_in_stock/);
});
test('admin availability control is distinct from archive/delete lifecycle controls', () => {
    assert.match(admin, /Mark Out of Stock/);
    assert.match(admin, /Mark Available/);
    assert.match(admin, /admin_update_product/);
    assert.match(lifecycle, /admin_archive/);
    assert.match(lifecycle, /admin_delete/);
    assert.match(lifecycle, /is_active,is_in_stock/);
    assert.match(lifecycle, /Current availability:/);
    assert.match(lifecycle, /Mark Out of Stock/);
    assert.match(lifecycle, /Mark Available/);
    assert.match(lifecycle, /adminUpdateProduct\(id, \{ is_in_stock: available \}, client\)/);
});
test('catalogue cards render an Out of Stock badge and disable add-to-cart', () => {
    for (const page of [food, shopping]) {
        assert.match(page, /Out of Stock/);
        assert.match(page, /disabled aria-disabled="true"/);
        assert.match(page, /data-in-stock="\$\{p\.isInStock !== false\}"/);
    }
});
test('cart delegate rejects a stale unavailable product before adding it locally', () => {
    assert.match(cart, /card\.dataset\.inStock === "false"/);
    assert.match(cart, /currently unavailable/);
});
test('customer and Android-compatible product responses expose is_in_stock', () => {
    assert.match(catalogue, /is_in_stock, stock_quantity/);
    assert.match(api, /isInStock: p\.is_in_stock/);
});
test('checkout revalidates active and in-stock state on the locked product row', () => {
    assert.match(migration, /select p\.\* into v_product from public\.products p where p\.id = v_product_id for update/);
    assert.match(migration, /not coalesce\(v_product\.is_active, false\) or not v_product\.is_in_stock/);
    assert.match(migration, /PRODUCT_UNAVAILABLE/);
    assert.match(migration, /Please remove it from your cart and try again\./);
});
test('unavailable validation precedes all customer-order, payment, delivery, and order-number writes', () => {
    const check = migration.indexOf('not coalesce(v_product.is_active, false)');
    for (const write of ['v_order_number := public.next_customer_order_number()', 'insert into public.customer_orders', 'insert into public.orders', 'insert into public.order_items', 'insert into public.customer_order_payments', 'insert into public.delivery_requests']) {
        assert(check >= 0 && check < migration.indexOf(write), `${write} must follow availability validation`);
    }
});
test('checkout forwards the safe backend rejection without clearing the customer cart', () => {
    assert.match(api, /message: result\.data\?\.message \|\| 'We could not place your order\.'/);
    assert.match(read('./orders.html'), /if \(!orderResult\.success\)/);
});
test('archive remains the safe path for products with historical order references', () => {
    assert.match(read('../supabase/migrations/0035_lifecycle_dependency_details.sql'), /order_items/);
    assert.match(read('../supabase/migrations/0035_lifecycle_dependency_details.sql'), /archive it instead/);
});

console.log(`\n${passed} passed, 0 failed`);
