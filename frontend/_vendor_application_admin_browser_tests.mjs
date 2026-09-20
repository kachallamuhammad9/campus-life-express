// Local UI-only test. All Supabase/auth behavior is mocked; external requests blocked.
import { chromium } from './.vercel/phase4e1-browser-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const mock = `
const row={id:'local-hidden-id',application_number:'LOCAL-APPLICATION',business_name:'Local Shop',contact_name:'Local Person',phone_number:'08000000000',whatsapp_number:'08000000000',status:'PENDING',category_slug:'food',campuses:{name:'Local Campus'},submitted_at:'2026-01-01',description:'Local browser fixture'};
window.localCalls=[]; window.localReads=0;
const client={from(table){const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>{if(table==='vendor_applications')window.localReads++;resolve({data:table==='vendor_applications'?[structuredClone(row)]:[],error:null})};return ()=>q}});return q},async rpc(name,p){window.localCalls.push({name,p});await new Promise(r=>setTimeout(r,100));row.status=p.p_target_status||'APPROVED';if(row.status==='APPROVED')row.vendors={name:row.business_name};return {data:{application_number:row.application_number,status:row.status,already_approved:false}}}};
export const getSupabaseClient=()=>client;`;
const auth = `export const getSessionUser=async()=>({user:{id:'local-admin',email:'local@example.invalid'}});
export const isAuthorizedAdmin=async()=>({authorized:true}); export const getUserRoles=async()=>['ADMIN'];
export const signIn=async()=>({success:false}); export const signOut=async()=>{}; export const onAuthChange=()=>{};`;
const server = createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/js/supabase.js'||path==='/js/admin-auth.js'){res.setHeader('Content-Type','text/javascript');res.end(path.includes('admin-auth')?auth:mock);return;}
    if(!/^\/(admin\.html|js\/[a-z-]+\.js|css\/main\.css|images\/clx\.png)$/.test(path)){res.writeHead(404);res.end();return;}
    try{res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':'text/html');res.end(readFileSync(new URL('.'+path,import.meta.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CLX_TEST_CHROME || 'C:/Users/hp/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
try{
    const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.fulfill({status:200,body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:'+server.address().port+'/admin.html');
    const root=page.locator('#vendor-applications-admin');
    await root.getByRole('button',{name:'View application'}).click();
    assert.equal(await root.locator('[data-action]').count(),4);
    assert(!(await root.innerText()).includes('local-hidden-id'));
    page.once('dialog',d=>d.accept('Local information request'));
    await root.getByRole('button',{name:'Request Information',exact:true}).click();
    await root.getByRole('button',{name:'Resume Review',exact:true}).waitFor();
    assert.equal(await root.locator('[data-action]').count(),2);
    page.once('dialog',d=>d.accept('Local review note'));
    await root.getByRole('button',{name:'Resume Review',exact:true}).click();
    await root.getByRole('button',{name:'Approve',exact:true}).waitFor();
    const dialogPromise=page.waitForEvent('dialog');
    const click=root.getByRole('button',{name:'Approve',exact:true}).click();
    const dialog=await dialogPromise;
    for(const text of ['LOCAL-APPLICATION','Local Shop','Local Campus','food','products','services','vendor login'])assert(dialog.message().includes(text));
    await dialog.accept(); await click;
    await root.locator('[data-detail] dt').filter({hasText:'Linked vendor'}).waitFor();
    await page.waitForFunction(()=>window.localReads>=4);
    assert.equal(await root.locator('[data-action]').count(),0);
    assert.equal(await page.evaluate(()=>window.localCalls.length),3);
    assert.deepEqual(await page.evaluate(()=>window.localCalls.map(c=>c.name)),['admin_review_vendor_application','admin_review_vendor_application','admin_approve_vendor_application']);
    assert.deepEqual(errors,[]);
    await page.getByRole('button',{name:'Sign Out',exact:true}).click();
    assert.equal(await root.locator('[data-list]').innerText(),'No matching applications.');
    assert.equal(await page.locator('#admin-content').isVisible(),false);
    console.log('PASS: local admin auth integration, state actions, approval confirmation, RPC-only writes, authoritative refresh, hidden IDs, sign-out clearing; no page errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
