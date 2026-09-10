/**
 * Campus Life Express (CLX) — Vendor Registration Intake
 * PHASE 4E.1 — Real Supabase submission via public.submit_vendor_application RPC.
 *
 * SECURITY NOTES:
 * - Uses the browser-safe anon Supabase client only (no service_role).
 * - The browser never sets status, application_number, review fields, or ids.
 * - No direct INSERT into vendor_applications; submission happens ONLY via RPC.
 * - No live vendor creation (vendors / vendor_campuses / user_roles untouched).
 */

import { getSupabaseClient, supabaseQuery } from './supabase.js';

const WA_ME_NUMBER = '2349150736638'; // Official CLX WhatsApp (machine form)

const state = {
    submitting: false
};

function el(id) {
    return document.getElementById(id);
}

function setFormError(message) {
    const box = el('onboard-error');
    if (box) {
        box.textContent = message || '';
        box.style.display = message ? 'block' : 'none';
    }
}

function setSubmitting(submitting) {
    state.submitting = submitting;
    const btn = el('onboard-submit-btn');
    if (btn) {
        btn.disabled = submitting;
        btn.dataset.submitting = submitting ? 'true' : 'false';
        btn.textContent = submitting ? 'Submitting…' : 'Submit Vendor Application';
    }
}

/** Load active campuses from live Supabase and populate the campus select. */
export async function loadCampuses() {
    const select = el('onboard-campus-select');
    if (!select) return;

    const result = await supabaseQuery(
        (sb) => sb.from('campuses')
            .select('id, name, short_name')
            .eq('is_active', true)
            .order('name', { ascending: true }),
        'vendor-onboarding: load campuses'
    );

    // Clear hardcoded options; rebuild from live data
    select.innerHTML = '';

    if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Campuses unavailable — please try again later';
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select campus…';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    for (const campus of result.data) {
        const opt = document.createElement('option');
        opt.value = campus.id;
        opt.textContent = campus.name || campus.short_name;
        select.appendChild(opt);
    }

    // Auto-select when exactly one active campus exists
    if (result.data.length === 1) {
        select.value = result.data[0].id;
    }
}

/** Client-side validation. Returns payload object or null. */
export function validateForm() {
    const businessName = (el('onboard-business-name')?.value || '').trim();
    const contactPerson = (el('onboard-contact-person')?.value || '').trim();
    const phone = (el('onboard-phone')?.value || '').trim();
    const whatsapp = (el('onboard-whatsapp')?.value || '').trim();
    const email = (el('onboard-email')?.value || '').trim();
    const category = el('onboard-category')?.value || '';
    const campusId = el('onboard-campus-select')?.value || '';
    const location = (el('onboard-location')?.value || '').trim();
    const description = (el('onboard-description')?.value || '').trim();

    if (!campusId) return { error: 'Please select your campus.' };
    if (businessName.length < 2) return { error: 'Business name is required (2-150 characters).' };
    if (businessName.length > 150) return { error: 'Business name is too long (max 150 characters).' };
    if (contactPerson.length < 2) return { error: 'Contact person name is required.' };
    if (contactPerson.length > 120) return { error: 'Contact person name is too long (max 120 characters).' };
    if (!phone) return { error: 'Phone number is required.' };
    if (!whatsapp) return { error: 'WhatsApp number is required.' };
    if (email.length > 254) return { error: 'Email is too long (max 254 characters).' };
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Please provide a valid email address.' };
    if (!category) return { error: 'Please select a business category.' };
    if (location.length < 2) return { error: 'Business location is required.' };
    if (location.length > 200) return { error: 'Business location is too long (max 200 characters).' };
    if (description.length > 2000) return { error: 'Description is too long (max 2000 characters).' };

    return {
        payload: {
            // Must match public.submit_vendor_application(...) exactly
            p_campus_id: campusId,
            p_business_name: businessName,
            p_contact_name: contactPerson,
            p_phone_number: phone,
            p_whatsapp_number: whatsapp,
            p_email: email || null,
            p_category_slug: category,
            p_location: location,
            p_description: description || null
        }
    };
}

/** Submit via the secure RPC. Returns { success, data | error }. */
export async function submitApplication(payload) {
    const sb = getSupabaseClient();
    if (!sb) {
        return { success: false, error: { message: 'Supabase is not configured. Please try again later.' } };
    }
    return supabaseQuery(
        (client) => client.rpc('submit_vendor_application', payload),
        'vendor-onboarding: submit application'
    );
}

export function getSubmittedApplication(result) {
    if (!result?.success) return null;
    const app = Array.isArray(result.data) ? (result.data.length === 1 ? result.data[0] : null) : result.data;
    if (typeof app?.application_number !== 'string' || !app.application_number.trim() || app.status !== 'PENDING') return null;
    return app;
}

function showSuccess(app) {
    const appNumber = app.application_number;
    const status = app.status;

    const form = el('vendor-onboard-form');
    const successBox = el('onboard-success');
    if (form) form.style.display = 'none';
    if (!successBox) return;

    const statusLabel = status === 'PENDING' ? 'Pending Review' : status;
    successBox.innerHTML =
        '<h2 style="font-size:20px;font-weight:800;color:var(--gray-900);margin-bottom:8px;">Application submitted successfully.</h2>' +
        '<p style="font-size:14px;color:var(--gray-700);margin-bottom:6px;">Application Number: <strong>' +
        String(appNumber).replace(/[<>&]/g, '') + '</strong></p>' +
        '<p style="font-size:14px;color:var(--gray-700);margin-bottom:12px;">Status: <strong>' + statusLabel + '</strong></p>' +
        '<p style="font-size:13px;color:var(--gray-600);margin-bottom:20px;">The CLX team will review your application and contact you through the details you provided.</p>' +
        '<a href="https://wa.me/' + WA_ME_NUMBER + '?text=' + encodeURIComponent(
            'Hello CLX, I just submitted vendor application ' + appNumber + ' for ' + (app?.business_name || '')
        ) + '" target="_blank" rel="noopener" class="btn btn-primary" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#25D366;color:#fff;font-weight:700;text-decoration:none;">Contact CLX on WhatsApp</a>';
    successBox.style.display = 'block';
}

export async function initVendorOnboarding() {
    const form = el('vendor-onboard-form');
    if (!form) return;

    await loadCampuses();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Duplicate-click / re-entrant protection
        if (state.submitting) return;

        setFormError('');
        const check = validateForm();
        if (check.error) {
            setFormError(check.error);
            return;
        }

        setSubmitting(true);
        try {
            const result = await submitApplication(check.payload);
            const app = getSubmittedApplication(result);
            if (app) {
                showSuccess(app);
                form.reset();
            } else {
                setFormError(result?.error?.message || 'Submission could not be confirmed. Your form has been preserved. Please contact CLX before retrying.');
                setSubmitting(false);
            }
        } catch (err) {
            setFormError('Unexpected error. Please try again.');
            setSubmitting(false);
        }
    });
}

// Auto-init for the onboarding page
if (typeof document !== 'undefined' && document.getElementById('vendor-onboard-form')) {
    initVendorOnboarding();
}
