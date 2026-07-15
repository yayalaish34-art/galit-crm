import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';

const QUOTE_ID = 'f1c526be-7c8a-43e3-bf08-7f54a88ff617';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const docs = await prisma.quoteDocument.findMany({
  where: { quoteId: QUOTE_ID },
  orderBy: { createdAt: 'desc' },
});
console.log(`QuoteDocuments: ${docs.length}`);
for (const d of docs) {
  const bytes = d.data ? Buffer.from(d.data).length : null;
  console.log(`  type=${d.documentType} name="${d.fileName}" DATA_BYTES=${bytes === null ? 'NULL' : bytes} filePath=${d.filePath || '-'} createdAt=${d.createdAt.toISOString()}`);
}

// Also check the disk file (lastMergedDocPath) — does it exist and have bytes?
const q = await prisma.quote.findUnique({ where: { id: QUOTE_ID }, select: { lastMergedDocPath: true } });
console.log(`\nlastMergedDocPath: ${q?.lastMergedDocPath}`);
if (q?.lastMergedDocPath) {
  try {
    const st = fs.statSync(q.lastMergedDocPath);
    console.log(`  disk file exists, bytes=${st.size}`);
  } catch {
    console.log('  ⚠️ disk file NOT found (Railway ephemeral disk — lost on redeploy)');
  }
}

console.log('\n=== conclusion ===');
const withData = docs.filter((d) => d.data && Buffer.from(d.data).length > 0);
if (withData.length === 0) {
  console.log('❌ NO QuoteDocument has real bytes in DB. The merged file was never persisted with content,');
  console.log('   OR the merge saved to disk only (lastMergedDocPath) which is GONE after Railway redeploy.');
  console.log('   → resolveQuoteDoc returns empty/zero-byte content → PDF convert fails → 400.');
} else {
  console.log(`✔ ${withData.length} document(s) have real bytes — newest usable one exists.`);
}

await prisma.$disconnect();
await pool.end();
