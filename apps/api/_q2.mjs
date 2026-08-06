import pg from 'pg'; import fs from 'fs';
const url = fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL')).split('=')[1].replace(/^"|"$/g,'').trim();
const c = new pg.Client({connectionString:url, ssl:{rejectUnauthorized:false}}); await c.connect();
const YORAM='c7f229a5-f182-4f85-8be7-2465fb3ca389';

const cu = await c.query(`SELECT id,name,type,"contactName",city FROM "Customer" WHERE name ILIKE '%עיריי%' OR name ILIKE '%עירי%' ORDER BY name LIMIT 60`);
console.log('=== municipality customers:', cu.rows.length); console.table(cu.rows);

const t = await c.query(`
 SELECT t.id,t.title,t.status,t.type,t."dueDate",t."ownerId",u.name AS owner,t."customerId",t."createdAt",t."updatedAt",t."currentStage"
 FROM "Task" t LEFT JOIN "User" u ON u.id=t."ownerId"
 WHERE t.title ILIKE '%רעננה%' OR t.description ILIKE '%רעננה%' OR t.title ILIKE '%עיריי%' OR t.title ILIKE '%עירי%'
 ORDER BY t."createdAt" DESC LIMIT 60`);
console.log('=== tasks mentioning raanana/municipality:', t.rows.length); console.table(t.rows);

const yt = await c.query(`SELECT status, count(*)::int n FROM "Task" WHERE "ownerId"=$1 GROUP BY status`,[YORAM]);
console.log('=== yoram task counts by status'); console.table(yt.rows);
await c.end();
