/** לאילו קטגוריות משויך כל פוסט, ואיך סקשן הבלוג של כל עמוד קטגוריה מסנן. */
const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const auth='Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64');
  const H={Authorization:auth};

  const cats={};
  for(let p=1;;p++){
    const b=await (await fetch(`${site}/wp-json/wp/v2/categories?per_page=100&page=${p}`,{headers:H})).json();
    if(!Array.isArray(b)||!b.length)break; for(const x of b) cats[x.id]={name:x.name,count:x.count}; if(b.length<100)break;
  }
  const posts=await (await fetch(`${site}/wp-json/wp/v2/posts?per_page=15&context=edit&status=publish,draft`,{headers:H})).json();
  console.log('LATEST POSTS AND THEIR CATEGORIES');
  for(const p of posts){
    const names=(p.categories||[]).map(id=>`${id}:${cats[id]?cats[id].name:'?'}`);
    console.log(`  [${p.id}] ${String(p.title.raw||p.title.rendered).trim().slice(0,58)}`);
    console.log(`        ${names.join('  |  ')}`);
  }
  console.log('\nBLOG-TOPIC CATEGORIES (הכל על X):');
  for(const [id,x] of Object.entries(cats)) if(/הכל על/.test(x.name)) console.log(`  ${id.padStart(4)}  ${x.name.padEnd(28)} posts=${x.count}`);
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
