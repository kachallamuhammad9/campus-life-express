import { getSupabaseClient } from './supabase.js';

// ─── Naira-to-kobo conversion (floating point safe) ─────────────────────────
export function nairaToKobo(nairaStr) {
    const s = String(nairaStr ?? '').trim();
    if (s === '' || s === '-') return null;
    const match = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) return null;
    const whole = parseInt(match[1], 10);
    const cents = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0;
    const kobo = whole * 100 + cents;
    if (!Number.isSafeInteger(kobo) || kobo <= 0 || kobo > 999999999) return null;
    return kobo;
}

export function koboToNaira(kobo) {
    if (kobo == null || !Number.isFinite(Number(kobo))) return '';
    const k = Number(kobo);
    const whole = Math.floor(k / 100);
    const cents = k % 100;
    return `${whole}.${String(cents).padStart(2, '0')}`;
}

export function formatNaira(kobo) {
    if (kobo == null) return '—';
    const n = Number(kobo);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n / 100);
}

// ─── Fetchers (authenticated SELECT — read-only) ─────────────────────────────
export async function fetchVendors(client) {
    if (!client) return [];
    const { data, error } = await client.from('vendors').select('id,name,status,is_verified').order('name');
    if (error) throw new Error(error.message || 'Could not load catalogue.');
    return (data || []).filter(v => v.status === 'ACTIVE' && v.is_verified);
}

export async function fetchCampuses(client) {
    if (!client) return [];
    const { data, error } = await client.from('campuses').select('id,name,slug').eq('is_active', true).order('name');
    if (error) throw new Error(error.message || 'Could not load catalogue.');
    return data || [];
}

export async function fetchVendorCampuses(client, vendorId) {
    if (!client || !vendorId) return [];
    const { data, error } = await client.from('vendor_campuses')
        .select('campus_id,campuses(id,name,slug,is_active)')
        .eq('vendor_id', vendorId).eq('is_active', true);
    if (error) throw new Error(error.message || 'Could not load catalogue.');
    return (data || []).map(r => r.campuses).filter(c => c?.is_active);
}

export async function fetchCategories(client) {
    if (!client) return [];
    const { data, error } = await client.from('categories').select('id,name,slug,parent_id').eq('is_active', true).order('sort_order');
    if (error) throw new Error(error.message || 'Could not load catalogue.');
    return data || [];
}

export async function fetchProducts(client, vendorId, campusId) {
    if (!client || !vendorId || !campusId) return [];
    const { data, error } = await client.from('products')
        .select('id,name,slug,description,price_kobo,original_price_kobo,category_id,subcategory_id,image_url,is_popular,is_in_stock,stock_quantity,created_at,updated_at')
        .eq('vendor_id', vendorId).eq('campus_id', campusId)
        .order('name');
    if (error) throw new Error(error.message || 'Could not load catalogue.');
    return data || [];
}

// ─── RPC Mutations (strict — no direct table writes) ─────────────────────────
export async function adminCreateProduct(params, client) {
    client = client || getSupabaseClient();
    if (!client) return { success: false, error: 'Service unavailable.' };
    try {
        const { data, error } = await client.rpc('admin_create_product', {
            p_vendor_id:            params.vendor_id,
            p_campus_id:            params.campus_id,
            p_category_id:          params.category_id,
            p_name:                 params.name,
            p_price_kobo:           params.price_kobo,
            p_description:          params.description ?? null,
            p_subcategory_id:       params.subcategory_id ?? null,
            p_original_price_kobo:  params.original_price_kobo ?? null,
            p_image_url:            params.image_url ?? null,
            p_is_in_stock:          params.is_in_stock ?? true,
            p_stock_quantity:       params.stock_quantity ?? null,
        });
        if (error) return { success: false, error: error.message || 'Failed to create product.' };
        if (!data || !data.id) return { success: false, error: 'Unexpected server response.' };
        return { success: true, product: data };
    } catch (e) {
        return { success: false, error: 'Failed to create product. Please try again.' };
    }
}

export async function adminUpdateProduct(productId, patch, client) {
    client = client || getSupabaseClient();
    if (!client || !productId) return { success: false, error: 'Service unavailable.' };
    try {
        const { data, error } = await client.rpc('admin_update_product', {
            p_product_id: productId,
            p_patch: patch,
        });
        if (error) return { success: false, error: error.message || 'Failed to update product.' };
        if (!data || !data.id) return { success: false, error: 'Unexpected server response.' };
        return { success: true, product: data };
    } catch (e) {
        return { success: false, error: 'Failed to update product. Please try again.' };
    }
}

// ─── Escaping helper ─────────────────────────────────────────────────────────
const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─── Main UI factory ─────────────────────────────────────────────────────────
export function createAdminProducts(root) {
    let vendors = [], campuses = [], categories = [], products = [];
    let selectedVendorId = '', selectedCampusId = '';
    let busy = false, generation = 0;
    const client = getSupabaseClient();

    root.innerHTML = `
    <style>
      #ap-modal-overlay[hidden]{display:none!important}
      #ap-filters label{font-size:12px;font-weight:700;color:var(--gray-700)}
      #ap-filters input,#ap-filters select{display:block;margin-top:4px;padding:8px 10px;border:1px solid var(--gray-300);border-radius:9px;background:#fff;max-width:220px}
      #ap-refresh{align-self:flex-end;padding:8px 14px;border:1px solid var(--gray-300);border-radius:9px;background:#fff}
    </style>
    <h2 style="font-size:18px;font-weight:800;color:var(--gray-900);margin:0 0 16px;">Product Management</h2>
    <div id="ap-vendor-campus-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
      <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Vendor
        <select id="ap-vendor-select" style="display:block;margin-top:4px;padding:8px 10px;border:1px solid var(--gray-300);border-radius:9px;font-size:13px;min-width:200px;">
          <option value="">— Select vendor —</option>
        </select>
      </label>
      <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Campus
        <select id="ap-campus-select" style="display:block;margin-top:4px;padding:8px 10px;border:1px solid var(--gray-300);border-radius:9px;font-size:13px;min-width:180px;" disabled>
          <option value="">— Select vendor first —</option>
        </select>
      </label>
      <div style="align-self:flex-end;">
        <button id="ap-add-btn" type="button" disabled
          style="padding:9px 16px;background:var(--color-primary);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;opacity:0.5;">
          + Add Product
        </button>
      </div>
    </div>
    <div id="ap-filters" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
      <label>Search <input id="ap-search" type="search"></label>
      <label>Category <select id="ap-category-filter"><option value="">All categories</option></select></label>
      <label>Subcategory <select id="ap-subcategory-filter"><option value="">All subcategories</option></select></label>
      <label>Stock <select id="ap-stock-filter"><option value="">All stock</option><option value="in">In stock</option><option value="out">Out of stock</option></select></label>
      <button id="ap-refresh" type="button">Refresh</button>
    </div>
    <p id="ap-msg" role="status" style="font-size:13px;color:var(--gray-600);margin:0 0 12px;min-height:18px;"></p>
    <div id="ap-table-wrap"></div>

    <!-- Add/Edit Modal -->
    <div id="ap-modal-overlay" hidden style="position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:2000;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow-y:auto;">
      <div id="ap-modal" role="dialog" aria-modal="true" aria-labelledby="ap-modal-title"
        style="background:#fff;border-radius:16px;max-width:580px;width:100%;padding:28px;box-shadow:0 24px 60px rgba(0,0,0,0.25);position:relative;">
        <button id="ap-modal-close" type="button" aria-label="Close"
          style="position:absolute;top:14px;right:14px;width:32px;height:32px;border:none;border-radius:8px;background:var(--gray-100);color:var(--gray-700);font-size:16px;cursor:pointer;">✕</button>
        <h3 id="ap-modal-title" style="font-size:17px;font-weight:800;color:var(--gray-900);margin:0 0 20px;"></h3>
        <form id="ap-form" novalidate>
          <div id="ap-form-vendor-info" style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:9px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:var(--gray-700);"></div>
          <div style="display:grid;gap:14px;">
            <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Product Name *
              <input id="ap-f-name" type="text" required maxlength="255"
                style="display:block;width:100%;margin-top:4px;padding:9px 12px;border:1px solid var(--gray-300);border-radius:9px;font-size:14px;box-sizing:border-box;">
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Category *
                <select id="ap-f-category" required
                  style="display:block;width:100%;margin-top:4px;padding:9px 10px;border:1px solid var(--gray-300);border-radius:9px;font-size:13px;">
                  <option value="">— Select —</option>
                </select>
              </label>
              <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Subcategory
                <select id="ap-f-subcategory"
                  style="display:block;width:100%;margin-top:4px;padding:9px 10px;border:1px solid var(--gray-300);border-radius:9px;font-size:13px;">
                  <option value="">— None —</option>
                </select>
              </label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Price (₦) *
                <input id="ap-f-price" type="number" min="0" step="0.01" required
                  style="display:block;width:100%;margin-top:4px;padding:9px 12px;border:1px solid var(--gray-300);border-radius:9px;font-size:14px;box-sizing:border-box;">
              </label>
              <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Original Price (₦)
                <input id="ap-f-original-price" type="number" min="0" step="0.01"
                  style="display:block;width:100%;margin-top:4px;padding:9px 12px;border:1px solid var(--gray-300);border-radius:9px;font-size:14px;box-sizing:border-box;">
              </label>
            </div>
            <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Description
              <textarea id="ap-f-description" maxlength="2000" rows="3"
                style="display:block;width:100%;margin-top:4px;padding:9px 12px;border:1px solid var(--gray-300);border-radius:9px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
            </label>
            <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Image URL
              <input id="ap-f-image-url" type="url"
                style="display:block;width:100%;margin-top:4px;padding:9px 12px;border:1px solid var(--gray-300);border-radius:9px;font-size:13px;box-sizing:border-box;">
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
              <label style="font-size:12px;font-weight:700;color:var(--gray-700);">Stock Qty
                <input id="ap-f-stock-qty" type="number" min="0" max="1000000" step="1"
                  style="display:block;width:100%;margin-top:4px;padding:9px 12px;border:1px solid var(--gray-300);border-radius:9px;font-size:13px;box-sizing:border-box;">
              </label>
              <label style="font-size:12px;font-weight:700;color:var(--gray-700);display:flex;flex-direction:column;gap:6px;">
                In Stock
                <input id="ap-f-in-stock" type="checkbox" checked style="width:18px;height:18px;margin-top:2px;">
              </label>

            </div>
          </div>
          <p id="ap-form-error" role="alert" style="display:none;margin:14px 0 0;padding:10px;border-radius:9px;background:rgba(220,38,38,0.08);color:#B91C1C;font-size:13px;"></p>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
            <button id="ap-form-cancel" type="button"
              style="padding:9px 16px;border:1px solid var(--gray-300);border-radius:9px;background:#fff;color:var(--gray-700);font-size:13px;cursor:pointer;">Cancel</button>
            <button id="ap-form-submit" type="submit"
              style="padding:9px 18px;background:var(--color-primary);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">Save Product</button>
          </div>
        </form>
      </div>
    </div>`;

    const msg = t => { root.querySelector('#ap-msg').textContent = t; };
    const showError = (text) => {
        const el = root.querySelector('#ap-form-error');
        if (text) { el.textContent = text; el.style.display = 'block'; }
        else { el.textContent = ''; el.style.display = 'none'; }
    };

    // ── Category dropdowns ──
    function populateCategoryDropdown(catId = '') {
        const roots = categories.filter(c => !c.parent_id);
        const sel = root.querySelector('#ap-f-category');
        sel.innerHTML = '<option value="">— Select —</option>' +
            roots.map(c => `<option value="${esc(c.id)}"${c.id === catId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
        populateSubcategoryDropdown(catId, '');
    }

    function populateSubcategoryDropdown(catId, subcatId = '') {
        const children = categories.filter(c => c.parent_id === catId);
        const sel = root.querySelector('#ap-f-subcategory');
        sel.innerHTML = '<option value="">— None —</option>' +
            children.map(c => `<option value="${esc(c.id)}"${c.id === subcatId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    }

    root.querySelector('#ap-f-category').addEventListener('change', (e) => {
        populateSubcategoryDropdown(e.target.value);
    });

    // ── Vendor / Campus cascades ──
    async function loadVendors() {
        const ver = generation;
        const loaded = await fetchVendors(client);
        if (ver !== generation) return;
        vendors = loaded;
        const sel = root.querySelector('#ap-vendor-select');
        sel.innerHTML = '<option value="">— Select vendor —</option>' +
            vendors.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
        selectedVendorId = '';
        selectedCampusId = '';
        resetCampusDropdown();
    }

    function resetCampusDropdown() {
        const sel = root.querySelector('#ap-campus-select');
        sel.innerHTML = '<option value="">— Select vendor first —</option>';
        sel.disabled = true;
        root.querySelector('#ap-add-btn').disabled = true;
        root.querySelector('#ap-add-btn').style.opacity = '0.5';
        root.querySelector('#ap-table-wrap').innerHTML = '';
        msg('');
    }

    root.querySelector('#ap-vendor-select').addEventListener('change', async (e) => {
        if (busy) return;
        const ver = ++generation;
        resetCampusDropdown();
        selectedVendorId = e.target.value;
        selectedCampusId = '';
        if (!selectedVendorId) { resetCampusDropdown(); return; }
        let campusList;
        try { campusList = await fetchVendorCampuses(client, selectedVendorId); }
        catch (error) { if (ver === generation) msg(error.message); return; }
        if (ver !== generation) return;
        const sel = root.querySelector('#ap-campus-select');
        sel.innerHTML = '<option value="">— Select campus —</option>' +
            campusList.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
        sel.disabled = false;
        root.querySelector('#ap-add-btn').disabled = true;
        root.querySelector('#ap-add-btn').style.opacity = '0.5';
        root.querySelector('#ap-table-wrap').innerHTML = '';
        msg('');
    });

    root.querySelector('#ap-campus-select').addEventListener('change', async (e) => {
        if (busy) return;
        generation++;
        selectedCampusId = e.target.value;
        if (!selectedCampusId) {
            root.querySelector('#ap-add-btn').disabled = true;
            root.querySelector('#ap-add-btn').style.opacity = '0.5';
            root.querySelector('#ap-table-wrap').innerHTML = '';
            return;
        }
        root.querySelector('#ap-add-btn').disabled = false;
        root.querySelector('#ap-add-btn').style.opacity = '1';
        await loadProducts();
    });

    async function loadProducts() {
        const ver = ++generation;
        msg('Loading products…');
        root.querySelector('#ap-table-wrap').innerHTML = '';
        let loaded;
        try { loaded = await fetchProducts(client, selectedVendorId, selectedCampusId); }
        catch (error) { if (ver === generation) { products = []; msg(error.message); } return; }
        if (ver !== generation) return;
        products = loaded;
        renderProductTable();
        msg(`${products.length} product${products.length !== 1 ? 's' : ''}`);
    }

    function renderProductTable() {
        const search = root.querySelector('#ap-search').value.trim().toLocaleLowerCase();
        const cat = root.querySelector('#ap-category-filter').value;
        const sub = root.querySelector('#ap-subcategory-filter').value;
        const stock = root.querySelector('#ap-stock-filter').value;
        const visible = products.filter(p => p.name.toLocaleLowerCase().includes(search)
            && (!cat || p.category_id === cat) && (!sub || p.subcategory_id === sub)
            && (!stock || p.is_in_stock === (stock === 'in')));
        if (!products.length) {
            root.querySelector('#ap-table-wrap').innerHTML = '<p style="font-size:13px;color:var(--gray-600);">No products for this vendor and campus yet.</p>';
            return;
        }
        const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
        root.querySelector('#ap-table-wrap').innerHTML = `
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="text-align:left;border-bottom:2px solid var(--gray-200);">
            <th style="padding:8px 10px;font-weight:700;color:var(--gray-700);">Name</th>
            <th style="padding:8px 10px;font-weight:700;color:var(--gray-700);">Category</th>
            <th style="padding:8px 10px;font-weight:700;color:var(--gray-700);">Price</th>
            <th style="padding:8px 10px;font-weight:700;color:var(--gray-700);">Stock</th>
            <th style="padding:8px 10px;font-weight:700;color:var(--gray-700);">Status</th>
            <th style="padding:8px 10px;font-weight:700;color:var(--gray-700);">Actions</th>
          </tr></thead>
          <tbody>
          ${visible.map(p => `
            <tr style="border-bottom:1px solid var(--gray-100);" data-product-id="${esc(p.id)}">
              <td style="padding:9px 10px;font-weight:600;color:var(--gray-900);">${esc(p.name)}</td>
              <td style="padding:9px 10px;color:var(--gray-600);">${esc(catMap[p.category_id] || '—')}</td>
              <td style="padding:9px 10px;color:var(--gray-900);">${esc(formatNaira(p.price_kobo))}</td>
              <td style="padding:9px 10px;color:var(--gray-600);">${p.stock_quantity != null ? p.stock_quantity : '—'}</td>
              <td style="padding:9px 10px;">
                <span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${p.is_in_stock ? 'rgba(21,128,61,0.1)' : 'rgba(220,38,38,0.1)'};color:${p.is_in_stock ? '#15803D' : '#B91C1C'};">
                  ${p.is_in_stock ? 'In Stock' : 'Out of Stock'}
                </span>
              </td>
              <td style="padding:9px 10px;display:flex;gap:8px;">
                <button type="button" data-edit="${esc(p.id)}"
                  style="padding:5px 10px;border:1px solid var(--gray-300);border-radius:7px;background:#fff;color:var(--gray-700);font-size:12px;cursor:pointer;">Edit</button>
                <button type="button" data-toggle-stock="${esc(p.id)}"
                  style="padding:5px 10px;border:1px solid ${p.is_in_stock ? 'rgba(220,38,38,0.3)' : 'rgba(21,128,61,0.3)'};border-radius:7px;background:#fff;color:${p.is_in_stock ? '#B91C1C' : '#15803D'};font-size:12px;cursor:pointer;">
                  ${p.is_in_stock ? 'Mark Out' : 'Mark In'}
                </button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>`;
    }

    // ── Modal: open for create ──
    root.querySelector('#ap-search').addEventListener('input', renderProductTable);
    root.querySelector('#ap-stock-filter').addEventListener('change', renderProductTable);
    root.querySelector('#ap-subcategory-filter').addEventListener('change', renderProductTable);
    root.querySelector('#ap-category-filter').addEventListener('change', () => {
        const cat = root.querySelector('#ap-category-filter').value;
        root.querySelector('#ap-subcategory-filter').innerHTML = '<option value="">All subcategories</option>' +
            categories.filter(c => c.parent_id && (!cat || c.parent_id === cat)).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
        renderProductTable();
    });
    root.querySelector('#ap-refresh').addEventListener('click', () => { if (!busy) loadProducts(); });

    let editingProductId = null;
    let returnFocus = null;
    function showModal() {
        const overlay = root.querySelector('#ap-modal-overlay');
        returnFocus = document.activeElement;
        for (const child of root.children) if (child !== overlay) child.inert = true;
        overlay.hidden = false;
        overlay.scrollTop = 0;
        root.querySelector('#ap-f-name').focus({ preventScroll: true });
    }

    function openAddModal() {
        if (busy || !selectedVendorId || !selectedCampusId) return;
        editingProductId = null;
        const vendor = vendors.find(v => v.id === selectedVendorId);
        const campus = root.querySelector('#ap-campus-select');
        const campusName = campus.options[campus.selectedIndex]?.text || '';
        root.querySelector('#ap-modal-title').textContent = 'Add Product';
        root.querySelector('#ap-form-vendor-info').textContent =
            `Vendor: ${vendor?.name || '—'} · Campus: ${campusName}`;
        root.querySelector('#ap-f-name').value = '';
        root.querySelector('#ap-f-description').value = '';
        root.querySelector('#ap-f-price').value = '';
        root.querySelector('#ap-f-original-price').value = '';
        root.querySelector('#ap-f-image-url').value = '';
        root.querySelector('#ap-f-stock-qty').value = '';
        root.querySelector('#ap-f-in-stock').checked = true;
        populateCategoryDropdown('');
        showError('');
        root.querySelector('#ap-form-submit').textContent = 'Create Product';
        showModal();
    }

    function openEditModal(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        editingProductId = productId;
        const vendor = vendors.find(v => v.id === selectedVendorId);
        const campus = root.querySelector('#ap-campus-select');
        const campusName = campus.options[campus.selectedIndex]?.text || '';
        root.querySelector('#ap-modal-title').textContent = 'Edit Product';
        root.querySelector('#ap-form-vendor-info').innerHTML =
            `Vendor: ${esc(vendor?.name || '—')} · Campus: ${esc(campusName)} ` +
            `<span style="font-size:11px;color:var(--gray-500);">(vendor &amp; campus are immutable)</span>`;
        root.querySelector('#ap-f-name').value = product.name || '';
        root.querySelector('#ap-f-description').value = product.description || '';
        root.querySelector('#ap-f-price').value = koboToNaira(product.price_kobo);
        root.querySelector('#ap-f-original-price').value = product.original_price_kobo != null ? koboToNaira(product.original_price_kobo) : '';
        root.querySelector('#ap-f-image-url').value = product.image_url || '';
        root.querySelector('#ap-f-stock-qty').value = product.stock_quantity != null ? product.stock_quantity : '';
        root.querySelector('#ap-f-in-stock').checked = product.is_in_stock;
        populateCategoryDropdown(product.category_id || '');
        if (product.subcategory_id) {
            root.querySelector('#ap-f-subcategory').value = product.subcategory_id;
        }
        showError('');
        root.querySelector('#ap-form-submit').textContent = 'Save Changes';
        showModal();
    }

    function closeModal() {
        if (busy) return;
        root.querySelector('#ap-modal-overlay').hidden = true;
        for (const child of root.children) child.inert = false;
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        editingProductId = null;
        showError('');
    }

    root.querySelector('#ap-modal-close').addEventListener('click', closeModal);
    root.querySelector('#ap-form-cancel').addEventListener('click', closeModal);
    root.querySelector('#ap-modal-overlay').addEventListener('click', (e) => {
        if (e.target === root.querySelector('#ap-modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !root.querySelector('#ap-modal-overlay').hidden) {
            const fields = [...root.querySelectorAll('#ap-modal button:not(:disabled),#ap-modal input:not(:disabled),#ap-modal select:not(:disabled),#ap-modal textarea:not(:disabled)')];
            const first = fields[0], last = fields.at(-1);
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        if (e.key === 'Escape' && !root.querySelector('#ap-modal-overlay').hidden) closeModal();
    });

    root.querySelector('#ap-add-btn').addEventListener('click', openAddModal);

    // ── Table click delegation (Edit / Toggle Stock) ──
    root.querySelector('#ap-table-wrap').addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn || busy) return;
        const editId = btn.dataset.edit;
        const toggleId = btn.dataset.toggleStock;
        if (editId) { openEditModal(editId); return; }
        if (toggleId) {
            const product = products.find(p => p.id === toggleId);
            if (!product) return;
            const confirm = window.confirm(
                `${product.is_in_stock ? 'Mark out of stock' : 'Mark in stock'}: "${product.name}"?`
            );
            if (!confirm) return;
            const ver = generation;
            busy = true;
            msg('Updating stock…');
            const patch = { is_in_stock: !product.is_in_stock };
            const result = await adminUpdateProduct(toggleId, patch);
            if (ver !== generation) return;
            busy = false;
            if (!result.success) { msg(result.error || 'Failed to update stock.'); return; }
            await loadProducts();
        }
    });

    // ── Form submission ──
    root.querySelector('#ap-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;
        showError('');

        const name = root.querySelector('#ap-f-name').value.replace(/\s+/gu, ' ').trim();
        const priceStr = root.querySelector('#ap-f-price').value.trim();
        const origStr = root.querySelector('#ap-f-original-price').value.trim();
        const description = root.querySelector('#ap-f-description').value.trim() || null;
        const imageUrl = root.querySelector('#ap-f-image-url').value.trim() || null;
        const stockQtyStr = root.querySelector('#ap-f-stock-qty').value.trim();
        const categoryId = root.querySelector('#ap-f-category').value || null;
        const subcategoryId = root.querySelector('#ap-f-subcategory').value || null;
        const isInStock = root.querySelector('#ap-f-in-stock').checked;

        if (imageUrl) {
            try { const url = new URL(imageUrl); if (!['http:', 'https:'].includes(url.protocol) || imageUrl.length > 2048) throw new Error(); }
            catch { showError('Enter an HTTP/HTTPS image URL, at most 2048 characters.'); return; }
        }
        // Frontend validation
        if (!name || [...name].length > 255) {
            showError('Product name must be between 1 and 255 characters.'); return;
        }
        const priceKobo = nairaToKobo(priceStr);
        if (priceKobo === null) {
            showError('Enter a valid price (e.g. 2500 or 2500.50).'); return;
        }
        let origKobo = null;
        if (origStr) {
            origKobo = nairaToKobo(origStr);
            if (origKobo === null) { showError('Enter a valid original price.'); return; }
            if (origKobo < priceKobo) { showError('Original price cannot be less than selling price.'); return; }
        }
        if (!categoryId) { showError('Select a category.'); return; }
        let stockQty = null;
        if (stockQtyStr !== '') {
            stockQty = /^\d+$/.test(stockQtyStr) ? Number(stockQtyStr) : NaN;
            if (!Number.isInteger(stockQty) || stockQty < 0 || stockQty > 1000000) {
                showError('Stock quantity must be a whole number between 0 and 1,000,000.'); return;
            }
        }

        const ver = generation;
        busy = true;
        root.querySelector('#ap-form-submit').disabled = true;
        root.querySelector('#ap-form-submit').textContent = 'Saving…';

        let result;
        if (editingProductId) {
            // Build JSONB patch: only include what was shown in form
            const patch = {
                name,
                price_kobo: priceKobo,
                category_id: categoryId,
                subcategory_id: subcategoryId,
                description: description,
                original_price_kobo: origKobo,
                image_url: imageUrl,
                is_in_stock: isInStock,
                stock_quantity: stockQty,
            };
            const original = products.find(p => p.id === editingProductId);
            for (const key of Object.keys(patch)) {
                if (patch[key] === (original?.[key] ?? null)) delete patch[key];
            }
            result = await adminUpdateProduct(editingProductId, patch);
        } else {
            result = await adminCreateProduct({
                vendor_id: selectedVendorId,
                campus_id: selectedCampusId,
                category_id: categoryId,
                subcategory_id: subcategoryId,
                name,
                price_kobo: priceKobo,
                description,
                original_price_kobo: origKobo,
                image_url: imageUrl,
                is_in_stock: isInStock,
                stock_quantity: stockQty,
            });
        }

        if (ver !== generation) return;
        busy = false;
        root.querySelector('#ap-form-submit').disabled = false;
        root.querySelector('#ap-form-submit').textContent = editingProductId ? 'Save Changes' : 'Create Product';

        if (!result.success) { showError(result.error || 'Operation failed.'); return; }
        closeModal();
        await loadProducts();
    });

    // ── Initialize metadata ──
    async function init() {
        const ver = ++generation;
        try {
            const loaded = await fetchCategories(client);
            if (ver !== generation) return;
            categories = loaded;
            root.querySelector('#ap-category-filter').innerHTML = '<option value="">All categories</option>' + categories.filter(c => !c.parent_id).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
            await loadVendors();
        } catch (error) { if (ver === generation) msg(error.message); }
    }

    function reset() {
        generation++;
        vendors = []; campuses = []; products = [];
        selectedVendorId = ''; selectedCampusId = '';
        busy = false;
        root.querySelector('#ap-form-submit').disabled = false;
        root.querySelector('#ap-vendor-select').innerHTML = '<option value="">— Select vendor —</option>';
        resetCampusDropdown();
        closeModal();
        msg('');
    }

    return { init, reset };
}
