/**
 * Campus Life Express (CLX) - Supabase Client Module
 * Phase 1: Live Supabase Catalogue Integration
 *
 * BROWSER-SAFE CONFIGURATION ONLY.
 * - Uses the Supabase anon/public key, which is designed for browser use
 *   and protected by Row-Level Security policies.
 * - NEVER place a service_role key, database password, or any other
 *   admin/server secret in this file or in any VITE_* env variable.
 *
 * Priority for credentials:
 *   1. Vite env vars: import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *   2. Window overrides injected at runtime: window.__CLX_SUPABASE_URL__ / window.__CLX_SUPABASE_ANON_KEY__
 *
 * If no configuration is found, this module degrades gracefully to null and
 * callers fall back to the controlled static seed data in data.js.
 */

import { createClient } from '@supabase/supabase-js';

let envUrl = '';
let envKey = '';
try {
    // Vite-injected environment variables (build-time)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        envUrl = import.meta.env.VITE_SUPABASE_URL || '';
        envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    }
} catch { /* not running under Vite */ }

// Runtime override (e.g. injected via index.html for non-bundled preview hosting)
if (!envUrl && typeof window !== 'undefined') envUrl = window.__CLX_SUPABASE_URL__ || '';
if (!envKey && typeof window !== 'undefined') envKey = window.__CLX_SUPABASE_ANON_KEY__ || '';

export const SUPABASE_URL = envUrl;
export const SUPABASE_ANON_KEY = envKey;

export const isSupabaseConfigured = Boolean(envUrl && envKey);

let client = null;
if (isSupabaseConfigured) {
    try {
        client = createClient(envUrl, envKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });
        console.info('[CLX Supabase] Live catalogue source active.');
    } catch (err) {
        console.warn('[CLX Supabase] Client initialization failed:', err.message);
        client = null;
    }
} else {
    console.warn('[CLX Supabase] Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing). Using controlled static fallback data.');
}

export function getSupabaseClient() {
    return client;
}

/**
 * Wraps a Supabase query, returning a normalized result envelope
 * identical in shape to the api.js convention: { success, data, error }.
 * Raw database error details are never surfaced to the UI layer.
 */
export async function supabaseQuery(queryFn, contextLabel = 'query') {
    if (!client) {
        return { success: false, configured: false, data: null, error: { message: 'Supabase not configured' } };
    }
    try {
        const { data, error } = await queryFn(client);
        if (error) {
            // Full details only in the console for development; never returned raw to the UI.
            console.warn(`[CLX Supabase] ${contextLabel} failed:`, error.message, error.code || '', error.details || '', error.hint || '');
            return { success: false, configured: true, data: null, error: { message: error.message, code: error.code || null } };
        }
        return { success: true, configured: true, data, error: null };
    } catch (err) {
        console.warn(`[CLX Supabase] ${contextLabel} threw:`, err.message);
        return { success: false, configured: true, data: null, error: { message: err.message, code: 'SUPABASE_REQUEST_FAILED' } };
    }
}
