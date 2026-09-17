const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const H={Authorization:'Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64')};
  for(const id of [5064,5050,5069,4402]){
    for(const t of ['elementor_library','pages','posts']){
      const res=await fetch(`${site}/wp-json/wp/v2/${t}/${id}?context=edit`,{headers:H});
      if(!res.ok) continue;
      const p=await res.json();
      console.log(`[${id}] type=${t} title="${String(p.title&&(p.title.raw||p.title.rendered)||'').trim()}" template_type=${p.meta&&p.meta._elementor_template_type||'-'} status=${p.status}`);
      break;
    }
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
