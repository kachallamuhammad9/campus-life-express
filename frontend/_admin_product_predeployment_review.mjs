// Review-only runner. Reuses the existing suite against a disposable native
// PostgreSQL cluster; no environment credentials or remote database URLs accepted.
import { readFileSync } from 'node:fs';
const original = new URL('./_admin_product_management_tests.mjs', import.meta.url);
let source = readFileSync(original, 'utf8');
source = source.replace("import { PGlite } from './.vercel/phase4e2-sql-tools/node_modules/@electric-sql/pglite/dist/index.js';", `
import pg from ${JSON.stringify(new URL('./node_modules/pg/lib/index.js',import.meta.url).href)};
const config={host:'127.0.0.1',port:55439,user:'clx_review',database:'postgres'};
class PGlite {
  constructor(){this.client=new pg.Client(config);this.ready=this.client.connect();}
  async exec(sql){await this.ready;return this.client.query(sql);}
  async query(sql,args){await this.ready;return this.client.query(sql,args);}
  async close(){await this.client.end();}
}
let reviewFailures=0, reviewPassed=0;
async function review(name,fn){try{await fn();reviewPassed++;console.log('REVIEW PASS: '+name);}catch(e){reviewFailures++;console.log('REVIEW FAIL: '+name+' — '+e.message);}}
`);
source=source.replaceAll('import.meta.url',JSON.stringify(original.href));
source=source.replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(new URL(path,original).href));
source=source.replace(/import\('(\.\.?\/[^']+)'\)/g,(_,path)=>'import('+JSON.stringify(new URL(path,original).href)+')');
const additional=String.raw`
    await review('valid active subcategory accepted on create',async()=>{
        assert.equal((await create({subcategory_id:sub})).subcategory_id,sub);
    });
    const target=await create({description:'Keep',image_url:'https://example.invalid/a',original_price_kobo:200000,stock_quantity:8});
    await review('nullable omitted keys preserve existing values',async()=>{
        const p=await update(target.id,{name:'Review metadata'});
        for(const k of ['description','image_url','original_price_kobo','stock_quantity'])assert.equal(p[k],target[k]);
    });
    await review('price A: lower selling price keeps original',async()=>{
        const p=await update(target.id,{price_kobo:100000});assert.equal(p.price_kobo,100000);assert.equal(p.original_price_kobo,200000);
    });
    await review('price B: selling price above retained original denied',()=>assert.rejects(update(target.id,{price_kobo:200001})));
    await review('price C: clear original while raising price',async()=>{
        const p=await update(target.id,{price_kobo:200001,original_price_kobo:null});assert.equal(p.original_price_kobo,null);assert.equal(p.price_kobo,200001);
    });
    await review('price D: set both prices validates final row',async()=>{
        assert.equal((await update(target.id,{price_kobo:300000,original_price_kobo:400000})).original_price_kobo,400000);
        await assert.rejects(update(target.id,{price_kobo:500000,original_price_kobo:400000}));
    });
    await review('stock one-key patches validate final row',async()=>{
        assert.equal((await update(target.id,{stock_quantity:0})).is_in_stock,false);
        assert.equal((await update(target.id,{is_in_stock:true})).is_in_stock,false);
        assert.equal((await update(target.id,{stock_quantity:9})).is_in_stock,false);
        assert.equal((await update(target.id,{stock_quantity:null})).stock_quantity,null);
        assert.equal((await update(target.id,{is_in_stock:true})).is_in_stock,true);
    });
    await review('metadata update cannot retain a zero selling price',async()=>{
        const p=await create();await db.query('update products set price_kobo=0 where id=$1',[p.id]);
        await assert.rejects(update(p.id,{description:'metadata'}));
    });
    for(const value of ['https://:80/a','https://user@/a'])await review('hostname-less URL rejected: '+value,()=>assert.rejects(create({image_url:value})));
    await review('Naira/kobo complete review matrix',async()=>{
        for(const [input,expected] of [['1',100],['1.5',150],['1.50',150],['1250',125000],['1250.50',125050],['0.01',1]])assert.equal(ui.nairaToKobo(input),expected);
        for(const input of ['0','-1','1.001','NaN','Infinity','1,000','1e3'])assert.equal(ui.nairaToKobo(input),null);
    });
    await review('public RLS hides out-of-stock and inactive-vendor products',async()=>{
        const visible=await create(),hidden=await create({is_in_stock:false});
        await uid('');await db.exec('set role anon');
        try{const ids=(await db.query('select id from products')).rows.map(x=>x.id);assert(ids.includes(visible.id));assert(!ids.includes(hidden.id));}
        finally{await db.exec('reset role');await uid(admin);}
        await db.exec("update vendors set status='SUSPENDED'");
        await uid('');await db.exec('set role anon');
        try{assert.equal((await db.query('select id from products')).rows.length,0);}
        finally{await db.exec('reset role');await uid(admin);await db.exec("update vendors set status='ACTIVE'");}
    });
    const a=new pg.Client(config),b=new pg.Client(config);
    await a.connect();await b.connect();
    try{
        for(const c of [a,b]){await c.query("select set_config('test.uid',$1,false)",[admin]);await c.query('set role authenticated');}
        const pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
        async function contend(first,second){
            await a.query('begin');let pending;
            try{
                const resultA=await first(a);
                pending=second(b).then(result=>({ok:true,result}),error=>({ok:false,message:error.message}));
                let blocked=false;
                for(let i=0;i<100;i++){
                    const state=(await db.query('select wait_event_type,wait_event from pg_stat_activity where pid=$1',[pid])).rows[0];
                    if(state?.wait_event_type==='Lock'){blocked=true;break;}
                    await new Promise(r=>setTimeout(r,20));
                }
                assert(blocked,'second independent connection must overlap and wait on lock');
                await a.query('commit');return [resultA,await pending];
            }catch(e){await a.query('rollback');if(pending)await pending;throw e;}
        }
        const send=(c,name)=>c.query('select admin_create_product($1,$2,$3,$4,$5) as p',[vendor,campus,cat,name,100]);
        await review('CONCURRENCY A: same normalized product exactly one succeeds',async()=>{
            const [,second]=await contend(c=>send(c,'Concurrent Same'),c=>send(c,' concurrent   SAME '));
            assert.equal(second.ok,false);assert.match(second.message,/already exists/);
            assert.equal((await db.query("select count(*)::int as n from products where lower(name)='concurrent same'")).rows[0].n,1);
        });
        await review('CONCURRENCY B: slug collisions get distinct safe slugs',async()=>{
            const [first,second]=await contend(c=>send(c,'Concurrent Slug!'),c=>send(c,'Concurrent Slug?'));
            assert(second.ok);assert.equal(first.rows[0].p.slug,'concurrent-slug');assert.equal(second.result.rows[0].p.slug,'concurrent-slug-2');
            assert.notEqual(first.rows[0].p.id,second.result.rows[0].p.id);
        });
        await review('CONCURRENCY C: conflicting rename exactly one succeeds',async()=>{
            const p=await create(),q=await create();
            const rename=(c,id)=>c.query('select admin_update_product($1,$2::jsonb)',[id,JSON.stringify({name:'Concurrent Rename'})]);
            const [,second]=await contend(c=>rename(c,p.id),c=>rename(c,q.id));
            assert.equal(second.ok,false);assert.match(second.message,/already exists/);assert.equal((await row(q.id)).name,q.name);
            assert.equal((await db.query("select count(*)::int as n from products where name='Concurrent Rename'")).rows[0].n,1);
        });
    }finally{await a.end();await b.end();}
`;
source=source.replace('} finally { await db.close(); }',additional+'\n} finally { await db.close(); }');
source+=`\nconsole.log('PREDEPLOYMENT EXTRA: '+reviewPassed+' passed, '+reviewFailures+' failed');if(reviewFailures)process.exitCode=1;`;
try { await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')); }
catch(error){console.error('Review runner error: '+error.message);process.exitCode=1;}
