import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { PaymentTermsService } from './payment-terms.service';

@Controller('payment-terms')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
export class PaymentTermsController {
  constructor(private readonly service: PaymentTermsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreatePaymentTermDto) {
    return this.service.create(body);
  }
}
