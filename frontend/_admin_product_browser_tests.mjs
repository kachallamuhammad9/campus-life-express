// Loopback only; all database responses mocked and external requests blocked.
import { chromium } from './.vercel/phase4e1-browser-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const mock = `
const product={id:'p',name:'Rice',category_id:'cat',subcategory_id:null,price_kobo:125000,original_price_kobo:150000,description:'Description',image_url:'https://example.invalid/a.png',stock_quantity:5,is_in_stock:true};
window.calls=[];window.reads=0;window.fail=false;
const rows={vendors:[{id:'v',name:'Local Vendor',status:'ACTIVE',is_verified:true}],categories:[{id:'cat',name:'Food',parent_id:null}],vendor_campuses:[{campuses:{id:'c',name:'Campus',is_active:true}}]};
const client={from(table){const q=new Proxy({}, {get(_,k){if(k==='then')return resolve=>{if(table==='products')window.reads++;resolve({data:table==='products'?[structuredClone(product)]:rows[table]||[],error:null})};return ()=>q}});return q},async rpc(name,p){window.calls.push({name,p});if(window.fail)return {error:{message:'Local validation failure'}};if(name==='admin_update_product')Object.assign(product,p.p_patch);else Object.assign(product,{name:p.p_name,price_kobo:p.p_price_kobo});return {data:structuredClone(product)}}};
export const getSupabaseClient=()=>client;`;
const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
    if(path==='/css/main.css')return res.end(readFileSync(new URL('./css/main.css',import.meta.url)));
    if(path==='/js/supabase.js')return res.end(mock);
    if(path==='/')return res.end(`<meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><div id="root" style="padding:24px"></div><script type="module">import {createAdminProducts} from '/js/admin-products.js';window.ui=createAdminProducts(document.querySelector('#root'));await window.ui.init();</script>`);
    if(path==='/js/admin-products.js')return res.end(readFileSync(new URL('./js/admin-products.js',import.meta.url)));
    res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS: '+name);}
try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CLX_TEST_CHROME||'C:/Users/hp/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
    const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.selectOption('#ap-vendor-select','v');await page.selectOption('#ap-campus-select','c');
    await page.locator('[data-edit]').waitFor();
    await test('initial render and metadata reads perform no product mutation',async()=>{
        assert.equal(await page.evaluate(()=>window.calls.length),0);
    });
    await test('modal starts hidden; no Delete or Popular controls',async()=>{
        assert.equal(await page.locator('#ap-modal-overlay').isVisible(),false);
        assert.equal(await page.getByRole('button',{name:/delete/i}).count(),0);
        assert.equal(await page.locator('#ap-f-popular').count(),0);
    });
    await test('search and stock filters work',async()=>{
        await page.fill('#ap-search','missing');assert.equal(await page.locator('[data-edit]').count(),0);
        await page.fill('#ap-search','rice');assert.equal(await page.locator('[data-edit]').count(),1);
        await page.selectOption('#ap-stock-filter','out');assert.equal(await page.locator('[data-edit]').count(),0);
        await page.selectOption('#ap-stock-filter','');await page.fill('#ap-search','');
        assert.equal(await page.evaluate(()=>window.calls.length),0);
    });
    await page.click('[data-edit]');
    await test('edit vendor and campus are read only',async()=>{
        assert.match(await page.locator('#ap-form-vendor-info').innerText(),/immutable/);
        assert.equal(await page.locator('#ap-form-vendor-info input,#ap-form-vendor-info select').count(),0);
    });
    await test('failed mutation preserves populated form',async()=>{
        await page.evaluate(()=>window.fail=true);await page.fill('#ap-f-name','Edited Rice');await page.click('#ap-form-submit');
        await page.locator('#ap-form-error').waitFor();assert.equal(await page.inputValue('#ap-f-name'),'Edited Rice');
        assert.equal(await page.locator('#ap-modal-overlay').isVisible(),true);
    });
    await test('nullable clears use JSON null; success refreshes authoritative list',async()=>{
        await page.evaluate(()=>window.fail=false);
        for(const id of ['description','image-url','original-price','stock-qty'])await page.fill('#ap-f-'+id,'');
        const reads=await page.evaluate(()=>window.reads);await page.click('#ap-form-submit');
        await page.waitForFunction(n=>window.reads>n,reads);
        const call=await page.evaluate(()=>window.calls.at(-1));assert.equal(call.name,'admin_update_product');
        assert.deepEqual(call.p.p_patch,{name:'Edited Rice',description:null,image_url:null,original_price_kobo:null,stock_quantity:null});
        assert.equal(await page.locator('#ap-modal-overlay').isVisible(),false);
        assert.match(await page.locator('#ap-table-wrap').innerText(),/Edited Rice/);
    });
    await test('add validates decimal amounts and converts Naira to kobo',async()=>{
        await page.click('#ap-add-btn');await page.fill('#ap-f-name','New Rice');await page.selectOption('#ap-f-category','cat');
        await page.fill('#ap-f-price','1250.555');const count=await page.evaluate(()=>window.calls.length);
        await page.click('#ap-form-submit');assert.equal(await page.evaluate(()=>window.calls.length),count);
        await page.fill('#ap-f-price','1250.50');
        await test('failed create preserves inputs and modal',async()=>{
            await page.evaluate(()=>window.fail=true);await page.click('#ap-form-submit');
            await page.locator('#ap-form-error').waitFor();
            assert.equal(await page.inputValue('#ap-f-name'),'New Rice');
            assert.equal(await page.inputValue('#ap-f-price'),'1250.50');
            assert.equal(await page.locator('#ap-modal-overlay').isVisible(),true);
            await page.evaluate(()=>window.fail=false);
        });
        await page.click('#ap-form-submit');
        await page.waitForFunction(()=>window.calls.at(-1).name==='admin_create_product');
        const p=await page.evaluate(()=>window.calls.at(-1).p);assert.equal(p.p_price_kobo,125050);
        assert.equal(p.p_vendor_id,'v');assert.equal(p.p_campus_id,'c');assert(!('p_is_popular' in p));
    });
    await test('refresh and stock toggle reread server',async()=>{
        await page.locator('#ap-modal-overlay').waitFor({state:'hidden'});
        const reads=await page.evaluate(()=>window.reads);await page.click('#ap-refresh');await page.waitForFunction(n=>window.reads>n,reads);
        page.once('dialog',d=>d.accept());await page.click('[data-toggle-stock]');
        await page.waitForFunction(()=>window.calls.at(-1).p.p_patch?.is_in_stock===false);
    });
    await page.click('[data-edit]');
    await page.screenshot({path:fileURLToPath(new URL('./.vercel/admin-product-test.png',import.meta.url)),fullPage:true});
    await test('reset clears catalogue and modal without browser errors',async()=>{
        await page.evaluate(()=>window.ui.reset());assert.equal(await page.locator('[data-edit]').count(),0);assert.deepEqual(errors,[]);
    });
    console.log(`${passed} passed, 0 failed`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
