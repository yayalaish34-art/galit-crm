import pg from 'pg'; import fs from 'fs';
const url = fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL')).split('=')[1].replace(/^"|"$/g,'').trim();
const c = new pg.Client({connectionString:url, ssl:{rejectUnauthorized:false}}); await c.connect();
const CUST='123b2217-1473-4632-bd54-270e08dde494';

const cust = await c.query(`SELECT id,name,type,"contactName",phone,email,city FROM "Customer" WHERE id=$1`,[CUST]);
console.log('=== customer'); console.table(cust.rows);

const t = await c.query(`
 SELECT t.id,t.title,t.status,t.type,t."currentStage",t."currentStageChangedAt",t."dueDate",u.name AS owner,t."createdAt",t."updatedAt",t."leadId",t."incomingLeadId",t."projectId",t."processNotes"
 FROM "Task" t LEFT JOIN "User" u ON u.id=t."ownerId" WHERE t."customerId"=$1 ORDER BY t."createdAt"`,[CUST]);
console.log('=== ALL tasks for this customer:', t.rows.length);
for (const r of t.rows) console.log(JSON.stringify(r,null,1));

// full task list of Yoram
const yt = await c.query(`SELECT id,title,status,type,"currentStage","dueDate","updatedAt" FROM "Task" WHERE "ownerId"='c7f229a5-f182-4f85-8be7-2465fb3ca389' ORDER BY "updatedAt" DESC`);
console.log('=== yoram all tasks'); console.table(yt.rows);
await c.end();
