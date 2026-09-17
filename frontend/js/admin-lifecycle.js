import { getSupabaseClient } from './supabase.js';
import { adminUpdateProduct } from './admin-products.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const safeError = error => error?.message && !/sql|postgres|uuid|stack|token|secret|policy/i.test(error.message) ? error.message : 'The lifecycle operation could not be completed.';

export function createAdminLifecycle(root, client = getSupabaseClient(), { editProduct, onProductChanged } = {}) {
    let busy = false;
    root.innerHTML = '<section style="border-top:1px solid #CBD5E1;padding-top:24px;margin-top:24px"><h2 style="font-size:18px;margin:0 0 8px">Archive & Delete Management</h2><p style="font-size:13px;color:var(--gray-600);margin:0 0 16px">Unused records may be permanently deleted. Records with operational history can only be archived.</p><div id="lifecycle-message" role="status" style="min-height:20px;margin-bottom:12px"></div><div id="lifecycle-panels" style="display:grid;gap:16px"></div></section>';
    const message = root.querySelector('#lifecycle-message');
    const panels = root.querySelector('#lifecycle-panels');
    const setMessage = (text, error = false) => { message.textContent = text; message.style.color = error ? '#B91C1C' : '#15803D'; };
    const button = (text, attrs) => `<button type="button" ${attrs || ''} style="padding:6px 9px;border:1px solid #CBD5E1;border-radius:7px;background:#fff;font-size:11px;cursor:pointer">${text}</button>`;
    const section = (title, body) => `<section style="border:1px solid #E2E8F0;border-radius:10px;padding:14px"><h3 style="font-size:15px;margin:0 0 10px">${title}</h3>${body}</section>`;
    const rpc = async (name, payload) => { const { data, error } = await client.rpc(name, payload); if (error) return { success:false, message:safeError(error) }; return data || { success:false, message:'The operation returned no result.' }; };
    const confirmDialog = (title, text, confirmText) => new Promise(resolve => {
        const dialog = document.createElement('dialog'); dialog.style.cssText = 'border:0;border-radius:14px;padding:24px;max-width:420px;width:calc(100% - 32px)';
        dialog.innerHTML = `<h3>${esc(title)}</h3><p style="font-size:13px;line-height:1.5;color:#475569">${esc(text)}</p><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-cancel>Cancel</button><button type="button" data-confirm style="background:#B91C1C;color:#fff;border:0;padding:8px 12px;border-radius:7px">${esc(confirmText)}</button></div>`;
        document.body.append(dialog); dialog.showModal(); const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        dialog.querySelector('[data-cancel]').onclick = () => finish(false); dialog.querySelector('[data-confirm]').onclick = event => { event.currentTarget.disabled = true; event.currentTarget.textContent = 'Processing...'; finish(true); };
    });
    async function load(table, select) { const { data, error } = await client.from(table).select(select).order('created_at', { ascending:false }); if (error) throw error; return data || []; }
    async function run(buttonEl, action) { if (busy) return; busy = true; buttonEl.disabled = true; const old = buttonEl.textContent; buttonEl.textContent = 'Processing...'; try { const result = await action(); setMessage(result.message || (result.success ? 'Completed.' : 'Operation failed.'), !result.success); await init(); } catch (error) { setMessage(safeError(error), true); } finally { busy = false; buttonEl.disabled = false; buttonEl.textContent = old; } }
    function renderEntityRows(items, kind, active) { return items.map(item => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #F1F5F9;flex-wrap:wrap"><span><strong>${esc(item.name)}</strong><small style="display:block;color:#64748B">${active(item) ? 'Active' : 'Archived'}</small></span><span>${kind === 'Vendor' ? button('Edit', `data-action="edit" data-kind="Vendor" data-id="${esc(item.id)}" data-label="${esc(item.name)}"`) : ''} ${button(active(item) ? 'Archive' : 'Restore', `data-action="${active(item) ? 'archive' : 'restore'}" data-kind="${kind}" data-id="${esc(item.id)}" data-label="${esc(item.name)}"`)} ${button('Delete', `data-action="delete" data-kind="${kind}" data-id="${esc(item.id)}" data-label="${esc(item.name)}"`)}</span></div>`).join('') || '<p style="font-size:13px;color:#64748B">No records found.</p>'; }
    function attachHandlers(products) {
        panels.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', async () => {
            if (busy) return;
            const action = el.dataset.action, kind = el.dataset.kind, id = el.dataset.id, label = el.dataset.label;
            if (kind === 'Product' && action === 'edit') {
                try { await editProduct?.(id); } catch (error) { setMessage(safeError(error), true); }
                return;
            }
            if (kind === 'Product' && action === 'availability') {
                const product = products.find(p => p.id === id);
                if (!product?.is_active) return;
                const available = !product.is_in_stock;
                const ok = await confirmDialog(available ? 'Mark Available?' : 'Mark Out of Stock?', `${label}: change availability for new orders. Archive and Delete are separate actions.`, available ? 'Mark Available' : 'Mark Out of Stock');
                if (!ok) return;
                await run(el, async () => {
                    const result = await adminUpdateProduct(id, { is_in_stock: available }, client);
                    if (!result.success) return { success:false, message:safeError({ message:result.error }) };
                    await onProductChanged?.();
                    return { success:true, message:result.product.is_in_stock ? 'Product is now Available.' : 'Product is Out of Stock.' };
                });
                return;
            }
            if (action === 'edit') {
                const name = window.prompt('Vendor name', label);
                if (!name || !name.trim() || busy) return;
                await run(el, () => rpc('admin_update_vendor', { p_vendor_id:id, p_patch:{ name:name.trim() } }));
                return;
            }
            const ok = await confirmDialog(`${action === 'delete' ? 'Delete' : action === 'restore' ? 'Restore' : 'Archive'} ${kind}?`, action === 'delete' ? `${label} is permanently deleted only when the database confirms it has no operational or historical references.` : `${label} will remain available for historical records but unavailable for new operations.`, action === 'delete' ? 'Delete Permanently' : action === 'restore' ? 'Restore' : 'Archive');
            if (!ok) return;
            const payload = action === 'restore' ? { p_restore:true } : {};
            await run(el, () => rpc(`${action === 'delete' ? 'admin_delete' : 'admin_archive'}_${kind.toLowerCase()}`, { [`p_${kind.toLowerCase()}_id`]: id, ...payload }));
        }));
        panels.querySelector('[data-select-all]')?.addEventListener('change', e => panels.querySelectorAll('[data-product-check]').forEach(c => c.checked = e.target.checked));
        panels.querySelectorAll('[data-bulk-action]').forEach(el => el.addEventListener('click', async () => {
            const ids = [...panels.querySelectorAll('[data-product-check]:checked')].map(c => c.value); if (!ids.length) return;
            const ok = await confirmDialog(`${el.dataset.bulkAction === 'delete' ? 'Delete' : 'Archive'} selected products?`, `${ids.length} product(s) will be evaluated independently for history.`, el.dataset.bulkAction === 'delete' ? 'Delete Selected' : 'Archive Selected'); if (!ok) return;
            await run(el, async () => el.dataset.bulkAction === 'delete' ? rpc('admin_bulk_delete_products', { p_product_ids:ids }) : rpc('admin_bulk_archive_products', { p_product_ids:ids }));
        }));
    }
    async function init() {
        if (!client) return;
        try {
            const [riders, products, vendors, services] = await Promise.all([load('riders','id,name,is_active,created_at'), load('products','id,name,vendor_id,is_active,is_in_stock,created_at'), load('vendors','id,name,status,created_at'), load('services','id,name,is_active,created_at')]);
            const productBody = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${button('Archive Selected','data-bulk-action="archive"')}${button('Delete Selected','data-bulk-action="delete"')}</div><label style="font-size:12px"><input type="checkbox" data-select-all> Select all</label>${products.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid #F1F5F9" data-lifecycle-product="${esc(p.id)}"><label><input type="checkbox" value="${esc(p.id)}" data-product-check> ${esc(p.name)} <small style="color:#64748B">${p.is_active ? 'Active' : 'Archived'}</small><small style="display:block;color:#64748B">Vendor: ${esc(vendors.find(v => v.id === p.vendor_id)?.name || 'Unknown vendor')}</small>${p.is_active ? `<small style="display:block">Current availability: ${p.is_in_stock ? 'Available' : 'Out of Stock'}</small>` : ''}</label><span style="display:flex;gap:6px;flex-wrap:wrap">${p.is_active ? button('Edit', `data-action="edit" data-kind="Product" data-id="${esc(p.id)}"`) + button(p.is_in_stock ? 'Mark Out of Stock' : 'Mark Available', `data-action="availability" data-kind="Product" data-id="${esc(p.id)}" data-label="${esc(p.name)}"`) : ''}${button(p.is_active ? 'Archive' : 'Restore', `data-action="${p.is_active ? 'archive' : 'restore'}" data-kind="Product" data-id="${esc(p.id)}" data-label="${esc(p.name)}"`)} ${button('Delete', `data-action="delete" data-kind="Product" data-id="${esc(p.id)}" data-label="${esc(p.name)}"`)}</span></div>`).join('') || '<p style="font-size:13px;color:#64748B">No products found.</p>'}`;
            panels.innerHTML = section('Riders', renderEntityRows(riders, 'Rider', r => r.is_active)) + section('Vendors', renderEntityRows(vendors, 'Vendor', v => v.status === 'ACTIVE')) + section('Service providers / services', renderEntityRows(services, 'Service', s => s.is_active)) + section('Products', productBody);
            attachHandlers(products);
        } catch (error) { setMessage(safeError(error), true); }
    }
    function reset() { panels.innerHTML = ''; message.textContent = ''; busy = false; }
    return { init, reset };
}
