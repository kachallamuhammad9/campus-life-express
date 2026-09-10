import { getSupabaseClient } from './supabase.js';

export function serviceNairaToKobo(value) {
    const match = String(value ?? '').trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) return null;
    const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    return Number.isSafeInteger(amount) && amount > 0 && amount <= 999999999 ? amount : null;
}
export function serviceKoboToNaira(value) {
    if (value == null) return '';
    return `${Math.floor(Number(value) / 100)}.${String(Number(value) % 100).padStart(2, '0')}`;
}
export function servicePatch(original, values) {
    return Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== original[key]));
}
export function serviceIssues(s, context) {
    const v = context.vendors.find(v => v.id === s.vendor_id);
    const c = context.campuses.find(c => c.id === s.campus_id);
    const cat = context.categories.find(c => c.id === s.category_id);
    const sub = context.categories.find(c => c.id === s.subcategory_id);
    const issues = [];
    if (!v || v.status !== 'ACTIVE' || !v.is_verified) issues.push('Vendor not eligible');
    if (!c?.is_active) issues.push('Campus inactive');
    if (!context.pairs.some(p => p.vendor_id === s.vendor_id && p.campus_id === s.campus_id && p.is_active)) issues.push('Association inactive');
    if (!cat?.is_active || cat.parent_id || cat.slug !== 'services') issues.push('Choose Campus Services root');
    if (s.subcategory_id && (!sub?.is_active || sub.parent_id !== s.category_id)) issues.push('Subcategory mismatch');
    if (!['FIXED', 'STARTING_FROM', 'QUOTE'].includes(s.price_type) ||
        (s.starting_price_kobo == null ? s.price_type !== 'QUOTE' : !Number.isSafeInteger(Number(s.starting_price_kobo)) || s.starting_price_kobo <= 0 || s.starting_price_kobo > 999999999)) issues.push('Invalid pricing');
    return issues;
}
const failure = 'Unable to save service. Check eligibility, category, price, image URL and duplicate names, then retry.';

export function createAdminServices(root, client = getSupabaseClient()) {
    let context = { vendors: [], campuses: [], categories: [], pairs: [] }, services = [];
    let generation = 0, busy = false, editing = null, opener = null, initialFields = {};
    const element = (tag, text, attrs = {}) => {
        const e = document.createElement(tag);
        if (text != null) e.textContent = String(text);
        for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, String(value));
        return e;
    };
    const button = (text, handler) => {
        const b = element('button', text, { type: 'button' });
        b.addEventListener('click', handler); return b;
    };
    root.replaceChildren();
    root.append(element('h2', 'Service Management'), element('p', 'CLX-managed services. Booking and file submission remain deferred.'));
    const filters = element('div', null, { style: 'display:flex;gap:12px;flex-wrap:wrap;margin:16px 0' });
    const filterInputs = {};
    for (const key of ['search', 'vendor', 'campus', 'category', 'availability']) {
        const label = element('label', key[0].toUpperCase() + key.slice(1));
        const input = element(key === 'search' ? 'input' : 'select', null, { id: `as-filter-${key}`, 'aria-label': `Service ${key}` });
        input.addEventListener(key === 'search' ? 'input' : 'change', render);
        label.append(input); filters.append(label); filterInputs[key] = input;
    }
    const refreshButton = button('Refresh services', () => init());
    const addButton = button('Add Service', () => open(null)); addButton.id = 'as-add';
    filters.append(refreshButton, addButton);
    const message = element('p', '', { role: 'status', id: 'as-message' });
    const list = element('div', null, { id: 'as-list', style: 'overflow:auto' });
    root.append(filters, message, list);
    const dialog = element('dialog', null, { id: 'as-dialog', 'aria-labelledby': 'as-title', style: 'max-width:640px;width:90%;border:1px solid #CBD5E1;border-radius:16px;padding:24px' });
    const title = element('h3', '', { id: 'as-title' });
    const form = element('form', null, { id: 'as-form', novalidate: '' });
    const fields = {};
    const definitions = [
        ['vendor_id','Vendor','select'], ['campus_id','Campus','select'], ['category_id','Category','select'], ['subcategory_id','Subcategory','select'],
        ['name','Service name','input'], ['description','Description','textarea'], ['price_type','Price type','select'],
        ['starting_price_kobo','Starting price (Naira)','input'], ['image_url','Image URL','input'], ['turnaround_time','Turnaround','input'],
        ['requires_file_upload','File upload required (booking deferred)','checkbox'], ['requires_appointment','Appointment required (booking deferred)','checkbox'], ['is_active','Available / published','checkbox']
    ];
    for (const [key, labelText, type] of definitions) {
        const label = element('label', labelText, { style: 'display:block;margin:12px 0' });
        const input = element(type === 'checkbox' ? 'input' : type, null, { id: `as-${key}`, name: key, style: type === 'checkbox' ? 'margin-left:8px' : 'display:block;width:100%;padding:8px;box-sizing:border-box' });
        if (type === 'checkbox') input.type = 'checkbox';
        label.append(input); form.append(label); fields[key] = input;
    }
    fields.name.maxLength = 255; fields.description.maxLength = 2000; fields.turnaround_time.maxLength = 255; fields.image_url.maxLength = 2048;
    fields.starting_price_kobo.inputMode = 'decimal';
    const formError = element('p', '', { role: 'alert', id: 'as-error' });
    const save = element('button', 'Save service', { type: 'submit', id: 'as-save' });
    const close = button('Cancel', () => { if (!busy) dialog.close(); });
    form.append(formError, save, close); dialog.append(title, form); root.append(dialog);
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => opener?.focus());
    function options(input, rows, label = 'None') {
        input.replaceChildren(element('option', label, { value: '' }));
        rows.forEach(r => input.append(element('option', r.name, { value: r.id })));
    }
    function subcategories() {
        options(fields.subcategory_id, context.categories.filter(c => c.is_active && c.parent_id === fields.category_id.value));
    }
    function vendorCampuses() {
        const ids = context.pairs.filter(p => p.vendor_id === fields.vendor_id.value && p.is_active).map(p => p.campus_id);
        options(fields.campus_id, context.campuses.filter(c => c.is_active && ids.includes(c.id)), 'Choose campus');
    }
    fields.vendor_id.addEventListener('change', vendorCampuses);
    fields.category_id.addEventListener('change', subcategories);
    fields.price_type.addEventListener('change', () => { fields.starting_price_kobo.required = fields.price_type.value !== 'QUOTE'; });
    function open(service) {
        if (busy) return;
        opener = document.activeElement; editing = service; form.reset(); formError.textContent = '';
        title.textContent = service ? 'Edit Service' : 'Add Service';
        options(fields.vendor_id, service ? context.vendors : context.vendors.filter(v => v.status === 'ACTIVE' && v.is_verified), 'Choose vendor');
        options(fields.campus_id, context.campuses, 'Choose campus');
        options(fields.category_id, context.categories.filter(c => c.is_active && c.slug === 'services' && !c.parent_id), 'Choose Campus Services');
        options(fields.price_type, ['FIXED','STARTING_FROM','QUOTE'].map(id => ({ id, name: id })), 'Choose pricing');
        fields.vendor_id.disabled = fields.campus_id.disabled = !!service;
        if (service) {
            fields.vendor_id.value = service.vendor_id || ''; fields.campus_id.value = service.campus_id;
            // Preserve invalid legacy values until the admin explicitly changes them.
            if (!Array.from(fields.category_id.options).some(o => o.value === service.category_id)) fields.category_id.append(element('option', 'Legacy category — correction required', { value: service.category_id }));
            fields.category_id.value = service.category_id; subcategories();
            if (service.subcategory_id && !Array.from(fields.subcategory_id.options).some(o => o.value === service.subcategory_id)) fields.subcategory_id.append(element('option', 'Legacy subcategory — correction required', { value: service.subcategory_id }));
            for (const [key, input] of Object.entries(fields)) {
                if (input.type === 'checkbox') input.checked = service[key] === true;
                else input.value = key === 'starting_price_kobo' ? serviceKoboToNaira(service[key]) : service[key] ?? '';
            }
        } else {
            fields.price_type.value = 'QUOTE'; fields.is_active.checked = false;
            fields.category_id.value = context.categories.find(c => c.slug === 'services' && c.is_active && !c.parent_id)?.id || '';
            subcategories(); vendorCampuses();
        }
        fields.starting_price_kobo.required = fields.price_type.value !== 'QUOTE';
        initialFields = Object.fromEntries(Object.entries(fields).map(([k,e]) => [k,e.type === 'checkbox' ? e.checked : e.value]));
        dialog.showModal(); fields.name.focus();
    }
    function render() {
        const filtered = services.filter(s => {
            const f = filterInputs;
            const vendor = context.vendors.find(v => v.id === s.vendor_id)?.name || '';
            return (!f.vendor.value || s.vendor_id === f.vendor.value) && (!f.campus.value || s.campus_id === f.campus.value) && (!f.category.value || s.category_id === f.category.value) &&
                (!f.availability.value || String(s.is_active) === f.availability.value) && `${s.name} ${s.description || ''} ${vendor}`.toLowerCase().includes(f.search.value.toLowerCase());
        });
        const table = element('table', null, { style: 'width:100%;text-align:left;border-spacing:12px' });
        const head = element('tr'); ['Service','Vendor','Campus','Category / subcategory','Pricing','Turnaround','Availability','Actions'].forEach(t => head.append(element('th', t))); table.append(head);
        for (const s of filtered) {
            const row = element('tr'); const issues = serviceIssues(s, context);
            const categoryName = id => context.categories.find(c => c.id === id)?.name || 'None';
            const price = s.starting_price_kobo == null ? 'Quotation required' : `₦${serviceKoboToNaira(s.starting_price_kobo)}`;
            [s.name, context.vendors.find(v => v.id === s.vendor_id)?.name || 'Provider-only legacy record', context.campuses.find(c => c.id === s.campus_id)?.name || 'Unknown', `${categoryName(s.category_id)} / ${categoryName(s.subcategory_id)}`, `${s.price_type}: ${price}`, s.turnaround_time || '—', `${s.is_active ? 'Active' : 'Unavailable'}${issues.length ? ' — Legacy/context issue: ' + issues.join('; ') : ''}`].forEach(t => row.append(element('td', t)));
            const actions = element('td'); const edit = button('Edit Service', () => open(s));
            const toggle = button(s.is_active ? 'Make unavailable' : 'Publish service', () => toggleService(s));
            edit.disabled = busy; toggle.disabled = busy || (!s.is_active && issues.length > 0);
            actions.append(edit, toggle); row.append(actions); table.append(row);
        }
        list.replaceChildren(filtered.length ? table : element('p', 'No services match these filters.'));
    }
    async function mutate(name, payload, errorNode) {
        if (busy) return false;
        busy = true; save.disabled = true; addButton.disabled = true; refreshButton.disabled = true; render();
        const current = generation;
        try {
            const { data, error } = await client.rpc(name, payload);
            if (current !== generation) return false;
            if (error || !data?.id) throw new Error('Mutation failed');
            dialog.close();
            await init();
            return true;
        } catch {
            if (current === generation) errorNode.textContent = failure;
            return false;
        } finally {
            busy = false; save.disabled = false; addButton.disabled = false; refreshButton.disabled = false; render();
        }
    }
    async function toggleService(s) {
        if (busy || !window.confirm(`${s.is_active ? 'Make unavailable' : 'Publish'}: ${s.name}?`)) return;
        await mutate('admin_update_service', { p_service_id: s.id, p_patch: { is_active: !s.is_active } }, message);
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy) return;
        formError.textContent = '';
        const values = {};
        for (const [key, input] of Object.entries(fields)) {
            if (['vendor_id', 'campus_id'].includes(key)) continue;
            values[key] = input.type === 'checkbox' ? input.checked : input.value;
        }
        values.name = values.name.replace(/\s+/g, ' ').trim();
        for (const key of ['description','turnaround_time','image_url','subcategory_id']) values[key] = values[key].trim() || null;
        const raw = fields.starting_price_kobo.value.trim();
        values.starting_price_kobo = raw === '' ? null : serviceNairaToKobo(raw);
        if (!values.name || !values.category_id || !fields.vendor_id.value || !fields.campus_id.value ||
            !['FIXED','STARTING_FROM','QUOTE'].includes(values.price_type) || (raw !== '' && values.starting_price_kobo === null) || (values.price_type !== 'QUOTE' && values.starting_price_kobo === null)) {
            formError.textContent = 'Choose vendor, campus and category; enter a name and valid price (up to two decimals). Only QUOTE permits a blank price.'; return;
        }
        if (editing) {
            const changed = Object.fromEntries(Object.entries(values).filter(([key]) => initialFields[key] !== (fields[key].type === 'checkbox' ? fields[key].checked : fields[key].value)));
            await mutate('admin_update_service', { p_service_id: editing.id, p_patch: servicePatch(editing, changed) }, formError);
        }
        else await mutate('admin_create_service', Object.fromEntries(Object.entries({ vendor_id: fields.vendor_id.value, campus_id: fields.campus_id.value, ...values }).map(([k,v]) => ['p_' + k, v])), formError);
    });
    async function init() {
        const current = ++generation; message.textContent = 'Loading services…';
        try {
            if (!client) throw new Error('Missing client');
            const result = await Promise.all(['services','vendors','campuses','categories','vendor_campuses'].map(table => client.from(table).select('*')));
            if (current !== generation) return;
            if (result.some(r => r.error)) throw new Error('Read failed');
            services = result[0].data || []; context = { vendors: result[1].data || [], campuses: result[2].data || [], categories: result[3].data || [], pairs: result[4].data || [] };
            for (const [key, rows] of [['vendor',context.vendors],['campus',context.campuses],['category',context.categories.filter(c => !c.parent_id)],['availability',[{id:'true',name:'Active'},{id:'false',name:'Unavailable'}]]]) {
                const value = filterInputs[key].value; options(filterInputs[key], rows, 'All'); filterInputs[key].value = value;
            }
            message.textContent = `${services.length} services loaded. Eligibility warnings require review before publishing.`; render();
        } catch { if (current === generation) { services = []; render(); message.textContent = 'Unable to load services. Refresh to try again.'; } }
    }
    function reset() { generation++; services = []; context = { vendors: [], campuses: [], categories: [], pairs: [] }; editing = null; form.reset(); dialog.close(); message.textContent = ''; render(); }
    return { init, reset };
}
