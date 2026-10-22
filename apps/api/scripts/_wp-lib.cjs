const crypto=require('crypto');const {Client}=require('pg');
function dec(e){const[i,x]=String(e).split(':');const k=crypto.createHash('sha256').update(process.env.JWT_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-cbc',k,Buffer.from(i,'hex'));return Buffer.concat([d.update(Buffer.from(x,'hex')),d.final()]).toString('utf8');}
async function wp(){
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();const r=await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);await c.end();
  const v=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;
  return {site:String(v.siteUrl).replace(/\/$/,''),auth:'Basic '+Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64')};
}
function unesc(s){return s.split('\n').join('\n').split('\\"').join('"').split('\/').join('/');}
module.exports={wp,unesc};
