/** אילו עמודים עדיין מכילים מילון מונחים — ב-post_content או ב-_elementor_data. */
const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
const CATEGORY=new Set([3723,3725,3727,3729,3731,3733,3735,3737,3739,3741]);
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const auth='Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64');
  let page=1,cat=[],svc=[];
  for(;;){
    const res=await fetch(`${site}/wp-json/wp/v2/pages?context=edit&per_page=100&page=${page}&status=publish,draft,private`,{headers:{Authorization:auth}});
    if(!res.ok)break;const batch=await res.json();if(!batch.length)break;
    for(const p of batch){
      const raw=(p.content&&p.content.raw)||'';const el=(p.meta&&p.meta._elementor_data)||'';
      const where=[raw.includes('galit-gloss')&&'content',el.includes('galit-gloss')&&'elementor'].filter(Boolean);
      if(!where.length)continue;
      (CATEGORY.has(p.id)?cat:svc).push({id:p.id,title:String(p.title.raw||'').trim(),where:where.join('+'),link:decodeURIComponent(p.link)});
    }
    if(batch.length<100)break;page++;
  }
  console.log(`CATEGORY pages with glossary (expected 10): ${cat.length}`);
  for(const x of cat) console.log(`   ${x.id}  ${x.where.padEnd(9)} ${x.title}`);
  console.log(`\nSERVICE pages still with glossary (expected 0): ${svc.length}`);
  for(const x of svc) console.log(`   ${x.id}  ${x.where.padEnd(9)} ${x.title}\n        ${x.link}`);
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
