import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * נתיבים ציבוריים (ללא RolesGuard) — לשיתוף קבצים בקישור ישיר (capability URL).
 * מזהה הקובץ הוא UUID לא-ניחוש, כך שהקישור משמש כהרשאה.
 */
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  private async sendAttachment(id: string, res: Response) {
    const att = await this.prisma.taskAttachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('Attachment not found');
    // שם ההורדה תמיד נלקח מהשם השמור (יפה, בעברית) — ללא תלות בכתובת
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.fileName)}"`);
    res.send(Buffer.from(att.data));
  }

  /** הורדת קובץ מצורף של משימה לפי מזהה */
  @Get('attachments/:id')
  async getAttachment(@Param('id') id: string, @Res() res: Response) {
    await this.sendAttachment(id, res);
  }

  /**
   * אותו דבר, עם סיומת שם-קובץ בכתובת לקריאוּת בלבד (למשל ".../price-quote.docx").
   * שם ההורדה בפועל נקבע מהשם השמור.
   */
  @Get('attachments/:id/:filename')
  async getAttachmentNamed(@Param('id') id: string, @Res() res: Response) {
    await this.sendAttachment(id, res);
  }
}
