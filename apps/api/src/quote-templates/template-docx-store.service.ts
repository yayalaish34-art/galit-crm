import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

/** חתימת ZIP — כל DOCX תקין מתחיל ב-PK\x03\x04. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** תקרה שפויה לקובץ תבנית (הכבד ביותר בפועל ~1.8MB). */
const MAX_TEMPLATE_BYTES = 25 * 1024 * 1024;

export type TemplateDocxSource = 'edited' | 'original';

/**
 * מקור-האמת לקובץ ה-DOCX של תבנית הצעת מחיר.
 *
 * לכל תבנית יש קובץ מקורי בתיקיית `templates/` (נצרב לאימג' ה-Docker), ואם מנהל
 * ערך אותה — גם גרסה ערוכה בבסיס הנתונים. כל מי שצריך את התבנית (מיזוג, חילוץ
 * placeholders, הורדה) חייב לעבור דרך `getBytes` כדי לקבל את **הגרסה הפעילה**,
 * אחרת עריכות המנהל פשוט לא ישפיעו על ההצעות שנשלחות ללקוח.
 *
 * ביטול עריכה = מחיקת השורה; הקובץ המקורי חוזר לתוקף מיד.
 */
@Injectable()
export class TemplateDocxStore {
  private readonly logger = new Logger(TemplateDocxStore.name);
  private readonly templatesDir = path.resolve(process.cwd(), 'templates');

  constructor(private readonly prisma: PrismaService) {}

  /** נתיב מוחלט לקובץ המקורי, עם הגנה מפני יציאה מהתיקייה (path traversal). */
  private resolveOriginal(templatePath: string): string {
    const full = path.resolve(this.templatesDir, templatePath);
    if (full !== this.templatesDir && !full.startsWith(this.templatesDir + path.sep)) {
      throw new BadRequestException('נתיב תבנית לא חוקי');
    }
    return full;
  }

  /** האם קיים קובץ פעיל לתבנית — ערוך או מקורי. */
  async has(templateId: string, templatePath: string | null | undefined): Promise<boolean> {
    if (await this.hasOverride(templateId)) return true;
    if (!templatePath) return false;
    try {
      return fs.existsSync(this.resolveOriginal(templatePath));
    } catch {
      return false;
    }
  }

  async hasOverride(templateId: string): Promise<boolean> {
    const row = await (this.prisma as any).quoteTemplateDocx.findUnique({
      where: { templateId },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * הבייטים הפעילים של התבנית: הגרסה הערוכה אם קיימת, אחרת הקובץ המקורי.
   * זורק אם אין אף אחד מהם — עדיף להיכשל בגלוי מאשר למזג מסמך ריק.
   */
  async getBytes(
    templateId: string,
    templatePath: string | null | undefined,
  ): Promise<{ bytes: Buffer; source: TemplateDocxSource }> {
    const row = await (this.prisma as any).quoteTemplateDocx.findUnique({ where: { templateId } });
    if (row?.dataBase64) {
      return { bytes: Buffer.from(row.dataBase64, 'base64'), source: 'edited' };
    }
    if (!templatePath) throw new NotFoundException('לתבנית זו אין קובץ DOCX');
    const full = this.resolveOriginal(templatePath);
    if (!fs.existsSync(full)) throw new NotFoundException(`קובץ התבנית חסר: ${templatePath}`);
    return { bytes: fs.readFileSync(full), source: 'original' };
  }

  /** מוודא שמדובר ב-DOCX אמיתי לפני שמירה — קובץ פגום ישבור כל הצעה עתידית. */
  private assertDocx(bytes: Buffer): void {
    if (!bytes?.length) throw new BadRequestException('הקובץ ריק');
    if (bytes.length > MAX_TEMPLATE_BYTES) throw new BadRequestException('הקובץ גדול מדי');
    if (!bytes.subarray(0, 4).equals(ZIP_MAGIC)) {
      throw new BadRequestException('הקובץ אינו DOCX תקין (יש לשמור ב-Word כ-.docx, לא .doc או PDF)');
    }
  }

  /** שומר גרסה ערוכה (upsert). מחליפה את הקודמת — ההיסטוריה היא הקובץ המקורי. */
  async saveOverride(
    templateId: string,
    bytes: Buffer,
    user?: { id?: string; name?: string },
  ): Promise<void> {
    this.assertDocx(bytes);
    const dataBase64 = bytes.toString('base64');
    const data = {
      dataBase64,
      sizeBytes: bytes.length,
      updatedById: user?.id ?? null,
      updatedByName: user?.name ?? null,
    };
    await (this.prisma as any).quoteTemplateDocx.upsert({
      where: { templateId },
      create: { templateId, ...data },
      update: data,
    });
    this.logger.log(`template ${templateId}: saved edited DOCX (${bytes.length} bytes)`);
  }

  /** ביטול העריכה — חזרה לקובץ המקורי. */
  async revert(templateId: string): Promise<boolean> {
    try {
      await (this.prisma as any).quoteTemplateDocx.delete({ where: { templateId } });
      this.logger.log(`template ${templateId}: reverted to the original DOCX`);
      return true;
    } catch {
      return false; // לא הייתה עריכה
    }
  }

  /** מטא-דאטה של העריכות לכמה תבניות בבת אחת (לרשימה בממשק). */
  async overrideInfoFor(
    templateIds: string[],
  ): Promise<
    Map<string, { updatedAt: Date; updatedByName: string | null; sizeBytes: number; onedriveWebUrl: string | null }>
  > {
    if (!templateIds.length) return new Map();
    const rows: any[] = await (this.prisma as any).quoteTemplateDocx.findMany({
      where: { templateId: { in: templateIds } },
      select: {
        templateId: true,
        updatedAt: true,
        updatedByName: true,
        sizeBytes: true,
        onedriveWebUrl: true,
      },
    });
    return new Map(
      rows.map((r) => [
        r.templateId,
        {
          updatedAt: r.updatedAt,
          updatedByName: r.updatedByName,
          sizeBytes: r.sizeBytes,
          onedriveWebUrl: r.onedriveWebUrl ?? null,
        },
      ]),
    );
  }

  /* ── עריכה ב-Word דרך OneDrive ─────────────────────────────────────────── */

  /** ההפניה ל-OneDrive של התבנית, אם הקובץ כבר הועלה לעריכה. */
  async getOnedriveRef(
    templateId: string,
  ): Promise<{ itemId: string; ownerId: string; webUrl: string | null } | null> {
    const row: any = await (this.prisma as any).quoteTemplateDocx.findUnique({
      where: { templateId },
      select: { onedriveItemId: true, onedriveOwnerId: true, onedriveWebUrl: true },
    });
    if (!row?.onedriveItemId || !row?.onedriveOwnerId) return null;
    return { itemId: row.onedriveItemId, ownerId: row.onedriveOwnerId, webUrl: row.onedriveWebUrl ?? null };
  }

  /**
   * שומר את ההפניה ל-OneDrive. יוצר את שורת ה-override אם אין — ומזריע אותה
   * בבייטים הפעילים הנוכחיים, כדי שגם אם המשתמש יסגור את Word בלי לשמור,
   * התבנית תישאר תקינה וזהה למקור.
   */
  async setOnedriveRef(
    templateId: string,
    seedBytes: Buffer,
    ref: { itemId: string; ownerId: string; webUrl?: string | null },
    user?: { id?: string; name?: string | null },
  ): Promise<void> {
    const onedrive = {
      onedriveItemId: ref.itemId,
      onedriveOwnerId: ref.ownerId,
      onedriveWebUrl: ref.webUrl ?? null,
    };
    await (this.prisma as any).quoteTemplateDocx.upsert({
      where: { templateId },
      create: {
        templateId,
        dataBase64: seedBytes.toString('base64'),
        sizeBytes: seedBytes.length,
        updatedById: user?.id ?? null,
        updatedByName: user?.name ?? null,
        ...onedrive,
      },
      update: onedrive,
    });
  }

  /** שומר גרסה שנמשכה מ-OneDrive ומסמן את זמן הסנכרון. */
  async saveSyncedFromOnedrive(
    templateId: string,
    bytes: Buffer,
    user?: { id?: string; name?: string | null },
  ): Promise<void> {
    this.assertDocx(bytes);
    await (this.prisma as any).quoteTemplateDocx.update({
      where: { templateId },
      data: {
        dataBase64: bytes.toString('base64'),
        sizeBytes: bytes.length,
        onedriveSyncedAt: new Date(),
        updatedById: user?.id ?? null,
        updatedByName: user?.name ?? null,
      },
    });
    this.logger.log(`template ${templateId}: synced edited DOCX from OneDrive (${bytes.length} bytes)`);
  }
}
