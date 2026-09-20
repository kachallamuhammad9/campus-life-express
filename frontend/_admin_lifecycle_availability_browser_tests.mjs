// Loopback only. Existing Rice fixture extended to cover both stock states and archive.
import { chromium } from './.vercel/phase4e1-browser-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const admin = read('./admin.html');
const wiring = admin.slice(admin.indexOf('        const applicationAdmin ='), admin.indexOf("        const loading ="));
assert.match(wiring, /editProduct: id => productsAdmin.editProduct\(id\)/);
const mock = `
const rice={id:'p',vendor_id:'v',campus_id:'c',name:'Rice',category_id:'cat',subcategory_id:null,price_kobo:125000,original_price_kobo:null,description:null,image_url:null,stock_quantity:5,is_active:true,is_in_stock:true,vendors:{name:'Local Vendor'},campuses:{name:'Campus'}};
window.products=[rice,{...rice,id:'out',name:'Out Rice',is_in_stock:false},{...rice,id:'archived',name:'Archived Rice',is_active:false}];
window.calls=[];window.reads=[];window.fail=false;window.delay=0;
const rows={vendors:[{id:'v',name:'Local Vendor',status:'ACTIVE',is_verified:true}],categories:[{id:'cat',name:'Food',parent_id:null}],vendor_campuses:[{campuses:{id:'c',name:'Campus',is_active:true}}]};
export const getSupabaseClient=()=>({from(table){let fields='',id=null,single=false;const q={select(s){fields=s;return q},eq(k,v){if(k==='id')id=v;return q},order(){return q},single(){single=true;return q},then(resolve){window.reads.push({table,fields});let data=table==='products'?window.products:rows[table]||[];if(id)data=data.filter(p=>p.id===id);data=structuredClone(data);if(table==='products'&&!fields.includes('*'))data=data.map(p=>Object.fromEntries(fields.split(',').map(k=>[k,p[k]])));resolve({data:single?data[0]:data,error:null})}};return q},async rpc(name,p){window.calls.push({name,p});await new Promise(r=>setTimeout(r,window.delay));if(window.fail)return {error:{message:'Admin authorization required.'}};if(name==='admin_update_product'){const product=window.products.find(x=>x.id===p.p_product_id);Object.assign(product,p.p_patch);if(product.stock_quantity===0)product.is_in_stock=false;return {data:structuredClone(product)}}return {data:{success:true,message:'Completed.'}}}});`;
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
 if(path==='/js/supabase.js')return res.end(mock);
 if(['/js/admin-products.js','/js/admin-lifecycle.js','/css/main.css'].includes(path))return res.end(read('.'+path));
 if(path==='/')return res.end(`<meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><div id="vendor-applications-admin"></div><section id="admin-products-section" style="padding:24px"></section><script type="module">import {createAdminProducts} from '/js/admin-products.js';import {createAdminLifecycle} from '/js/admin-lifecycle.js';const createVendorApplicationsAdmin=()=>({});const createAdminServices=()=>({});${wiring}await productsAdmin.init();await lifecycleAdmin.init();window.ui={productsAdmin,lifecycleAdmin};</script>`);
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS: '+name)};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CLX_TEST_CHROME||'C:/Users/hp/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port);
 const row=id=>page.locator('[data-lifecycle-product="'+id+'"]');
 await row('p').waitFor();
 await test('actual admin wiring renders lifecycle availability without vendor/campus selection',async()=>{
  assert.equal(await row('p').getByRole('button',{name:'Mark Out of Stock',exact:true}).isVisible(),true);
  assert.equal(await row('out').getByRole('button',{name:'Mark Available',exact:true}).isVisible(),true);
  assert.match(await row('p').innerText(),/Vendor: Local Vendor/);
  assert.match(await row('p').innerText(),/Current availability: Available/);
  assert.match(await row('out').innerText(),/Current availability: Out of Stock/);
  for(const name of ['Edit','Archive','Delete'])assert.equal(await row('p').getByRole('button',{name,exact:true}).isVisible(),true);
  assert.equal(await row('archived').locator('[data-action="availability"]').count(),0);
  assert.equal(await row('archived').getByRole('button',{name:'Restore',exact:true}).isVisible(),true);
  assert.equal(await page.evaluate(()=>window.calls.length),0);
 });
 await test('cancel and Escape do not mutate products',async()=>{
  await row('p').getByText('Mark Out of Stock',{exact:true}).click();await page.locator('dialog [data-cancel]').click();
  await row('p').getByText('Mark Out of Stock',{exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.calls.length),0);
 });
 await test('in-stock click sends only existing secure RPC stock patch and refreshes both views',async()=>{
  await page.selectOption('#ap-vendor-select','v');await page.selectOption('#ap-campus-select','c');
  await row('p').getByText('Mark Out of Stock',{exact:true}).click();await page.locator('dialog [data-confirm]').click();
  await row('p').getByText('Mark Available',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),{name:'admin_update_product',p:{p_product_id:'p',p_patch:{is_in_stock:false}}});
  assert.match(await page.locator('[data-product-id="p"]').innerText(),/Mark Available/);
 });
 await test('out-of-stock click sends true and preserves active lifecycle state',async()=>{
  await row('out').getByText('Mark Available',{exact:true}).click();await page.locator('dialog [data-confirm]').click();
  await row('out').getByText('Mark Out of Stock',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),{name:'admin_update_product',p:{p_product_id:'out',p_patch:{is_in_stock:true}}});
  assert.equal(await page.evaluate(()=>window.products.find(p=>p.id==='out').is_active),true);
 });
 await test('failed RPC keeps authoritative availability and shows error',async()=>{
  await page.evaluate(()=>window.fail=true);await row('out').getByText('Mark Out of Stock',{exact:true}).click();await page.locator('dialog [data-confirm]').click();
  await page.waitForFunction(()=>document.querySelector('#lifecycle-message').textContent.includes('Admin authorization required'));
  assert.equal(await row('out').getByText('Mark Out of Stock',{exact:true}).isVisible(),true);
  await page.evaluate(()=>window.fail=false);
 });
 await test('Edit from lifecycle reuses populated product modal and refreshes lifecycle after saving',async()=>{
  await row('p').getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#ap-modal-overlay').waitFor({state:'visible'});
  assert.equal(await page.inputValue('#ap-f-name'),'Rice');assert.match(await page.locator('#ap-form-vendor-info').innerText(),/Local Vendor.*Campus/);
  await page.fill('#ap-f-name','Edited Rice');await page.click('#ap-form-submit');await page.locator('#ap-modal-overlay').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('[data-lifecycle-product="p"]').textContent.includes('Edited Rice'));
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),{name:'admin_update_product',p:{p_product_id:'p',p_patch:{name:'Edited Rice'}}});
 });
 await test('zero quantity respects server response instead of claiming availability',async()=>{
  await page.evaluate(()=>{const p=window.products.find(p=>p.id==='p');p.stock_quantity=0;p.is_in_stock=false;return window.ui.lifecycleAdmin.init()});
  await row('p').getByText('Mark Available',{exact:true}).click();await page.locator('dialog [data-confirm]').click();
  await page.waitForFunction(()=>document.querySelector('#lifecycle-message').textContent==='Product is Out of Stock.');
  assert.equal(await row('p').getByText('Mark Available',{exact:true}).isVisible(),true);
 });
 await test('mobile lifecycle actions remain visible and browser has no runtime errors',async()=>{
  await page.setViewportSize({width:390,height:844});
  for(const name of ['Edit','Mark Available','Archive','Delete'])assert.equal(await row('p').getByRole('button',{name,exact:true}).isVisible(),true);
  const bounds=await row('p').boundingBox();assert(bounds.x+bounds.width<=390);
  assert.deepEqual(errors,[]);
  await page.screenshot({path: fileURLToPath(new URL('./.vercel/lifecycle-availability-mobile.png',import.meta.url)),fullPage:true});
 });
 console.log(passed+' passed, 0 failed');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
