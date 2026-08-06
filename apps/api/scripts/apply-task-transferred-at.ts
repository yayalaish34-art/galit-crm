/**
 * מוסיף את העמודה Task.transferredAt ישירות (prisma migrate/db execute נתקעים מול ה-pooler).
 * אידמפוטנטי — ADD COLUMN IF NOT EXISTS. מדפיס אימות מ-information_schema בסיום.
 *
 * הרצה:  railway run npx tsx scripts/apply-task-transferred-at.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pool.query('ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "transferredAt" TIMESTAMP(3)');
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'Task' AND column_name = 'transferredAt'`,
  );
  console.log(rows.length ? `OK — ${JSON.stringify(rows[0])}` : 'FAILED — העמודה לא קיימת');
}

main()
  .catch((e) => {
    console.error('נכשל:', e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
