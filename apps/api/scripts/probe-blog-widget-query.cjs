/** מחלץ את הגדרות ה-query של ווידג'ט הפוסטים בסקשן הבלוג של כל עמוד קטגוריה. */
const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
const PAGES={3723:'בנייה ירוקה',3725:'ריח',3727:'קרינה',3729:'הדברה',3731:'ראדון',3733:'רעש',3735:'קרקע',3737:'מים',3739:'אויר',3741:'אסבסט'};
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const H={Authorization:'Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64')};
  for(const [id,label] of Object.entries(PAGES)){
    const p=await (await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`,{headers:H})).json();
    const tree=JSON.parse(p.meta._elementor_data);
    const found=[];
    (function walk(a){for(const e of a||[]){
      if(e.widgetType&&/posts|loop/i.test(e.widgetType)){
        const s=e.settings||{};
        const q={};
        for(const k of Object.keys(s)) if(/term|categor|query|include|exclude|post_type/i.test(k)) q[k]=s[k];
        found.push({w:e.widgetType,q});
      }
      if(Array.isArray(e.elements))walk(e.elements);
    }})(tree);
    console.log(`\n=== ${id} ${label} ===`);
    if(!found.length){console.log('  (no posts widget)');continue;}
    for(const f of found) console.log(`  ${f.w}: ${JSON.stringify(f.q)}`);
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
