import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { LeadStage } from '@prisma/client';
import { LeadsService } from './leads.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('leads')
@UseGuards(RolesGuard)
/** תואם ל-canAccess בפרונט — כל התפקידים (כולל טכנאי) ניגשים ללידים/לקוחות מהמשימות */
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
export class LeadsController {

  constructor(private leadsService: LeadsService) {}

  @Get()
  getLeads() {
    return this.leadsService.findAll();
  }

  @Get(':id')
  getLead(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Get(':id/activities')
  getActivities(@Param('id') id: string) {
    return this.leadsService.getActivities(id);
  }

  @Post(':id/activities')
  addActivity(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.leadsService.addLeadActivity(id, body, req.user);
  }

  @Post()
  createLead(@Body() body:any, @Req() req: any) {
    return this.leadsService.create(body, req.user);
  }

  @Patch(':id')
  updateLead(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.leadsService.update(id, body, req.user);
  }

  @Delete(':id')
  removeLead(@Param('id') id: string, @Req() req: any) {
    return this.leadsService.remove(id, req.user);
  }

  @Patch(':id/stage')
  updateStage(@Param('id') id: string, @Body('stage') stage: LeadStage, @Req() req: any) {
    return this.leadsService.updateStage(id, stage, req.user);
  }

  @Post(':id/convert-to-customer')
  convertToCustomer(@Param('id') id: string, @Req() req: any) {
    return this.leadsService.convertToCustomer(id, req.user);
  }

  @Post(':id/create-quote')
  createQuote(@Param('id') id: string, @Req() req: any) {
    return this.leadsService.createQuoteFromLead(id, req.user);
  }

  @Post(':id/open-project')
  openProject(@Param('id') id: string, @Req() req: any) {
    return this.leadsService.openProjectFromLead(id, req.user);
  }

}