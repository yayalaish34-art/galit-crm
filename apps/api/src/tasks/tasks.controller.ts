import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { TasksService } from './tasks.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('tasks')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Req() req: any, @Query('projectId') projectId?: string) {
    return this.tasksService.findAll({ projectId, user: req.user });
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

  /** הורדת קובץ מצורף */
  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(@Param('attachmentId') attachmentId: string, @Res() res: Response) {
    const attachment = await this.tasksService.getAttachment(attachmentId);
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
}

