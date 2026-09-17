const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const H={Authorization:'Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64')};
  for(const id of [16048,16131,16170,16177,16185,16187,16190]){
    const p=await (await fetch(`${site}/wp-json/wp/v2/posts/${id}?context=edit`,{headers:H})).json();
    const words=String(p.content&&p.content.raw||'').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length;
    console.log(`${id}  status=${String(p.status).padEnd(8)} cats=${JSON.stringify(p.categories)}  words=${String(words).padStart(4)}  ${String(p.title.raw||'').trim().slice(0,46)}`);
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
