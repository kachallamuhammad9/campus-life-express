import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';

const PROFILE_FIELDS = 'id,email,full_name,phone_number,default_campus_id,is_active,created_at,updated_at';
const AUTH_CHANGE_EVENT = 'clx:auth-changed';

function client() {
    return getSupabaseClient();
}

function currentPath() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function safeReturnTo(value, fallback = '/account') {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
    return value;
}

export function authMessage(error, fallback = 'Something went wrong. Please try again.') {
    const text = String(error?.message || error || '');
    if (/invalid login credentials/i.test(text)) return 'Invalid email or password.';
    if (/email not confirmed/i.test(text)) return 'Please confirm your email address before signing in.';
    if (/already registered|already exists/i.test(text)) return 'An account with this email may already exist.';
    if (/password/i.test(text) && /characters|weak|strength/i.test(text)) return 'Choose a stronger password with at least 8 characters.';
    if (/rate limit|too many/i.test(text)) return 'Too many attempts. Please wait a moment and try again.';
    if (/network|fetch/i.test(text)) return 'Unable to connect. Check your connection and try again.';
    return fallback;
}

export function getPasswordError(password, confirmation = null) {
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must include at least one letter and one number.';
    if (confirmation !== null && password !== confirmation) return 'Passwords do not match.';
    return '';
}

export async function getSession() {
    const supabase = client();
    if (!supabase) return { session: null, user: null, configured: false };
    const { data, error } = await supabase.auth.getSession();
    return { session: data?.session || null, user: data?.session?.user || null, configured: true, error };
}

export async function getCurrentUser() {
    const result = await getSession();
    return result.user;
}

export async function loadProfile(userId = null) {
    const supabase = client();
    const user = await getCurrentUser();
    const id = userId || user?.id;
    if (!supabase || !id || (user && id !== user.id)) return null;
    const { data, error } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
}

export async function ensureProfile(user, profile = {}) {
    const supabase = client();
    if (!supabase || !user) return null;
    const existing = await loadProfile(user.id);
    if (existing) return existing;
    const campusId = await resolveCampusId(profile.campusId);
    const record = {
        id: user.id,
        email: user.email || '',
        full_name: String(profile.fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'CLX Customer').trim(),
        phone_number: profile.phone ? String(profile.phone).trim() : (user.user_metadata?.phone || null),
        default_campus_id: campusId
    };
    const { data, error } = await supabase.from('profiles').upsert(record, { onConflict: 'id' }).select(PROFILE_FIELDS).single();
    if (error) throw error;
    return data;
}

async function resolveCampusId(campusRef) {
    if (!campusRef || /^[0-9a-f-]{36}$/i.test(campusRef)) return campusRef || null;
    const { data: campus, error } = await client().from('campuses').select('id').eq('slug', campusRef).maybeSingle();
    if (error) throw error;
    return campus?.id || null;
}

export async function signUp({ fullName, email, phone, userType, campusId, password, redirectTo = null }) {
    const supabase = client();
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const signupPassword = password || document.querySelector('#signup-form #password')?.value || '';
    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: signupPassword,
        options: {
            emailRedirectTo: redirectTo || `${window.location.origin}/account`,
            data: { full_name: fullName.trim(), phone: phone.trim(), user_type: userType }
        }
    });
    if (error) throw error;
    if (data.user && data.session) await ensureProfile(data.user, { fullName, phone, userType, campusId });
    emitAuthChange(data.user || null);
    return data;
}

export async function signIn(email, password) {
    const supabase = client();
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    if (data.user) {
        try { await ensureProfile(data.user); } catch (profileError) { console.warn('[CLX Auth] Profile sync unavailable:', profileError.message); }
    }
    emitAuthChange(data.user || null);
    return data;
}

export async function signOut() {
    const supabase = client();
    if (supabase) await supabase.auth.signOut();
    emitAuthChange(null);
}

export async function sendPasswordReset(email) {
    const supabase = client();
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) throw error;
}

export async function updatePassword(password) {
    const supabase = client();
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return data;
}

export async function updateProfile(fields) {
    const supabase = client();
    const user = await getCurrentUser();
    if (!supabase || !user) throw new Error('Please sign in to update your profile.');
    const allowed = {};
    if (fields.fullName !== undefined) allowed.full_name = String(fields.fullName).trim();
    if (fields.phone !== undefined) allowed.phone_number = String(fields.phone).trim();
    if (fields.campusId !== undefined) allowed.default_campus_id = await resolveCampusId(fields.campusId);
    const { data, error } = await supabase.from('profiles').update(allowed).eq('id', user.id).select(PROFILE_FIELDS).single();
    if (error) throw error;
    return data;
}

export function emitAuthChange(user) {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: { user } }));
}

export function onAuthChange(callback) {
    const supabase = client();
    if (!supabase) return { unsubscribe() {} };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        callback(session?.user || null, event);
        emitAuthChange(session?.user || null);
    });
    return data.subscription;
}

export async function requireAuth({ allowCheckout = false } = {}) {
    const result = await getSession();
    if (result.user) return result.user;
    if (allowCheckout) return null;
    const returnTo = encodeURIComponent(currentPath());
    window.location.replace(`/login?returnTo=${returnTo}`);
    return null;
}

function ensureLink(container, id, href, label) {
    let link = container.querySelector(`[data-clx-auth-link="${id}"]`);
    if (!link) {
        link = document.createElement('a');
        link.dataset.clxAuthLink = id;
        link.href = href;
        link.style.cssText = 'font-weight:600;color:var(--color-primary);';
        container.appendChild(link);
    }
    link.href = href;
    link.textContent = label;
    return link;
}

export async function updateAuthNavigation() {
    const user = await getCurrentUser();
    const isLoggedIn = Boolean(user);
    const returnTo = encodeURIComponent(currentPath());
    document.querySelectorAll('header a[href="/account"]').forEach(link => {
        link.href = isLoggedIn ? '/account' : `/login?returnTo=${returnTo}`;
        link.textContent = isLoggedIn ? 'My Account' : 'Sign In';
        link.setAttribute('aria-label', isLoggedIn ? 'My Account' : 'Sign in');
    });
    document.querySelectorAll('header a[href="/orders"]').forEach(link => {
        link.href = isLoggedIn ? '/orders' : `/login?returnTo=${returnTo}`;
        link.textContent = isLoggedIn ? 'My Orders' : 'Sign In';
    });
    document.querySelectorAll('.desktop-nav ul, .mobile-menu ul').forEach(container => {
        if (isLoggedIn) {
            const logout = ensureLink(container, 'logout', '#', 'Logout');
            logout.onclick = async event => { event.preventDefault(); await signOut(); window.location.replace('/'); };
            logout.style.color = '#B91C1C';
            container.querySelector('[data-clx-auth-link="signup"]')?.remove();
        } else {
            const signup = ensureLink(container, 'signup', `/signup?returnTo=${returnTo}`, 'Create Account');
            signup.style.color = 'var(--color-primary)';
            container.querySelector('[data-clx-auth-link="logout"]')?.remove();
        }
    });
}

export { isSupabaseConfigured };
