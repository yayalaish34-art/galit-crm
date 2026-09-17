/** בדיקה קצרה: האם עדיין יש גישת כתיבה לוורדפרס (קריאה בלבד — לא משנה כלום). */
const crypto = require('crypto');
const { Client } = require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);
  await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  const site=String(v.siteUrl).replace(/\/$/,'');
  const auth='Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64');
  const me=await fetch(`${site}/wp-json/wp/v2/users/me?context=edit`,{headers:{Authorization:auth}});
  const u=await me.json();
  console.log('site   :',site);
  console.log('status :',me.status);
  console.log('user   :',u.name,'| roles:',JSON.stringify(u.roles));
  const pages=await fetch(`${site}/wp-json/wp/v2/pages?per_page=1&context=edit`,{headers:{Authorization:auth}});
  console.log('pages readable/writable:', pages.status===200 ? 'yes' : 'no ('+pages.status+')');
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
