const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
const has=(el)=>{let f=false;(function w(a){for(const e of a||[]){if(e.widgetType==='html'&&/galit-gloss/.test((e.settings&&e.settings.html)||''))f=true;if(Array.isArray(e.elements))w(e.elements);}})([el]);return f;};
const widgets=(el)=>{const o=[];(function w(a){for(const e of a||[]){if(e.widgetType)o.push(e.widgetType);if(Array.isArray(e.elements))w(e.elements);}})([el]);return o;};
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const auth='Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64');
  for(const id of [6492,3965]){
    const p=await (await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`,{headers:{Authorization:auth}})).json();
    const tree=JSON.parse(p.meta._elementor_data);
    console.log(`\n[${id}] ${String(p.title.raw||'').trim()} — ${tree.length} top-level sections`);
    tree.forEach((s,i)=>{
      const w=widgets(s);
      console.log(`   [${i}] ${has(s)?'GLOSSARY':'        '} widgets: ${w.join(', ')||'(none)'}`);
    });
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
