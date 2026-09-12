/**
 * CLX Phase 4A — Admin Authentication & Authorization (Supabase Auth)
 *
 * Authorization model:
 *   - Session comes from Supabase Auth only (signInWithPassword / getSession).
 *   - Authorization is database-authoritative via the existing public.is_admin()
 *     SECURITY DEFINER helper (migration 0013), which checks public.user_roles
 *     for ADMIN or SUPER_ADMIN against auth.uid().
 *   - No email allow-lists, no localStorage admin flags, no service_role key.
 *
 * Privacy: passwords, access tokens and refresh tokens are never logged or
 * stored by this module. Supabase's own session persistence is used as-is.
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';

// Obsolete Express-era keys removed on sign out (verified obsolete in api.js).
const LEGACY_AUTH_KEYS = ['clx_auth_token', 'clx_user_profile'];

function client() {
    return getSupabaseClient();
}

/**
 * Race a promise against a timeout. Never grants access — callers must treat a
 * timeout as 'unknown' and default to the signed-out/denied UI (fail-safe).
 */
const INIT_TIMEOUT_MS = 8000;
function withTimeout(promise, label) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve({ __timeout: true, label }), INIT_TIMEOUT_MS))
    ]);
}

/**
 * Maps a Supabase Auth error to a safe, user-facing message.
 * Never includes tokens or underlying provider details beyond the code.
 */
function toSigninMessage(error) {
    const code = error?.code || error?.status || '';
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message || '')) {
        return 'Invalid email or password.';
    }
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '')) {
        return 'This email address has not been confirmed yet.';
    }
    if (/failed to fetch|network/i.test(error?.message || '')) {
        return 'Unable to connect. Check your internet connection and try again.';
    }
    if (/too many requests/i.test(error?.message || '')) {
        return 'Too many attempts. Please wait a moment and try again.';
    }
    return 'Sign in failed. Please try again.';
}

/**
 * Returns the authenticated user from the restored Supabase session,
 * or null when signed out. Restores the session if the client persisted one.
 */
export async function getSessionUser() {
    const supabase = client();
    if (!supabase) return { user: null, configured: false };
    try {
        const result = await withTimeout(supabase.auth.getSession(), 'getSession');
        if (result?.__timeout) return { user: null, configured: true, error: 'Session check timed out.', timeout: true };
        const { data, error } = result;
        if (error) return { user: null, configured: true, error: error.message };
        return { user: data?.session?.user || null, configured: true, error: null };
    } catch (err) {
        return { user: null, configured: true, error: err?.message || 'Session check failed.' };
    }
}

/**
 * Database-authoritative admin check for the CURRENT authenticated user.
 * Uses public.is_admin() — SECURITY DEFINER, EXECUTE granted to authenticated
 * in migration 0013. It reads public.user_roles for auth.uid().
 * @returns {Promise<{authorized: boolean, reason?: string}>}
 */
export async function isAuthorizedAdmin() {
    const supabase = client();
    if (!supabase) return { authorized: false, reason: 'Supabase is not configured.' };
    try {
        const result = await withTimeout(supabase.rpc('is_admin'), 'is_admin');
        if (result?.__timeout) return { authorized: false, reason: 'Authorization check timed out.' };
        const { data, error } = result;
        if (error) return { authorized: false, reason: 'Authorization check failed.' };
        return { authorized: data === true };
    } catch (err) {
        return { authorized: false, reason: 'Authorization check failed.' };
    }
}

/**
 * Best-effort display of the current user's database roles (for the shell UI).
 * Backed by user_roles RLS (select own, migration 0015). Never authoritative —
 * isAuthorizedAdmin() remains the only gate.
 */
export async function getUserRoles(userId) {
    const supabase = client();
    if (!supabase || !userId) return [];
    try {
        const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userId);
        if (error) return [];
        return (data || []).map((row) => row.role).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Sign in with email + password using Supabase Auth.
 * Returns { success, user?, message? }. Credentials are never logged or stored.
 */
export async function signIn(email, password) {
    const supabase = client();
    if (!supabase) return { success: false, message: 'Admin authentication is temporarily unavailable. Please contact the CLX administrator.' };
    if (!email || !password) return { success: false, message: 'Enter your email and password.' };
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { success: false, message: toSigninMessage(error) };
        const user = data?.user || null;
        if (!user) return { success: false, message: 'Sign in failed. Please try again.' };
        const auth = await isAuthorizedAdmin();
        if (!auth.authorized) {
            // Valid credentials but no ADMIN/SUPER_ADMIN role: end the session
            // so an unauthorized user is never left holding a live session here.
            await signOut();
            return { success: false, denied: true, message: 'Access denied.' };
        }
        return { success: true, user };
    } catch (err) {
        return { success: false, message: 'Unable to connect. Check your internet connection and try again.' };
    }
}

/**
 * Sign out via Supabase Auth, then clear only obsolete Express auth keys.
 * Cart (clx_cart_items), tracking credentials (clx_tracking_orders) and campus
 * preferences are deliberately preserved.
 */
export async function signOut() {
    const supabase = client();
    try {
        if (supabase) await supabase.auth.signOut();
    } catch { /* session may already be gone */ }
    try {
        LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch { /* storage unavailable */ }
}

/**
 * Single auth state listener. Guarded so repeated calls never attach duplicates.
 * @param {(event: string) => void} callback receives 'SIGNED_IN' | 'SIGNED_OUT'
 * @returns unsubscribe function
 */
let listenerAttached = false;
export function onAuthChange(callback) {
    const supabase = client();
    if (!supabase || typeof callback !== 'function') return () => {};
    if (listenerAttached) return () => {};
    listenerAttached = true;
    const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
        // Keep the callback minimal: never await auth calls directly inside the
        // listener (lifecycle/race risk). Schedule the heavier work instead.
        setTimeout(() => { try { callback(event); } catch { /* never throw in listener */ } }, 0);
    });
    return () => { data?.subscription?.unsubscribe?.(); listenerAttached = false; };
}

export { isSupabaseConfigured };
