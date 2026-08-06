import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
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

  /**
   * אנליטיקת לידים לפי מקור הגעה + תקופת זמן — נפתח בלחיצה על כרטיס
   * "לידים חדשים" בדשבורד המנהל. period=month|quarter|half|year|last30.
   */
  @Get('leads-analytics')
  @Roles('ADMIN', 'MANAGER')
  leadsAnalytics(@Req() req: any, @Query('period') period?: string) {
    return this.dashboardService.leadsAnalytics(req.user, period);
  }

  /**
   * אנליטיקת ביקורות לקוחות (שביעות רצון) לפי סיווג לקוח + עובד מטפל + תקופת זמן —
   * נפתח בלחיצה על כרטיס "שביעות רצון". period=last30|quarter|half|year.
   */
  @Get('reviews-analytics')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  reviewsAnalytics(@Req() req: any, @Query('period') period?: string) {
    // מנהל/אדמין מקבלים את כל הביקורות; עובד רגיל מקבל רק את הביקורות של הלקוחות
    // שהוא טיפל בהם (הסינון לפי ownerId נעשה בשירות).
    return this.dashboardService.reviewsAnalytics(req.user, period);
  }

  /**
   * אנליטיקת הכנסות לפי הזמנות (הצעות מאושרות) + פילוח מהנדסים ומגמת זמן —
   * נפתח בלחיצה על כרטיס "הכנסה". period=month|quarter|half|year|last30.
   */
  @Get('revenue-analytics')
  @Roles('ADMIN', 'MANAGER')
  revenueAnalytics(@Req() req: any, @Query('period') period?: string) {
    return this.dashboardService.revenueAnalytics(req.user, period);
  }

  /**
   * אנליטיקת "מקור הגעה" של לקוחות — פילוח לפי מקור, עם פילטר זמן ושם לקוח.
   * מנהל/אדמין בלבד.
   */
  @Get('customer-source-analytics')
  @Roles('ADMIN', 'MANAGER')
  customerSourceAnalytics(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('name') name?: string,
  ) {
    return this.dashboardService.customerSourceAnalytics(req.user, period, name);
  }

  /**
   * עדכון יעד המכירות החודשי (נשמר ישירות). לתאימות לאחור מתקבל גם annualRevenueTarget
   * (יומר ל-חודשי ÷ 12). מנהל/אדמין בלבד.
   */
  @Post('target')
  @Roles('ADMIN', 'MANAGER')
  setTarget(
    @Req() req: any,
    @Body('monthlyRevenueTarget') monthlyRevenueTarget: number,
    @Body('annualRevenueTarget') annualRevenueTarget: number,
  ) {
    return this.dashboardService.setRevenueTarget(
      { monthlyRevenueTarget, annualRevenueTarget },
      req.user,
    );
  }

  @Get('me')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  me(@Req() req: any) {
    return this.dashboardService.me(req.user);
  }
}

