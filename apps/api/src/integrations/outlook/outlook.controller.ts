import {
  BadRequestException, Body, Controller, Logger, Post, Req, UnauthorizedException,
  UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { OutlookImportService } from './outlook-import.service';
import { OutlookAuthService } from './outlook-auth.service';
import type { OutlookImportMetadata } from './dto/import-email.dto';

@Controller('integrations/outlook')
export class OutlookController {
  private readonly logger = new Logger(OutlookController.name);

  constructor(
    private readonly importer: OutlookImportService,
    private readonly auth: OutlookAuthService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /api/integrations/outlook/auth  { msAccessToken }
   * החלפת טוקן Microsoft (מהתוסף) ל-JWT של ה-CRM. ללא RolesGuard — זו נקודת הכניסה.
   */
  @Post('auth')
  async ssoExchange(@Body('msAccessToken') msAccessToken: string) {
    const out = await this.auth.exchangeMicrosoftToken(String(msAccessToken || ''));
    return { success: true, accessToken: out.accessToken, user: out.user };
  }

  /**
   * POST /api/integrations/outlook/requests  (multipart/form-data)
   * שדות: metadata (JSON), emailFile (message.eml, אופציונלי).
   * מוגן ב-JWT (RolesGuard) — הזהות נלקחת מה-token בלבד.
   */
  @Post('requests')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  // emailFile = ה-EML המלא; attachments[] = כל צרופה כקובץ נפרד, כדי שתישמר
  // כמסמך עצמאי בכרטיס הלקוח ולא רק בתוך ה-EML.
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'emailFile', maxCount: 1 },
    { name: 'attachments', maxCount: 20 },
  ]))
  async createRequest(
    @Req() req: any,
    @Body('metadata') metadataRaw: string,
    @UploadedFiles() files?: {
      emailFile?: Array<{ buffer: Buffer; originalname: string; size: number; mimetype: string }>;
      attachments?: Array<{ buffer: Buffer; originalname: string; size: number; mimetype: string }>;
    },
  ) {
    const emailFile = files?.emailFile?.[0];
    const attachmentFiles = files?.attachments ?? [];
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('משתמש לא מזוהה');

    let meta: OutlookImportMetadata;
    try {
      meta = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : (metadataRaw || {});
    } catch {
      throw new BadRequestException('metadata אינו JSON תקין');
    }

    // שם העובד נשלף מה-DB (req.user מחזיק id/role בלבד).
    const dbUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);

    try {
      return await this.importer.importEmail(userId, dbUser?.name ?? null, meta, emailFile ?? null, attachmentFiles);
    } catch (e: any) {
      // לא מחזירים stack/פרטי שרת למשתמש.
      this.logger.error(`outlook import failed: ${e?.message || e}`);
      if (e?.status === 400 || e?.status === 401) {
        return { success: false, errorCode: 'OUTLOOK_IMPORT_FAILED', message: e?.message || 'לא ניתן היה להוסיף את המייל ל-CRM' };
      }
      return { success: false, errorCode: 'OUTLOOK_IMPORT_FAILED', message: 'לא ניתן היה להוסיף את המייל ל-CRM' };
    }
  }
}
