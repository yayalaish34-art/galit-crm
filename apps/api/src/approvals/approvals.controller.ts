import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApprovalKind, ApprovalsService } from './approvals.service';

@Controller('approvals')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  /** האם המשתמש הנוכחי רשאי לאשר (יורם/גיא) — לשליטה בתצוגה בצד הלקוח. */
  @Get('me')
  async me(@Req() req: any) {
    return { isApprover: await this.service.isApprover(req.user?.id) };
  }

  /** בקשות ממתינות — למאשרים בלבד (נאכף בשירות, לא ב-guard: ADMIN עוקף @Roles). */
  @Get('pending')
  pending(@Req() req: any) {
    return this.service.pending(req.user?.id);
  }

  /** מונה לבאדג' בפעמון; מחזיר 0 למי שאינו מאשר. */
  @Get('pending-count')
  pendingCount(@Req() req: any) {
    return this.service.pendingCount(req.user?.id);
  }

  /** סטטוס בקשה עבור משימה — הפופ-אפ של העובד עושה פולינג על זה. */
  @Get('status')
  status(@Query('taskId') taskId: string, @Query('kind') kind: ApprovalKind) {
    return this.service.statusFor(taskId, kind);
  }

  @Post()
  create(@Req() req: any, @Body() body: { taskId: string; kind: ApprovalKind; reason?: string }) {
    return this.service.create(req.user?.id, body);
  }

  @Patch(':id/decide')
  decide(@Req() req: any, @Param('id') id: string, @Body() body: { approve: boolean; note?: string }) {
    return this.service.decide(req.user?.id, id, body);
  }
}
