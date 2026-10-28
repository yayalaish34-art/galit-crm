import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GraphFilesService } from '../microsoft/graph-files.service';

/** SystemSetting key — מטא-דאטה של גיבוי טבלת הלקוחות האחרון (JSON). */
const CUSTOMER_BACKUP_KEY = 'backup.customer.latest';
/** SystemSetting key — מזהה המשתמש שה-OneDrive שלו משמש לגיבוי (אופציונלי; ברירת מחדל: אדמין פעיל). */
const BACKUP_OWNER_KEY = 'backup.ownerUserId';

export type CustomerBackupMeta = {
  createdAt: string;
  fileName: string;
  rowCount: number;
  byteSize: number;
  oneDriveWebUrl: string;
  oneDriveItemId: string;
  ownerUserId: string;
  /** תאריך ISO של "הורדתי לדיסקאון קי"; `null` = עדיין לא אישר. */
  acknowledgedAt: string | null;
  /** משתמש שאישר. */
  acknowledgedByUserId: string | null;
  /** כשל אחרון (אם הגיבוי האחרון נכשל). */
  error?: string | null;
};

/**
 * דשבורד בקרה/גיבוי למנהל — snapshot מלא של נתוני ה-CRM + בדיקת "סימני חיים" למסד.
 * נועד לתת בקרה: לראות שכל הנתונים קיימים, ולזהות מיד אם המסד נפל / התרוקן.
 *
 * גיבוי חודשי אוטומטי (CustomerBackupScheduler ב-1 לחודש):
 * runCustomerBackup() → exportCustomerTableAsSql() → uploadRaw ל-OneDrive →
 * שומר מטא ב-SystemSetting(CUSTOMER_BACKUP_KEY). הדשבורד מציג פופ-אפ
 * "להוריד לדיסקאון קי" עד שהמשתמשת מאשרת acknowledgeCustomerBackup().
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphFiles: GraphFilesService,
  ) {}

  /** ספירת כל הטבלאות + בדיקת חיבור למסד. מהיר — לרענון תכוף. */
  async health() {
    const startedAt = Date.now();
    try {
      // בדיקת חיבור בסיסית
      await this.prisma.$queryRawUnsafe('SELECT 1');

      const [
        customers, leads, quotes, tasks, reports, projects,
        opportunities, documents, users, incomingLeads,
      ] = await Promise.all([
        this.prisma.customer.count(),
        this.prisma.lead.count(),
        this.prisma.quote.count(),
        this.prisma.task.count(),
        this.prisma.report.count(),
        this.prisma.project.count(),
        this.prisma.opportunity.count(),
        this.prisma.document.count(),
        this.prisma.user.count(),
        this.prisma.incomingLead.count(),
      ]);

      const counts = { customers, leads, quotes, tasks, reports, projects, opportunities, documents, users, incomingLeads };
      const totalRecords = customers + leads + quotes + tasks + reports + projects + opportunities + documents + incomingLeads;

      return {
        dbConnected: true,
        // המסד "בריא" אם הוא מחובר ויש בו לפחות עובדים (טבלת הליבה שתמיד אמורה להיות מאוכלסת)
        dbHealthy: users > 0,
        latencyMs: Date.now() - startedAt,
        counts,
        totalRecords,
        checkedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return {
        dbConnected: false,
        dbHealthy: false,
        latencyMs: Date.now() - startedAt,
        error: e?.message || String(e),
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /** snapshot מלא — כל הרשומות של 5 טבלאות הליבה, לתצוגה בטבלאות. */
  async snapshot() {
    const [customers, leads, quotes, tasks, reports] = await Promise.all([
      this.prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, type: true, contactName: true, phone: true, email: true, city: true, status: true, leadSource: true, createdAt: true },
      }),
      this.prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, firstName: true, lastName: true, phone: true, email: true, company: true, city: true, serviceType: true, service: true, source: true, leadStatus: true, createdAt: true, assignedUser: { select: { name: true } } },
      }),
      this.prisma.quote.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, quoteNumber: true, customerName: true, service: true, amount: true, totalAmount: true, status: true, validTo: true, sentAt: true, createdAt: true, customer: { select: { name: true } } },
      }),
      this.prisma.task.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, type: true, status: true, priority: true, dueDate: true, createdAt: true, owner: { select: { name: true } }, customer: { select: { name: true } } },
      }),
      this.prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, reportType: true, status: true, reportDate: true, sentAt: true, createdAt: true, customer: { select: { name: true } }, createdBy: { select: { name: true } } },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      customers: customers.map((c) => ({
        שם: c.name, סיווג: c.type, אישקשר: c.contactName, טלפון: c.phone,
        אימייל: c.email, עיר: c.city, סטטוס: c.status, מקור: c.leadSource ?? '', נוצר: c.createdAt,
      })),
      leads: leads.map((l) => ({
        שם: l.fullName || `${l.firstName} ${l.lastName ?? ''}`.trim(), טלפון: l.phone ?? '',
        אימייל: l.email ?? '', חברה: l.company ?? '', עיר: l.city ?? '',
        שירות: l.serviceType ?? l.service ?? '', מקור: l.source ?? '', סטטוס: l.leadStatus,
        מטפל: l.assignedUser?.name ?? '', נוצר: l.createdAt,
      })),
      quotes: quotes.map((q) => ({
        מספר: q.quoteNumber ?? '', לקוח: q.customer?.name ?? q.customerName ?? '', שירות: q.service,
        סכום: q.totalAmount ?? q.amount ?? 0, סטטוס: q.status, תוקף: q.validTo, נשלח: q.sentAt ?? '', נוצר: q.createdAt,
      })),
      tasks: tasks.map((t) => ({
        כותרת: t.title, לקוח: t.customer?.name ?? '', שלב: t.type, סטטוס: t.status,
        עדיפות: t.priority, מטפל: t.owner?.name ?? '', יעד: t.dueDate ?? '', נוצר: t.createdAt,
      })),
      reports: reports.map((r) => ({
        כותרת: r.title, לקוח: r.customer?.name ?? '', סוג: r.reportType, סטטוס: r.status,
        נוצרעי: r.createdBy?.name ?? '', תאריך: r.reportDate ?? '', נשלח: r.sentAt ?? '', נוצר: r.createdAt,
      })),
    };
  }

  // ─── גיבוי חודשי של טבלת Customer ל-OneDrive ───────────────────────────────

  /**
   * מייצר דאמפ SQL מלא של טבלת Customer כסטרינג. שולף עמודות מ-information_schema
   * כדי לכסות כל שינוי סכמה עתידי בלי לעדכן את הקוד. כל שורה הופכת ל-INSERT
   * אחד — בטוח לרסטור חלקי (אפשר להריץ שורה אחת), ועם header + BEGIN/COMMIT
   * לרסטור מלא.
   */
  async exportCustomerTableAsSql(): Promise<{ sql: string; rowCount: number }> {
    const colsResult: Array<{ column_name: string }> = await this.prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Customer' AND table_schema = 'public'
       ORDER BY ordinal_position`,
    );
    const columns = colsResult.map((c) => c.column_name);
    if (columns.length === 0) {
      throw new BadRequestException('טבלת Customer לא נמצאה במסד — אין מה לגבות');
    }
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT ${colList} FROM "Customer"`);

    const header = [
      `-- Galit CRM — Customer table backup`,
      `-- Generated: ${new Date().toISOString()}`,
      `-- Row count: ${rows.length}`,
      `-- Columns: ${columns.length}`,
      ``,
      `SET search_path TO public;`,
      `BEGIN;`,
      ``,
      `-- לרסטור נקי: בטל את ההערה בשורה הבאה (ימחק את הטבלה לפני הטענה):`,
      `-- TRUNCATE "Customer" RESTART IDENTITY CASCADE;`,
      ``,
    ].join('\n');

    const inserts = rows
      .map((row) => {
        const vals = columns.map((c) => this.formatSqlValue(row[c]));
        return `INSERT INTO "Customer" (${colList}) VALUES (${vals.join(', ')});`;
      })
      .join('\n');

    const footer = `\n\nCOMMIT;\n`;
    return { sql: header + inserts + footer, rowCount: rows.length };
  }

  private formatSqlValue(v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) {
      const t = v.getTime();
      return Number.isFinite(t) ? `'${v.toISOString()}'::timestamptz` : 'NULL';
    }
    if (Array.isArray(v)) {
      // PostgreSQL array literal: '{item1,item2}' — items with special chars quoted with "
      const items = v.map((x) => {
        if (x === null || x === undefined) return 'NULL';
        const s = String(x);
        // escape backslash + double-quote, then wrap in "
        return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      });
      return `'{${items.join(',')}}'`;
    }
    if (v instanceof Uint8Array || (v && typeof (v as Buffer).toString === 'function' && Buffer.isBuffer(v))) {
      const b = Buffer.isBuffer(v) ? v : Buffer.from(v as Uint8Array);
      return `'\\x${b.toString('hex')}'`;
    }
    if (typeof v === 'object') {
      // JSON column — serialize + cast
      return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    }
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  /** בוחר משתמש-בעלים לגיבוי: קודם מה-SystemSetting, אחרת ADMIN פעיל ראשון עם MS connection. */
  private async resolveBackupOwner(): Promise<{ id: string; email: string | null } | null> {
    const setting = await this.prisma.systemSetting
      .findUnique({ where: { key: BACKUP_OWNER_KEY } })
      .catch(() => null);
    const explicit = setting?.value && typeof setting.value === 'object' ? (setting.value as any).userId : null;
    if (typeof explicit === 'string' && explicit) {
      const u = await this.prisma.user.findUnique({ where: { id: explicit }, select: { id: true, email: true } });
      if (u) return u;
    }
    // Fallback: אדמין פעיל ראשון עם חיבור Microsoft (odRefreshToken או msRefreshToken).
    const admin = await this.prisma.user.findFirst({
      where: {
        status: 'ACTIVE' as any,
        role: 'ADMIN' as any,
        OR: [{ odRefreshToken: { not: null } }, { msRefreshToken: { not: null } }],
      },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });
    return admin;
  }

  /**
   * מריץ את הגיבוי: מייצר SQL, מעלה ל-OneDrive, שומר מטא ב-SystemSetting.
   * אידמפוטנטי לחודש הנוכחי — אם שם הקובץ כבר קיים ב-OneDrive, הוא נדרס
   * (אותה חודש = אותו שם: `customers-YYYY-MM.sql`).
   *
   * errorOnFail=false (ברירת מחדל) → שומר את השגיאה במטא ולא זורק; שימושי ל-cron
   * כדי שלא נפיל את ה-process על כשל גיבוי. errorOnFail=true → זורק (לאנדפוינט ידני).
   */
  async runCustomerBackup(opts: { triggeredByUserId?: string; errorOnFail?: boolean } = {}): Promise<CustomerBackupMeta> {
    const now = new Date();
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fileName = `customers-${yyyyMm}.sql`;

    try {
      const owner = await this.resolveBackupOwner();
      if (!owner) {
        throw new BadRequestException(
          'אין משתמש-אדמין עם חיבור OneDrive — חברי Microsoft לפחות למשתמש אחד או קבע ownerUserId בהגדרות הגיבוי.',
        );
      }

      const { sql, rowCount } = await this.exportCustomerTableAsSql();
      const content = Buffer.from(sql, 'utf-8');

      const upload = await this.graphFiles.uploadRaw(
        owner.id,
        'CRM-Backups',
        fileName,
        content,
        'application/sql',
      );

      const meta: CustomerBackupMeta = {
        createdAt: now.toISOString(),
        fileName: upload.name,
        rowCount,
        byteSize: content.byteLength,
        oneDriveWebUrl: upload.webUrl,
        oneDriveItemId: upload.itemId,
        ownerUserId: owner.id,
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        error: null,
      };

      await this.prisma.systemSetting.upsert({
        where: { key: CUSTOMER_BACKUP_KEY },
        create: { key: CUSTOMER_BACKUP_KEY, value: meta as any },
        update: { value: meta as any },
      });

      this.logger.log(
        `customer backup ok · rows=${rowCount} · bytes=${content.byteLength} · file=${upload.name} · owner=${owner.email || owner.id}`,
      );
      return meta;
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      this.logger.error(`customer backup FAILED: ${errorMsg}`);

      // שמירת שגיאה במטא כדי שהפופ-אפ יראה "הגיבוי האחרון נכשל"
      const errorMeta: CustomerBackupMeta = {
        createdAt: now.toISOString(),
        fileName,
        rowCount: 0,
        byteSize: 0,
        oneDriveWebUrl: '',
        oneDriveItemId: '',
        ownerUserId: '',
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        error: errorMsg,
      };
      await this.prisma.systemSetting
        .upsert({
          where: { key: CUSTOMER_BACKUP_KEY },
          create: { key: CUSTOMER_BACKUP_KEY, value: errorMeta as any },
          update: { value: errorMeta as any },
        })
        .catch(() => undefined);

      if (opts.errorOnFail) throw e;
      return errorMeta;
    }
  }

  /** המטא של הגיבוי האחרון (או null אם מעולם לא רץ). */
  async getLatestCustomerBackup(): Promise<CustomerBackupMeta | null> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: CUSTOMER_BACKUP_KEY } })
      .catch(() => null);
    if (!row?.value) return null;
    return row.value as unknown as CustomerBackupMeta;
  }

  /** אישור "הורדתי לדיסקאון קי" — מכבה את הפופ-אפ עד הגיבוי הבא. */
  async acknowledgeCustomerBackup(userId: string): Promise<CustomerBackupMeta> {
    const current = await this.getLatestCustomerBackup();
    if (!current) throw new NotFoundException('אין גיבוי לקוחות — הרץ קודם runCustomerBackup');
    const updated: CustomerBackupMeta = {
      ...current,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedByUserId: userId,
    };
    await this.prisma.systemSetting.update({
      where: { key: CUSTOMER_BACKUP_KEY },
      data: { value: updated as any },
    });
    return updated;
  }

  /** מוריד את תוכן הקובץ העדכני ישר מ-OneDrive (לשרשור ללקוח כקובץ להורדה). */
  async downloadLatestCustomerBackup(): Promise<{ fileName: string; content: Buffer }> {
    const meta = await this.getLatestCustomerBackup();
    if (!meta || !meta.oneDriveItemId || !meta.ownerUserId) {
      throw new NotFoundException('אין גיבוי לקוחות זמין ב-OneDrive');
    }
    const content = await this.graphFiles.downloadContent(meta.ownerUserId, meta.oneDriveItemId);
    return { fileName: meta.fileName, content };
  }

  // ─── ייצוא ZIP של כל קבצי הדוחות ──────────────────────────────────────────

  /**
   * מייצא ZIP שמכיל את כל קבצי הדוחות — Document.documentType='REPORT' עם
   * dataBase64 שאינו null. בפועל הדוחות של גלית נשמרים ישירות בטבלת Document
   * (לרוב מקושרים ל-Customer, לפעמים גם ל-Report), ולכן השאילתה כאן על
   * documentType ולא על ה-relation של Report.
   *
   * מבנה ה-ZIP: תיקייה פר-לקוח, ובתוכה הקבצים (עם תאריך בשם לצורך סדר).
   * קובץ _INDEX.csv ב-root מסכם כל קובץ שנכלל (לקוח, שם, תאריך, גודל, mime).
   *
   * שימוש: ה-controller קורא לזה, מחזיר כ-attachment. ZIP נבנה ב-memory —
   * ל-DB עם >100k מסמכים עדיף להפנות כאן ל-archiver סטרימינג; לנפח גלית סביר.
   */
  async exportAllReportsAsZip(): Promise<{
    zip: Buffer;
    stats: {
      documentsScanned: number;
      filesIncluded: number;
      filesSkippedEmpty: number;
      customersWithReports: number;
      totalBytes: number;
    };
  }> {
    const PizZip = require('pizzip');

    // Document.documentType='REPORT' + dataBase64 not null. select רזה כדי לא
    // למשוך base64 של מסמכים ריקים/לא רלוונטיים (כל שורה יכולה להיות מגה-בייטים).
    const docs = await this.prisma.document.findMany({
      where: {
        documentType: 'REPORT' as any,
        dataBase64: { not: null },
      },
      select: {
        id: true,
        name: true,
        mimeType: true,
        dataBase64: true,
        sizeBytes: true,
        documentDate: true,
        createdAt: true,
        customerId: true,
        reportId: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const zip = new PizZip();
    let filesIncluded = 0;
    let filesSkippedEmpty = 0;
    let totalBytes = 0;
    const customersSeen = new Set<string>();

    const indexRows: string[] = [
      ['customer', 'file_name', 'document_date', 'created_at', 'mime_type', 'bytes', 'document_id'].join(','),
    ];

    const sanitize = (s: string, maxLen = 80) =>
      (s || '')
        .replace(/[\u0000-\u001f/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen) || 'untitled';

    const extFromMime = (mime: string | null | undefined): string | null => {
      if (!mime) return null;
      const m = mime.toLowerCase();
      if (m.includes('wordprocessingml')) return 'docx';
      if (m.includes('msword')) return 'doc';
      if (m === 'application/pdf') return 'pdf';
      if (m.includes('spreadsheetml')) return 'xlsx';
      if (m === 'application/vnd.ms-excel') return 'xls';
      if (m.includes('image/jpeg')) return 'jpg';
      if (m.includes('image/png')) return 'png';
      return null;
    };

    for (const d of docs) {
      if (!d.dataBase64) continue;
      let bytes: Buffer;
      try {
        bytes = Buffer.from(d.dataBase64, 'base64');
      } catch {
        filesSkippedEmpty++;
        continue;
      }
      if (!bytes.length) {
        filesSkippedEmpty++;
        continue;
      }

      const customer = d.customer?.name || (d.customerId ? `cust-${d.customerId.slice(0, 8)}` : 'ללא לקוח');
      const folderName = sanitize(customer, 70);
      customersSeen.add(folderName);

      const dateStr = (d.documentDate ?? d.createdAt).toISOString().slice(0, 10);
      const inferredExt = extFromMime(d.mimeType);
      const rawName = d.name && d.name.trim() ? d.name.trim() : `report-${d.id.slice(0, 8)}`;
      const hasExt = /\.[A-Za-z0-9]{1,6}$/.test(rawName);
      // תאריך-קידומת כדי לשמור על סדר כרונולוגי בתוך תיקיית הלקוח
      const finalName = sanitize(
        hasExt ? `${dateStr} · ${rawName}` : `${dateStr} · ${rawName}.${inferredExt ?? 'bin'}`,
      );

      zip.folder(folderName).file(finalName, bytes);
      filesIncluded++;
      totalBytes += bytes.length;

      indexRows.push(
        [
          csvCell(customer),
          csvCell(finalName),
          d.documentDate ? d.documentDate.toISOString().slice(0, 10) : '',
          d.createdAt.toISOString(),
          d.mimeType || '',
          bytes.length,
          d.id,
        ].join(','),
      );
    }

    zip.file('_INDEX.csv', '﻿' + indexRows.join('\n'));

    const buf: Buffer = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    this.logger.log(
      `reports export: docs=${docs.length} included=${filesIncluded} empty=${filesSkippedEmpty} customers=${customersSeen.size} bytes=${totalBytes} zip=${buf.byteLength}`,
    );

    return {
      zip: buf,
      stats: {
        documentsScanned: docs.length,
        filesIncluded,
        filesSkippedEmpty,
        customersWithReports: customersSeen.size,
        totalBytes,
      },
    };
  }
}

/** Escape commas/quotes/newlines לתוך תא CSV. */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
