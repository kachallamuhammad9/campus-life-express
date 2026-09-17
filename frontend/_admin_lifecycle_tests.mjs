import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(root, '..', 'supabase', 'migrations', '0034_admin_lifecycle_management.sql'), 'utf8');
const ui = readFileSync(join(root, 'js', 'admin-lifecycle.js'), 'utf8');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');
const productSql = readFileSync(join(root, '..', 'supabase', 'migrations', '0029_admin_product_management.sql'), 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS: ${name}`); };

test('all lifecycle RPCs require admin authorization', () => {
    assert.ok((migration.match(/perform public\._admin_lifecycle_guard\(\)/g) || []).length >= 9);
    assert.match(migration, /grant execute on function[\s\S]*to authenticated,service_role/);
    assert.match(migration, /revoke all on function[\s\S]*from public,anon/);
});

test('rider delete archives when delivery history exists', () => assert.match(migration, /from public\.delivery_requests where rider_id=p_rider_id/));
test('product delete protects orders carts and reviews', () => {
    for (const marker of ['public.order_items', 'public.cart_items', 'public.product_reviews']) assert.match(migration, new RegExp(marker));
});
test('vendor delete protects catalogue and operational dependencies', () => {
    for (const marker of ['public.products', 'public.services', 'public.orders', 'public.vendor_reviews', 'public.service_requests', 'public.vendor_campuses']) assert.match(migration, new RegExp(marker));
});
test('service delete protects service requests', () => assert.match(migration, /from public\.service_requests where service_id=p_service_id/));
test('bulk product operations evaluate selected records independently', () => {
    assert.match(migration, /admin_bulk_delete_products/);
    assert.match(migration, /foreach product_id in array p_product_ids/);
    assert.match(migration, /admin_delete_product\(product_id\)/);
    assert.match(migration, /admin_bulk_archive_products/);
});
test('products have an archive flag and public policy excludes archived products', () => {
    assert.match(migration, /alter table public\.products add column if not exists is_active boolean not null default true/);
    assert.match(migration, /create policy products_select_public[\s\S]*is_active and exists/);
});
test('UI exposes confirmation, processing, archive, restore, delete, and bulk controls', () => {
    for (const marker of ['showModal', 'Processing...', 'Archive Selected', 'Delete Selected', 'data-select-all', 'data-action']) assert.match(ui, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(admin, /createAdminLifecycle/);
});
test('existing product RPC architecture remains direct-write-free', () => {
    assert.match(productSql, /revoke insert, update, delete on public\.products/);
    assert.doesNotMatch(ui, /from\(['"](products|vendors|riders|services)['"]\)\.(insert|update|delete|upsert)/);
});
test('no lifecycle mutation includes destructive cascade or transactional-table deletion', () => {
    assert.doesNotMatch(migration, /truncate|drop table|customer_orders.*delete|orders.*delete|order_items.*delete|delivery_requests.*delete|customer_order_payments.*delete/i);
});

console.log(`\n${passed} passed, 0 failed`);
