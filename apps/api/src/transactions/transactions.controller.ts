import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateTransactionDto,
  TransactionJournalFilterDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('journal')
  findJournal(@Query() query: TransactionJournalFilterDto) {
    return this.transactionsService.findJournal(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateTransactionDto) {
    return this.transactionsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTransactionDto) {
    return this.transactionsService.update(id, body);
  }
}
