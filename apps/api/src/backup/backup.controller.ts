import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BackupService } from './backup.service';

/**
 * דשבורד בקרה/גיבוי — מנהלי מערכת בלבד (ADMIN).
 *
 * /backup/health            — ספירות + סימני חיים של המסד (מהיר, לרענון תכוף)
 * /backup/snapshot          — כל הנתונים המלאים לתצוגה בטבלאות
 * /backup/customer/latest   — מטא של הגיבוי החודשי האחרון (לפופ-אפ "הורד לדיסקאון קי")
 * /backup/customer/ack      — מסמן שהמנהל/ת הוריד/ה את הקובץ לדיסקאון קי (מכבה פופ-אפ)
 * /backup/customer/run      — הפעלה ידנית של גיבוי (כפתור "גבה עכשיו")
 * /backup/customer/download — מוריד את ה-SQL העדכני כקובץ
 */
@Controller('backup')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('health')
  health() {
    return this.backup.health();
  }

  @Get('snapshot')
  snapshot() {
    return this.backup.snapshot();
  }

  // ─── גיבוי חודשי של טבלת Customer ───

  @Get('customer/latest')
  latestCustomer() {
    return this.backup.getLatestCustomerBackup();
  }

  @Post('customer/ack')
  acknowledge(@Headers('x-user-id') userId: string, @Body() body: { userId?: string }) {
    // ה-RolesGuard כבר אימת שהמשתמש ADMIN; לוקחים את ה-id מה-header או גוף הבקשה.
    return this.backup.acknowledgeCustomerBackup(userId || body?.userId || 'unknown');
  }

  @Post('customer/run')
  runNow(@Headers('x-user-id') userId: string) {
    return this.backup.runCustomerBackup({ triggeredByUserId: userId, errorOnFail: true });
  }

  @Get('customer/download')
  async download(@Query('name') _name: string, @Res() res: Response) {
    const { fileName, content } = await this.backup.downloadLatestCustomerBackup();
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.send(content);
  }

  /**
   * ייצוא ZIP של כל קבצי הדוחות (Document.documentType='REPORT'). ADMIN בלבד.
   * מבנה: תיקייה פר-לקוח, _INDEX.csv ב-root.
   */
  @Get('reports/export-all')
  async exportAllReports(@Res() res: Response) {
    const { zip, stats } = await this.backup.exportReportsAsZip();
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `galit-reports-${date}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('X-Backup-Stats', JSON.stringify(stats));
    res.send(zip);
  }
}
