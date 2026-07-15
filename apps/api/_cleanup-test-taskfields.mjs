import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TEST_MARKER = '🧪בדיקת-שדה';

// TaskField cascade-deletes with the Task (onDelete: Cascade), so deleting the tasks is enough.
const del = await prisma.task.deleteMany({ where: { title: { startsWith: TEST_MARKER } } });
console.log(`Deleted ${del.count} test tasks (their TaskField rows cascade-deleted).`);

const remaining = await prisma.taskField.count();
console.log(`TaskField rows remaining: ${remaining}`);

await prisma.$disconnect();
