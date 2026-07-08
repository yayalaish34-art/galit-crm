/**
 * Galit 2026 customer import — purpose-built for "לקוחות 07.26.xls".
 *
 * Rules (agreed with the user):
 *   1. Source: single Hebrew sheet with a title-banner row 1, real headers row 2, data from row 3.
 *   2. Date filter: only customers whose "תאריך עדכון לקוח" (last-update) is AFTER 2002.
 *   3. Merge by exact name — ONLY for business customers (type != "לקוח פרטי"). Private customers
 *      with the same name stay separate (keyed by their customer code). Every row of a merged
 *      customer contributes one CustomerContact.
 *   4. One customer written per merge-group, with all its contacts. Idempotent (upsert by
 *      importLegacyId; contacts upserted by a deterministic per-contact key).
 *
 * The merged customer's importLegacyId = the smallest customer code in the group.
 * Absorbed codes are recorded in internalNotes so lead/quote links can still be traced.
 *
 * Usage (from apps/api):
 *   DATABASE_URL="<session-pooler-url>" npx tsx scripts/import-galit-customers-2026.ts --file "<xls>" [--dry-run] [--limit N]
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── args ──────────────────────────────────────────────────────────────────
type Args = { file: string; dryRun: boolean; limit: number | null; minYear: number };
function parseArgs(argv: string[]): Args {
  let file = '', dryRun = false, limit: number | null = null, minYear = 2002;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--file' && argv[i + 1]) file = argv[++i];
    else if (a === '--limit' && argv[i + 1]) limit = parseInt(argv[++i], 10) || null;
    else if (a === '--min-year' && argv[i + 1]) minYear = parseInt(argv[++i], 10) || 2002;
  }
  return { file, dryRun, limit, minYear };
}

// ── parsing helpers ─────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

function normHeader(h: string): string {
  return String(h ?? '').trim();
}
function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function normName(s: string | null): string {
  return (s || '').trim().replace(/\s+/g, ' ');
}

/** dd/mm/yyyy or Excel serial → Date (UTC). */
function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number' && !isNaN(v)) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y < 30 ? 2000 : 1900;
    return new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Read the flat sheet with the real header row (skips the title banner in row 1). */
function readRows(sheet: XLSX.WorkSheet): { header: string[]; rows: unknown[][] } {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
  let hIdx = -1;
  for (let r = 0; r < Math.min(5, aoa.length); r++) {
    const row = aoa[r] || [];
    if (row.some((c) => c != null && normHeader(String(c)) === 'קוד לקוח')) { hIdx = r; break; }
  }
  if (hIdx === -1) throw new Error('Could not find header row containing "קוד לקוח"');
  const header = (aoa[hIdx] || []).map((c) => normHeader(String(c ?? '')));
  const rows = aoa.slice(hIdx + 1).filter((r) => r && r.some((c) => c != null && c !== ''));
  return { header, rows };
}

// ── type resolution ─────────────────────────────────────────────────────────
const STANDARD_CLASSIFICATIONS = [
  { code: 'COMPANY', labelHe: 'חברה / קבלן', sortOrder: 0 },
  { code: 'PUBLIC', labelHe: 'רשות / מוסד', sortOrder: 1 },
  { code: 'PRIVATE', labelHe: 'לקוח פרטי', sortOrder: 2 },
  { code: 'SUPPLIER', labelHe: 'ספק', sortOrder: 3 },
  { code: 'POTENTIAL', labelHe: 'פוטנציאלי', sortOrder: 100 },
];
const TYPE_MAP = new Map<string, string>([
  ['לקוח עסקי', 'COMPANY'], ['עסקי', 'COMPANY'], ['חברה / קבלן', 'COMPANY'], ['COMPANY', 'COMPANY'],
  ['לקוח פרטי', 'PRIVATE'], ['פרטי', 'PRIVATE'], ['PRIVATE', 'PRIVATE'],
  ['רשות / מוסד', 'PUBLIC'], ['PUBLIC', 'PUBLIC'],
  ['פוטנציאלי', 'POTENTIAL'], ['POTENTIAL', 'POTENTIAL'],
  ['ספק', 'SUPPLIER'], ['ספקים', 'SUPPLIER'], ['SUPPLIER', 'SUPPLIER'],
]);
function resolveType(raw: string): string | null {
  return TYPE_MAP.get(raw.trim()) ?? null;
}

// ── shorthash for deterministic contact keys ────────────────────────────────
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}

// ── row model ───────────────────────────────────────────────────────────────
type ParsedRow = {
  code: string;
  name: string;
  typeCode: string;      // resolved classification code
  typeRaw: string;
  isPrivate: boolean;
  updatedAt: Date | null;
  city: string | null;
  address: string | null;
  zip: string | null;
  fax: string | null;
  companyRegNumber: string | null;
  legacyAccountNumber: string | null;
  salesRep: string | null;
  subClass: string | null;
  managementProfile: string | null;
  notes: string | null;
  internalNotes: string | null;
  // customer-level phones
  mobile: string | null;
  home: string | null;
  work: string | null;
  // contact (איש קשר)
  cName: string | null;
  cPhone: string | null;
  cMobile: string | null;
  cEmail: string | null;
  cAddr: string | null;
  cCity: string | null;
  cRole: string | null;
  cDept: string | null;
  cTitle: string | null;
  // referral
  refName: string | null;
  refDate: Date | null;
};

function buildRowReader(header: string[]) {
  const map = new Map<string, number>();
  header.forEach((h, i) => { if (h) map.set(h, i); });
  return (row: unknown[], label: string): unknown => {
    const i = map.get(label);
    return i == null ? null : row[i];
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
type Group = {
  key: string;
  legacyId: string;          // smallest code
  allCodes: string[];
  primary: ParsedRow;        // row providing customer-level fields (latest updatedAt)
  contacts: Map<string, ParsedRow>; // dedup by contact signature
  latest: Date | null;
};

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) { console.error('Missing --file'); process.exit(1); }
  const path = resolve(process.cwd(), args.file);
  if (!existsSync(path)) { console.error('File not found: ' + path); process.exit(1); }

  const wb = XLSX.read(readFileSync(path), { type: 'buffer' });
  const { header, rows } = readRows(wb.Sheets[wb.SheetNames[0]]);
  const get = buildRowReader(header);
  console.log(`[galit-import] loaded ${rows.length} data rows`);

  // 1) parse + date filter
  const parsed: ParsedRow[] = [];
  let filteredOut = 0, unknownType = 0;
  const unknownTypeSamples = new Set<string>();
  for (const row of rows) {
    const code = str(get(row, 'קוד לקוח'));
    const name = normName(str(get(row, 'שם לקוח')));
    if (!code || !name) continue;
    const typeRaw = str(get(row, 'שם סוג לקוח')) || '';
    const typeCode = resolveType(typeRaw);
    if (!typeCode) { unknownType++; if (unknownTypeSamples.size < 10) unknownTypeSamples.add(typeRaw); continue; }
    const updatedAt = parseDate(get(row, 'תאריך עדכון לקוח'));
    // date filter: keep only after minYear (rows with no date are kept — can't prove they're old)
    if (updatedAt && updatedAt.getUTCFullYear() <= args.minYear) { filteredOut++; continue; }

    const mobile = str(get(row, 'סלולארי'));
    const home = str(get(row, 'בית'));
    const work = str(get(row, 'עבודה'));
    parsed.push({
      code, name, typeCode, typeRaw, isPrivate: typeCode === 'PRIVATE',
      updatedAt,
      city: str(get(row, 'שם עיר')),
      address: str(get(row, 'כתובת')),
      zip: str(get(row, 'מיקוד')),
      fax: str(get(row, 'פקס')),
      companyRegNumber: str(get(row, 'מספר ח.פ')),
      legacyAccountNumber: str(get(row, 'מספר בהנהח')),
      salesRep: str(get(row, 'שם נציג מכירה')),
      subClass: str(get(row, 'שם סיווג')),
      managementProfile: str(get(row, 'שם תת סיווג')),
      notes: str(get(row, 'הערות כלליות')),
      internalNotes: str(get(row, 'הערות משרדיות')),
      mobile, home, work,
      cName: str(get(row, 'שם איש קשר')),
      cPhone: str(get(row, 'טלפון איש קשר')),
      cMobile: str(get(row, 'פלאפון איש קשר')),
      cEmail: str(get(row, 'EMAIL איש קשר')),
      cAddr: str(get(row, 'כתובת איש קשר')),
      cCity: str(get(row, 'שם עיר איש קשר')),
      cRole: str(get(row, 'שם תפקיד')) ?? str(get(row, 'תפקיד')),
      cDept: str(get(row, 'מחלקה')),
      cTitle: str(get(row, 'שם תואר')),
      refName: str(get(row, 'שם מקור הגעה')),
      refDate: parseDate(get(row, 'תאריך מקור הגעה')),
    });
  }
  console.log(`[galit-import] parsed ${parsed.length} | date-filtered-out ${filteredOut} | unknown-type skipped ${unknownType}`);
  if (unknownType) console.log('  unknown type samples:', [...unknownTypeSamples].join(' | '));

  // 2) group. Merge by exact name ONLY for COMPANY + SUPPLIER (real businesses).
  //    PRIVATE and POTENTIAL are kept per customer code — same-name people are different customers.
  const MERGEABLE_TYPES = new Set(['COMPANY', 'SUPPLIER']);
  const groups = new Map<string, Group>();
  const contactSig = (r: ParsedRow) =>
    [normName(r.cName) || r.name, r.cPhone || '', r.cMobile || '', (r.cEmail || '').toLowerCase(), r.cRole || ''].join('|');

  for (const r of parsed) {
    const mergeable = MERGEABLE_TYPES.has(r.typeCode);
    const key = mergeable ? `NAME:${r.typeCode}:${r.name.toLowerCase()}` : `CODE:${r.code}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, legacyId: r.code, allCodes: [], primary: r, contacts: new Map(), latest: r.updatedAt };
      groups.set(key, g);
    }
    if (!g.allCodes.includes(r.code)) g.allCodes.push(r.code);
    // primary = row with the latest updatedAt (most recent customer-level data)
    if ((r.updatedAt?.getTime() ?? 0) > (g.primary.updatedAt?.getTime() ?? 0)) g.primary = r;
    if (r.updatedAt && (!g.latest || r.updatedAt > g.latest)) g.latest = r.updatedAt;
    // smallest numeric code as the stable legacyId
    if (Number(r.code) < Number(g.legacyId) || (isNaN(Number(g.legacyId)) && r.code < g.legacyId)) g.legacyId = r.code;
    // contact from this row (if any identifying info)
    const hasContact = !!(r.cName || r.cPhone || r.cMobile || r.cEmail || r.cAddr || r.cCity || r.cRole || r.cDept);
    if (hasContact || r.name) {
      const sig = contactSig(r);
      if (!g.contacts.has(sig)) g.contacts.set(sig, r);
    }
  }

  const groupList = [...groups.values()];
  const mergedGroups = groupList.filter((g) => g.allCodes.length > 1);
  const uniqueCodes = new Set(parsed.map((r) => r.code)).size;
  const codesAbsorbed = uniqueCodes - groupList.length;
  console.log(`[galit-import] ${uniqueCodes} customer codes → ${groupList.length} final customers | ${mergedGroups.length} business name-merges | ${codesAbsorbed} codes absorbed`);

  if (args.dryRun) {
    console.log('[galit-import] DRY-RUN — no writes. Sample merges:');
    for (const g of mergedGroups.slice(0, 10)) {
      console.log(`  "${g.primary.name}" codes=[${g.allCodes.join(',')}] contacts=${g.contacts.size}`);
    }
    await prisma.$disconnect(); await pool.end();
    return;
  }

  // ensure classifications
  for (const c of STANDARD_CLASSIFICATIONS) {
    await prisma.customerClassification.upsert({
      where: { code: c.code },
      create: { id: randomUUID(), code: c.code, labelHe: c.labelHe, sortOrder: c.sortOrder, isPreset: false },
      update: {},
    });
  }

  // 3) write
  let created = 0, updated = 0, contactsUp = 0, errors = 0;
  const errSamples: string[] = [];
  const toProcess = args.limit ? groupList.slice(0, args.limit) : groupList;

  for (let gi = 0; gi < toProcess.length; gi++) {
    const g = toProcess[gi];
    const p = g.primary;
    const absorbed = g.allCodes.filter((c) => c !== g.legacyId);
    const internalNotes = [
      p.internalNotes,
      absorbed.length ? `[מיזוג לפי שם — קודים נוספים: ${absorbed.join(', ')}]` : null,
    ].filter(Boolean).join('\n') || undefined;

    const phones = [p.mobile, p.home, p.work].filter((x, i, a) => x && a.indexOf(x) === i) as string[];
    const email = p.cEmail || `import+${g.legacyId}@legacy.import.local`;

    const data: Prisma.CustomerCreateInput = {
      importLegacyId: g.legacyId,
      name: p.name,
      type: p.typeCode,
      contactName: p.cName || p.name,
      phone: phones[0] || '-',
      email,
      city: p.city || '-',
      address: p.address ?? undefined,
      phone2: phones[1] ?? undefined,
      phone3: phones[2] ?? undefined,
      fax: p.fax ?? undefined,
      companyRegNumber: p.companyRegNumber ?? undefined,
      legacyAccountNumber: p.legacyAccountNumber ?? undefined,
      salesRepresentative: p.salesRep ?? undefined,
      legacySubClassificationCode: p.subClass ?? undefined,
      managementProfile: p.managementProfile ?? undefined,
      zipLegacy: p.zip ?? undefined,
      notes: p.notes ?? undefined,
      internalNotes,
      lastUpdateDate: p.updatedAt ?? undefined,
      legacyUpdatedAt: g.latest ?? undefined,
    };

    try {
      const existing = await prisma.customer.findFirst({ where: { importLegacyId: g.legacyId }, select: { id: true } });
      let customerId: string;
      if (existing) {
        const { importLegacyId: _il, ...upd } = data as Record<string, unknown>;
        // don't clobber good data with placeholders
        if (upd.phone === '-') delete upd.phone;
        if (upd.city === '-') delete upd.city;
        if (typeof upd.email === 'string' && (upd.email as string).endsWith('@legacy.import.local')) delete upd.email;
        await prisma.customer.update({ where: { id: existing.id }, data: upd as Prisma.CustomerUpdateInput });
        customerId = existing.id;
        updated++;
      } else {
        const c = await prisma.customer.create({ data });
        customerId = c.id;
        created++;
      }

      // contacts (skip synthesizing an empty contact for private with no real contact info)
      for (const r of g.contacts.values()) {
        const fullName = normName(r.cName) || r.name;
        const hasReal = !!(r.cName || r.cPhone || r.cMobile || r.cEmail);
        if (!hasReal && p.isPrivate) continue; // private with no separate contact — the customer IS the person
        const legacy = `${g.legacyId}-c-${shortHash([fullName, r.cPhone || '', r.cMobile || '', (r.cEmail || '').toLowerCase(), r.cRole || ''].join('|'))}`;
        await prisma.customerContact.upsert({
          where: { customerId_importLegacyId: { customerId, importLegacyId: legacy } },
          create: {
            customerId, importLegacyId: legacy,
            fullName,
            phone: r.cPhone || '', mobile: r.cMobile || '', fax: '',
            email: (r.cEmail || '').toLowerCase(), address: r.cAddr || '', city: r.cCity || '', zip: '',
            roleTitle: r.cRole ?? undefined, department: r.cDept ?? undefined,
            isPrimary: false, notes: r.cTitle ?? undefined,
          },
          update: {
            fullName,
            phone: r.cPhone || '', mobile: r.cMobile || '',
            email: (r.cEmail || '').toLowerCase(), address: r.cAddr || '', city: r.cCity || '',
            roleTitle: r.cRole ?? undefined, department: r.cDept ?? undefined,
            notes: r.cTitle ?? undefined,
          },
        });
        contactsUp++;
      }
    } catch (e) {
      errors++;
      if (errSamples.length < 30) errSamples.push(`${g.legacyId} "${p.name}": ${e instanceof Error ? e.message : String(e)}`);
    }

    if ((gi + 1) % 500 === 0) {
      console.log(`[galit-import] progress ${gi + 1}/${toProcess.length} (created ${created}, updated ${updated}, contacts ${contactsUp}, errors ${errors})`);
    }
  }

  console.log('[galit-import] === DONE ===');
  console.log(`  customers created: ${created}`);
  console.log(`  customers updated: ${updated}`);
  console.log(`  contacts upserted: ${contactsUp}`);
  console.log(`  errors: ${errors}`);
  for (const e of errSamples) console.log('   - ' + e);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
