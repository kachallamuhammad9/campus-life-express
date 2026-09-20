// Phase 4B QA: sign in with admin credentials from environment variables
// (CLX_QA_ADMIN_EMAIL / CLX_QA_ADMIN_PASSWORD), never printed. Then verify
// the operations dashboard renders and network traffic is read-only.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const envText = ['.env.local', '.env', '.env.qa']
    .map((f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } })
    .join('\n');
const getEnv = (key) => (envText.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1]?.trim();

export default async function run(page, ui) {
    const email = process.env.CLX_QA_ADMIN_EMAIL || getEnv('CLX_QA_ADMIN_EMAIL');
    const password = process.env.CLX_QA_ADMIN_PASSWORD || getEnv('CLX_QA_ADMIN_PASSWORD');
    if (!email || !password) return { skipped: 'no QA admin credentials in env — signed-out QA only' };

    // Capture all network requests to classify read vs write.
    const requests = [];
    page.on('request', (r) => requests.push(r.method() + ' ' + r.url()));
    page.on('requestfailed', (r) => requests.push('FAILED ' + r.method() + ' ' + r.url()));

    await page.fill('#admin-email', email);
    await page.fill('#admin-password', password);
    await page.click('#admin-signin');
    await page.waitForSelector('#admin-content:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(3500); // allow ops queue fetch

    const state = await page.evaluate(() => ({
        authorized: !document.getElementById('admin-content').hidden,
        queueCards: document.querySelectorAll('#ops-queue > div').length,
        stateText: document.getElementById('ops-state').textContent,
        filterCount: document.querySelectorAll('#ops-filter-buttons button').length,
        firstOrderNumber: document.querySelector('#ops-queue strong')?.textContent || null,
        mutationButtons: [...document.querySelectorAll('#ops-queue button, #ops-detail-content button')].map((b) => b.textContent).filter((t) => !t.includes('View Details') && t !== '✕')
    }));

    // Open detail modal on the first order if present.
    let detail = null;
    const viewBtn = await page.$('.ops-view-detail');
    if (viewBtn) {
        await viewBtn.click();
        await page.waitForTimeout(400);
        detail = await page.evaluate(() => ({
            open: !document.getElementById('ops-detail-overlay').hidden,
            hasVendorGroups: document.getElementById('ops-detail-content').textContent.includes('Subtotal'),
            hasItemsTable: !!document.querySelector('#ops-detail-content table'),
            showsToken: /tracking[_ ]?token|jwt|bearer/i.test(document.getElementById('ops-detail-content').textContent)
        }));
        await page.keyboard.press('Escape');
    }

    const writes = requests.filter((r) => /POST|PATCH|PUT|DELETE/.test(r) && !/auth\/v1\/(token|logout|user)/.test(r));
    const express = requests.filter((r) => /clx-backend|onrender/i.test(r));
    return { state, detail, writeRequests: writes, expressRequests: express, totalRequests: requests.length };
}
