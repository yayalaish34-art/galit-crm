/** קריאה בלבד: האם יש כפילויות taskId ב-TaskField (חוסמות יצירת אינדקס ייחודי). */
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const total = await c.query(`SELECT COUNT(*)::int AS n FROM "TaskField"`);
    const dups = await c.query(
      `SELECT "taskId", COUNT(*)::int AS n FROM "TaskField"
        GROUP BY "taskId" HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 20`,
    );
    const dupTotal = await c.query(
      `SELECT COALESCE(SUM(n - 1), 0)::int AS extra FROM (
         SELECT COUNT(*)::int AS n FROM "TaskField" GROUP BY "taskId" HAVING COUNT(*) > 1
       ) s`,
    );
    console.log(`TaskField rows              : ${total.rows[0].n}`);
    console.log(`taskIds with duplicates     : ${dups.rowCount}`);
    console.log(`redundant rows to remove    : ${dupTotal.rows[0].extra}`);
    for (const r of dups.rows) console.log(`   ${r.taskId} × ${r.n}`);
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
