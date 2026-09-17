const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
const TOPICS={85:'קרינה',97:'ריח',98:'הדברה',99:'ראדון',100:'רעש',101:'קרקע',102:'מים',103:'אוויר',104:'אסבסט',105:'שפכים',170:'בנייה ירוקה'};
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const H={Authorization:'Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64')};
  for(const [id,label] of Object.entries(TOPICS)){
    const posts=await (await fetch(`${site}/wp-json/wp/v2/posts?categories=${id}&per_page=30&context=edit&status=publish,draft,private`,{headers:H})).json();
    if(!Array.isArray(posts)){console.log(`${id} ${label}: ERROR`);continue;}
    console.log(`\n[${id}] הכל על ${label} — ${posts.length} posts`);
    for(const p of posts) console.log(`     ${p.id}  ${String(p.title.raw||p.title.rendered||'').trim().slice(0,66)}`);
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
