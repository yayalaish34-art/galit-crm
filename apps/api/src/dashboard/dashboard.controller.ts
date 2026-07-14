import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('manager')
  @Roles('ADMIN', 'MANAGER')
  manager(@Req() req: any) {
    return this.dashboardService.manager(req.user);
  }

  /** עדכון יעד המכירות השנתי (נשמר כיעד חודשי = שנתי ÷ 12). מנהל/אדמין בלבד. */
  @Post('target')
  @Roles('ADMIN', 'MANAGER')
  setTarget(@Req() req: any, @Body('annualRevenueTarget') annualRevenueTarget: number) {
    return this.dashboardService.setAnnualRevenueTarget(annualRevenueTarget, req.user);
  }

  @Get('me')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  me(@Req() req: any) {
    return this.dashboardService.me(req.user);
  }
}

