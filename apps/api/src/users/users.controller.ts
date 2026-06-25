import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('active-now')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  activeNow(@Req() req: any) {
    return this.usersService.activeNow(req.user);
  }

  /** שינוי סיסמה עצמי — כל משתמש מחובר משנה את הסיסמה של עצמו (לפי ה-JWT, לא לפי body). */
  @Post('change-password')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  changePassword(@Body() body: any, @Req() req: any) {
    return this.usersService.changeOwnPassword(req.user?.id, body?.currentPassword, body?.newPassword);
  }

  @Post('transfer-data')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  transferData(@Body() body: any, @Req() req: any) {
    const { fromUserId, toUserId, leads, customers, tasks, projects, quotes, activities } = body || {};
    return this.usersService.transferAssignments(
      fromUserId,
      toUserId,
      {
        leads: !!leads,
        customers: !!customers,
        tasks: !!tasks,
        projects: !!projects,
        quotes: !!quotes,
        activities: !!activities,
      },
      req.user,
    );
  }

  @Post('copy-permissions')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  copyPermissions(@Body() body: any, @Req() req: any) {
    const { fromUserId, toUserId } = body || {};
    return this.usersService.copyPermissionsFromUser(fromUserId, toUserId, req.user);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  findAll(@Req() req: any) {
    return this.usersService.findAll(req.user);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.usersService.findOne(id, req.user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  create(@Body() body: any, @Req() req: any) {
    return this.usersService.create(body, req.user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.usersService.update(id, body, req.user);
  }

  /**
   * POST /users/:id/test-smtp
   * בדיקת חיבור SMTP עם הגדרות אישיות של המשתמש
   */
  @Post(':id/test-smtp')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  testSmtp(@Param('id') id: string, @Body() body: any) {
    return this.usersService.testSmtpConnection(id, body);
  }

  /** העלאת תמונת חתימה (base64). body: { dataBase64, mimeType } */
  @Post(':id/signature-image')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  uploadSignatureImage(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.usersService.setSignatureImage(id, body?.dataBase64, body?.mimeType, req.user);
  }

  /** מחיקת תמונת חתימה */
  @Delete(':id/signature-image')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  deleteSignatureImage(@Param('id') id: string, @Req() req: any) {
    return this.usersService.setSignatureImage(id, null, null, req.user);
  }

  /** תצוגה מקדימה של תמונת החתימה (ציבורי לקריאה — מזהה UUID) */
  @Get(':id/signature-image')
  async getSignatureImage(@Param('id') id: string, @Req() req: any) {
    return this.usersService.getSignatureImage(id);
  }

  // ───────────── חתימות מרובות (תמונה + כותרת) ─────────────

  /** רשימת החתימות של המשתמש */
  @Get(':id/signatures')
  listSignatures(@Param('id') id: string) {
    return this.usersService.listSignatures(id);
  }

  /** הוספת חתימה. body: { title, dataBase64, mimeType } */
  @Post(':id/signatures')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  addSignature(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.usersService.addSignature(id, body?.title, body?.dataBase64, body?.mimeType, req.user);
  }

  /** עדכון כותרת חתימה. body: { title } */
  @Patch(':id/signatures/:sigId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  updateSignature(@Param('id') id: string, @Param('sigId') sigId: string, @Body() body: any, @Req() req: any) {
    return this.usersService.updateSignature(id, sigId, { title: body?.title }, req.user);
  }

  /** מחיקת חתימה */
  @Delete(':id/signatures/:sigId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  deleteSignature(@Param('id') id: string, @Param('sigId') sigId: string, @Req() req: any) {
    return this.usersService.deleteSignature(id, sigId, req.user);
  }

  @Patch(':id/presence')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  updatePresence(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const { isOnline, currentWorkMode, currentProjectId } = body || {};
    return this.usersService.updatePresence(id, { isOnline, currentWorkMode, currentProjectId }, req.user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.usersService.remove(id, req.user);
  }
}

