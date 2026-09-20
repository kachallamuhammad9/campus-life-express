import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
const raw=readFileSync(new URL('.env.local',import.meta.url),'utf8');
const local=parse(raw), base=parse(readFileSync(new URL('.env',import.meta.url)));
const env={...base,...local,...process.env};
for(const k of ['CLX_QA_ADMIN_EMAIL','CLX_QA_ADMIN_PASSWORD']) {
 const v=local[k]||'';
 console.log(JSON.stringify({variable:k,present:k in local,nonblank:!!v.trim(),literalBoundaryQuotes:/^["']|["']$/.test(v),boundaryWhitespace:v!==v.trim(),duplicateDefinitions:(raw.match(new RegExp('^\\s*(?:export\\s+)?'+k+'\\s*=','gm'))||[]).length>1,processOverride:process.env[k]!==undefined,resolvedMatchesLocal:env[k]===v}));
}
const url=env.VITE_SUPABASE_URL?.replace(/\/$/,''),key=env.VITE_SUPABASE_ANON_KEY;
const target=url==='https://bdjfkuddpupqaswzkrth.supabase.co';
let keyTarget=false;
try { const p=JSON.parse(Buffer.from(key.split('.')[1],'base64url')); keyTarget=p.ref==='bdjfkuddpupqaswzkrth'&&p.role==='anon'; } catch {}
console.log(JSON.stringify({productionTarget:target,anonKeyTarget:keyTarget,urlSource:process.env.VITE_SUPABASE_URL!==undefined?'process':local.VITE_SUPABASE_URL!==undefined?'.env.local':'.env',keySource:process.env.VITE_SUPABASE_ANON_KEY!==undefined?'process':local.VITE_SUPABASE_ANON_KEY!==undefined?'.env.local':'.env'}));
if(process.argv.includes('--attempt')&&target&&keyTarget){
 let calls=0,status;
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{if(String(input).includes('/token?grant_type=password')&&++calls>1)throw new Error('Retry blocked');const r=await fetch(input,init);status=r.status;return r;}}});
 const {error}=await client.auth.signInWithPassword({email:env.CLX_QA_ADMIN_EMAIL,password:env.CLX_QA_ADMIN_PASSWORD});
 const messages={invalid_credentials:'Invalid login credentials',email_not_confirmed:'Email not confirmed',user_banned:'User banned'};
 console.log(JSON.stringify({httpStatus:error?.status||status,errorCode:/^[a-z_]+$/.test(error?.code||'')?error.code:null,errorType:error?.name==='AuthApiError'?'AuthApiError':error?'Auth error':null,message:error?(messages[error.code]||'Unrecognized auth error; details suppressed'):null,authenticated:!error,attempts:calls}));
 if(!error){const r=await client.rpc('is_admin');console.log(JSON.stringify({isAdmin:!r.error&&r.data===true}));await client.auth.signOut({scope:'local'});}
}
