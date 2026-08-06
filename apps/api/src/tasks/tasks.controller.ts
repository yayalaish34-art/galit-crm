import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { TasksService } from './tasks.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('tasks')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @Req() req: any,
    @Query('projectId') projectId?: string,
    @Query('scope') scope?: string,
  ) {
    return this.tasksService.findAll({ projectId, scope, user: req.user });
  }

  /**
   * המשימה הפעילה של הלקוח שאליה צריך להיצמד "מעקב" של הצעת מחיר, במקום לפתוח
   * משימה שנייה. מחזיר null כשאין מועמדת — ורק אז הקורא רשאי ליצור משימה חדשה.
   * חייב להיות מוצהר *לפני* @Get(':id') — Nest מתאים נתיבים לפי סדר ההצהרה.
   */
  @Get('active-for-customer/:customerId')
  findPromotableForCustomer(
    @Param('customerId') customerId: string,
    @Req() req: any,
    @Query('preferTaskId') preferTaskId?: string,
  ) {
    return this.tasksService.findPromotableForCustomer(customerId, preferTaskId, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.tasksService.create(body, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.tasksService.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.remove(id, req.user);
  }

  /** רשימת קבצים מצורפים למשימה (למשל: מסמך הצעת מחיר ממוזג) */
  @Get(':id/attachments')
  listAttachments(@Param('id') id: string) {
    return this.tasksService.listAttachments(id);
  }

  /** העלאת קובץ מצורף למשימה — נשמר ישירות ב-DB */
  @Post(':id/attachments')
  async addAttachment(
    @Param('id') id: string,
    @Body() body: { fileName?: string; mimeType?: string; dataBase64?: string },
  ) {
    if (!body?.fileName || !body?.mimeType || !body?.dataBase64) {
      throw new BadRequestException('fileName, mimeType and dataBase64 are required');
    }
    const data = Buffer.from(body.dataBase64, 'base64');
    return this.tasksService.addAttachment(id, body.fileName, body.mimeType, data);
  }

  /** הורדת קובץ מצורף (עם משיכה-בקריאה של הגרסה הערוכה מ-OneDrive לקובצי DOCX של הצעות) */
  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const attachment = await this.tasksService.getAttachmentForDownload(id, attachmentId);
    if (!attachment) throw new NotFoundException('Attachment not found');
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);
    res.send(Buffer.from(attachment.data));
  }

  /** מחיקת קובץ מצורף */
  @Delete(':id/attachments/:attachmentId')
  async removeAttachment(@Param('attachmentId') attachmentId: string) {
    await this.tasksService.removeAttachment(attachmentId);
    return { ok: true };
  }

  /** שינוי שם קובץ מצורף (עריכה ידנית של שם הקובץ) */
  @Patch(':id/attachments/:attachmentId')
  async renameAttachment(
    @Param('attachmentId') attachmentId: string,
    @Body() body: { fileName?: string },
  ) {
    if (!body?.fileName || !body.fileName.trim()) {
      throw new BadRequestException('fileName is required');
    }
    return this.tasksService.renameAttachment(attachmentId, body.fileName);
  }

  /** יצירה/עדכון נתוני שדה (פגישה מתואמת) — נשמר בעת לחיצה על "צור פגישה ב-Outlook" */
  @Post(':id/field')
  upsertField(@Param('id') id: string, @Body() body: any) {
    return this.tasksService.upsertTaskField(id, body);
  }
}

