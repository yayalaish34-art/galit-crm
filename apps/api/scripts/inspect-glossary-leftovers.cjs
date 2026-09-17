const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const auth='Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64');
  for(const id of [6544,6540,6492,4857,3965,4497]){
    const p=await (await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`,{headers:{Authorization:auth}})).json();
    const raw=(p.content&&p.content.raw)||''; const el=(p.meta&&p.meta._elementor_data)||'';
    const cBlocks=(raw.match(/<section class="galit-gloss"/g)||[]).length;
    const eHits=(el.match(/galit-gloss/g)||[]).length;
    const textLen=raw.replace(/<section class="galit-gloss"[\s\S]*/,'').replace(/<[^>]+>/g,'').trim().length;
    console.log(`[${id}] ${String(p.title.raw||'').trim()}`);
    console.log(`     content: ${raw.length} chars, glossary <section> blocks = ${cBlocks}, text before first block = ${textLen}`);
    console.log(`     elementor: ${el.length} chars, 'galit-gloss' occurrences = ${eHits}, modified=${p.modified}`);
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
