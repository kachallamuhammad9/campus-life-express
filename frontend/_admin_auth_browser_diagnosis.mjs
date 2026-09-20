import {chromium} from './.vercel/phase4e1-browser-tools/node_modules/playwright/index.mjs';
import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
const env=parse(readFileSync(new URL('.env.local',import.meta.url)));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Users/hp/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
 const page=await browser.newPage();
 let attempts=0,admin=null;
 await page.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(process.argv.includes('--inspect-only')&&!['GET','HEAD','OPTIONS'].includes(r.method()))return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(r.method())){
   const auth=u.hostname==='bdjfkuddpupqaswzkrth.supabase.co'&&u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password';
   const permitted=u.hostname==='bdjfkuddpupqaswzkrth.supabase.co'&&['/rest/v1/rpc/is_admin','/auth/v1/logout'].includes(u.pathname);
   if(auth){if(++attempts>1)return route.abort();}else if(!permitted)return route.abort();
  }
  return route.continue();
 });
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/rest/v1/rpc/is_admin'){try{admin=(await r.json())===true;}catch{}}});
 await page.goto('https://frontend-nine-liard-84.vercel.app/admin.html');
 await page.locator('#admin-email').fill(env.CLX_QA_ADMIN_EMAIL);
 await page.locator('#admin-password').fill(env.CLX_QA_ADMIN_PASSWORD);
 if(process.argv.includes('--inspect-only')){console.log(JSON.stringify({emailHTMLValid:await page.locator('#admin-email').evaluate(el=>el.checkValidity()),passwordNonblank:await page.locator('#admin-password').evaluate(el=>!!el.value),authRequests:0}));await browser.close();browser=null;process.exit(0);}
 await page.locator('#admin-signin').click();
 await page.waitForTimeout(7000);
 const text=await page.locator('body').innerText();
 const safe=['Enter a valid email address to continue.','Invalid email or password.','This email address has not been confirmed yet.','Access denied.','Sign in failed. Please try again.','Network error. Please check your connection and try again.'].find(m=>text.includes(m));
 console.log(JSON.stringify({result:admin===true?'LOGIN SUCCEEDS':'LOGIN FAILS',adminAuthorized:admin,sanitizedVisibleError:safe||null,passwordAttempts:attempts}));
}catch{console.log('Browser diagnosis unavailable: execution failed; sensitive details suppressed.');process.exitCode=1;}finally{await browser?.close();}
