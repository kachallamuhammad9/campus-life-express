import { getSupabaseClient } from './supabase.js';

export const APPLICATION_STATUSES = ['PENDING', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED'];
const ACTIONS = {
    PENDING: [['UNDER_REVIEW', 'Start Review'], ['NEEDS_INFORMATION', 'Request Information'], ['REJECTED', 'Reject'], ['APPROVED', 'Approve']],
    UNDER_REVIEW: [['NEEDS_INFORMATION', 'Request Information'], ['REJECTED', 'Reject'], ['APPROVED', 'Approve']],
    NEEDS_INFORMATION: [['UNDER_REVIEW', 'Resume Review'], ['REJECTED', 'Reject']]
};
export const actionsForStatus = status => (Object.hasOwn(ACTIONS, status) ? ACTIONS[status] : []).map(([target, label]) => ({ target, label }));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const label = value => String(value || '').replaceAll('_', ' ');
const date = value => value ? new Date(value).toLocaleString() : '—';
const safeError = 'Unable to complete this action. Refresh and check eligibility, category, campus, and any existing vendor match before retrying.';
export function filterApplications(rows, status = '', search = '') {
    const q = search.trim().toLowerCase();
    return rows.filter(row => (!status || row.status === status) &&
        ['application_number', 'business_name', 'contact_name', 'phone_number', 'whatsapp_number']
            .some(key => String(row[key] || '').toLowerCase().includes(q)));
}
export async function fetchApplications(client = getSupabaseClient()) {
    if (!client) return { success: false, error: 'Applications are unavailable.' };
    try {
        const rows = [];
        for (let offset = 0; ; offset += 200) {
            const { data, error } = await client.from('vendor_applications').select(
                'id,application_number,business_name,contact_name,phone_number,whatsapp_number,email,category_slug,location,description,status,submitted_at,reviewed_at,review_notes,rejection_reason,campuses(name),vendors(name)'
            ).order('submitted_at', { ascending: false }).order('id').range(offset, offset + 199);
            if (error || !Array.isArray(data)) return { success: false, error: 'Unable to load applications. Please refresh.' };
            rows.push(...data);
            if (data.length < 200) return { success: true, rows };
        }
    } catch { return { success: false, error: 'Unable to load applications. Please refresh.' }; }
}
export async function reviewApplication(id, target, note = '', reason = '', client = getSupabaseClient()) {
    if (!client || !['UNDER_REVIEW', 'NEEDS_INFORMATION', 'REJECTED'].includes(target)) return { success: false, error: safeError };
    note = note.trim(); reason = reason.trim();
    if (note.length > 2000 || reason.length > 2000 || (target === 'NEEDS_INFORMATION' && !note) || (target === 'REJECTED' && !reason)) {
        return { success: false, error: 'Provide the required review text, up to 2000 characters.' };
    }
    try {
        const { data, error } = await client.rpc('admin_review_vendor_application', {
            p_application_id: id, p_target_status: target, p_review_note: note || null, p_rejection_reason: reason || null
        });
        return !error && data?.application_number && data.status === target ? { success: true } : { success: false, error: safeError };
    } catch { return { success: false, error: safeError }; }
}
export async function approveApplication(id, client = getSupabaseClient()) {
    if (!client) return { success: false, error: safeError };
    try {
        const { data, error } = await client.rpc('admin_approve_vendor_application', { p_application_id: id });
        return !error && data?.application_number && data.status === 'APPROVED' && typeof data.already_approved === 'boolean'
            ? { success: true, alreadyApproved: data.already_approved } : { success: false, error: safeError };
    } catch { return { success: false, error: safeError }; }
}

// Mounted inside the existing authorized shell. No request until load() is called.
export function createVendorApplicationsAdmin(root) {
    let rows = [], selected = null, busy = false, generation = 0;
    root.innerHTML = `<h2>Vendor Applications</h2>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0">
        <label>Status <select data-filter><option value="">All statuses</option>${APPLICATION_STATUSES.map(s => `<option value="${s}">${label(s)}</option>`).join('')}</select></label>
        <label>Search <input data-search type="search" placeholder="Application, business, contact or phone"></label>
        <button type="button" data-refresh>Refresh applications</button></div>
        <p data-message role="status"></p><div data-list></div><section data-detail aria-label="Vendor application details"></section>`;
    const find = selector => root.querySelector(selector);
    const message = text => { find('[data-message]').textContent = text; };
    function render() {
        const filtered = filterApplications(rows, find('[data-filter]').value, find('[data-search]').value);
        find('[data-list]').innerHTML = filtered.map(row => `<article style="border:1px solid #CBD5E1;border-radius:10px;padding:14px;margin:10px 0">
            <strong>${esc(row.application_number)} · ${esc(row.business_name)}</strong>
            <p>${esc(date(row.submitted_at))} · ${esc(row.category_slug)} · ${esc(row.campuses?.name)}</p>
            <p>${esc(row.contact_name)} · Phone: ${esc(row.phone_number)} · WhatsApp: ${esc(row.whatsapp_number)} · ${esc(label(row.status))}</p>
            <button type="button" data-view="${esc(row.id)}">View application</button></article>`).join('') || '<p>No matching applications.</p>';
        const row = rows.find(r => r.id === selected);
        find('[data-detail]').innerHTML = row ? `<h3>${esc(row.application_number)} — ${esc(row.business_name)}</h3>
            <dl>${Object.entries({ Status: label(row.status), Campus: row.campuses?.name, Category: row.category_slug,
                Contact: row.contact_name, Phone: row.phone_number, WhatsApp: row.whatsapp_number, Email: row.email,
                Location: row.location, Description: row.description, Submitted: date(row.submitted_at),
                Reviewed: date(row.reviewed_at), 'Review notes': row.review_notes, 'Rejection reason': row.rejection_reason,
                'Linked vendor': row.vendors?.name }).map(([key, value]) => `<dt><strong>${esc(key)}</strong></dt><dd style="white-space:pre-wrap;margin-bottom:8px">${esc(value || '—')}</dd>`).join('')}</dl>
            <div style="display:flex;gap:10px;flex-wrap:wrap">${actionsForStatus(row.status).map(action => `<button type="button" data-action="${action.target}" ${busy ? 'disabled' : ''}>${action.label}</button>`).join('')}</div>` : '';
        find('[data-refresh]').disabled = busy;
    }
    async function load() {
        const version = ++generation;
        rows = []; render(); message('Loading applications…');
        const result = await fetchApplications();
        if (version !== generation) return false;
        if (!result.success) { message(result.error); return false; }
        rows = result.rows; render(); message(`${rows.length} applications`); return true;
    }
    function reset() { generation++; rows = []; selected = null; busy = false; render(); message(''); }
    find('[data-filter]').addEventListener('change', render);
    find('[data-search]').addEventListener('input', render);
    root.addEventListener('click', async event => {
        const button = event.target.closest('button');
        if (!button || busy) return;
        if (button.hasAttribute('data-refresh')) { await load(); return; }
        if (button.dataset.view) { selected = button.dataset.view; render(); return; }
        const row = rows.find(r => r.id === selected), target = button.dataset.action;
        if (!row || !actionsForStatus(row.status).some(a => a.target === target)) return;
        let note = '', reason = '';
        if (target === 'APPROVED') {
            if (!window.confirm(`Approve ${row.application_number}?\nBusiness: ${row.business_name}\nCampus: ${row.campuses?.name || 'Unknown'}\nCategory: ${row.category_slug}\n\nBy approving, you confirm that CLX has reviewed and verified the submitted business and contact details. Approval creates an active, verified vendor record or links an existing verified vendor, with its campus association. It does not create products, services, or vendor login credentials.`)) return;
        } else {
            const input = window.prompt(target === 'REJECTED' ? 'Required rejection reason (maximum 2000 characters):' : target === 'NEEDS_INFORMATION' ? 'Required information request (maximum 2000 characters):' : 'Optional review note (maximum 2000 characters):', '');
            if (input === null) return;
            if (target === 'REJECTED') reason = input; else note = input;
        }
        const version = generation;
        busy = true; render(); message('Saving review…');
        const result = target === 'APPROVED' ? await approveApplication(row.id) : await reviewApplication(row.id, target, note, reason);
        if (version !== generation) return;
        if (!result.success) { busy = false; render(); message(result.error); return; }
        // No optimistic status edits: discard cached rows, then read authoritative data.
        const refreshed = await load();
        busy = false; render();
        if (refreshed) message(result.alreadyApproved ? 'Application was already approved.' : 'Application updated.');
    });
    return { load, reset };
}
