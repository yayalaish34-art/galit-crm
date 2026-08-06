/**
 * רושם מיגרציה שהוחלה ידנית ב-_prisma_migrations (עם ה-checksum הנכון), כדי ש-
 * `prisma migrate deploy` בעתיד לא ינסה להריץ אותה שוב ולא יתלונן על drift.
 * אידמפוטנטי — לא מוסיף אם השם כבר קיים.
 *
 * הרצה:  railway run npx tsx scripts/record-migration.ts <migration_folder_name>
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const name = process.argv[2];
if (!name) {
  console.error('שימוש: npx tsx scripts/record-migration.ts <migration_folder_name>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const sql = readFileSync(join('prisma', 'migrations', name, 'migration.sql'));
  const checksum = createHash('sha256').update(sql).digest('hex');
  const res = await pool.query(
    `INSERT INTO _prisma_migrations
       (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     SELECT $1::text, $2::text, now(), $3::text, NULL, NULL, now(), 1
      WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = $3::text)`,
    [randomUUID(), checksum, name],
  );
  console.log(res.rowCount ? `נרשמה: ${name} (${checksum.slice(0, 12)}…)` : `כבר רשומה: ${name}`);
}

main()
  .catch((e) => {
    console.error('נכשל:', e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
