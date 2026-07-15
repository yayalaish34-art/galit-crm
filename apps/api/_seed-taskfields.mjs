import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TEST_MARKER = '🧪בדיקת-שדה'; // used to identify & later delete these test rows

// ── field workers: real technicians (@galit.co.il), exclude demo @galit.local ──
const workers = await prisma.user.findMany({
  where: { role: 'TECHNICIAN', email: { endsWith: '@galit.co.il' } },
  select: { id: true, name: true, email: true },
  orderBy: { createdAt: 'asc' },
});
console.log(`Field workers: ${workers.length} → ${workers.map(w => w.name).join(', ')}`);

// ── inspection types available for field work (raw: not in schema.prisma) ──
const types = await prisma.$queryRawUnsafe(`
  SELECT id, "labelHe", family FROM "InspectionType"
  WHERE "isActive" = true AND "isFieldInspection" = true
  ORDER BY code ASC;
`);
console.log(`Field inspection types available: ${types.length}`);

// ── coming work-week days (Sun–Thu), based on fixed 2026-07-01 (machine-clock independent) ──
const base = new Date('2026-07-01T00:00:00+03:00');
const days = [];
for (let d = 1; days.length < 5 && d <= 12; d++) {
  const dt = new Date(base.getTime() + d * 86400000);
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  if (dow >= 0 && dow <= 4) days.push(dt); // Sun–Thu
}
console.log(`Days: ${days.map(d => d.toISOString().slice(0, 10)).join(', ')}\n`);

// ── varied sample field data ──
const sites = [
  { address: 'רחוב הרצל 12', city: 'תל אביב' },
  { address: 'שדרות רוטשילד 45', city: 'תל אביב' },
  { address: 'רחוב ויצמן 8', city: 'רמת גן' },
  { address: 'רחוב הנביאים 22', city: 'ירושלים' },
  { address: 'רחוב יפו 100', city: 'חיפה' },
  { address: 'רחוב סוקולוב 30', city: 'הרצליה' },
  { address: 'רחוב ביאליק 5', city: 'רמת גן' },
];
const contacts = [
  { name: 'משה כהן', phone: '050-1234567' },
  { name: 'רונית לוי', phone: '052-7654321' },
  { name: 'דוד ישראלי', phone: '054-9998877' },
  { name: 'שירה אבני', phone: '053-4445566' },
  { name: 'יוסי מזרחי', phone: '058-2223344' },
];
const startHours = [9, 10, 12, 14, 16];
const durations = [60, 90, 120];
const statuses = ['ASSIGNED', 'CONFIRMED', 'ASSIGNED'];

let created = 0;
let n = 0;
for (const worker of workers) {
  for (let di = 0; di < days.length; di++) {
    const day = days[di];
    const type = types[n % types.length];
    const site = sites[n % sites.length];
    const contact = contacts[n % contacts.length];
    const hour = startHours[di % startHours.length];
    const duration = durations[n % durations.length];

    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 3, 0, 0)); // Asia/Jerusalem = UTC+3
    const end = new Date(start.getTime() + duration * 60000);
    const dateStr = day.toISOString().slice(0, 10);
    const title = `${TEST_MARKER} — ${type.labelHe} — ${worker.name} — ${dateStr}`;

    await prisma.task.create({
      data: {
        title,
        description: `משימת שדה לבדיקה (${TEST_MARKER}). ${type.labelHe}.`,
        type: 'FIELD_WORK',
        status: 'OPEN',
        priority: 'MEDIUM',
        currentStage: 5,
        productName: null,
        dueDate: start,
        owner: { connect: { id: worker.id } },
        taskField: {
          create: {
            inspectionTypeId: type.id,
            family: type.family,
            appointmentTitle: `${type.labelHe} — ${site.city}`,
            scheduledStartAt: start,
            scheduledEndAt: end,
            durationMinutes: duration,
            siteAddress: site.address,
            siteCity: site.city,
            fieldContactName: contact.name,
            fieldContactPhone: contact.phone,
            navigationUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address + ', ' + site.city)}`,
            specialInstructions: `להצטייד בציוד ${type.family}. חניה בחזית הבניין.`,
            fieldStatus: statuses[n % statuses.length],
          },
        },
      },
    });
    created++;
    n++;
    console.log(`✓ ${worker.name} | ${dateStr} ${String(hour).padStart(2, '0')}:00 | ${type.labelHe}`);
  }
}

const total = await prisma.taskField.count();
console.log(`\nCreated ${created} tasks + TaskField rows.`);
console.log(`TOTAL TaskField rows in DB now: ${total}`);

await prisma.$disconnect();
