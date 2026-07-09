import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateCustomerOrderDto,
  CreateOrderChargeTransactionDto,
  CreateOrderDocumentDto,
  CreateOrderItemDto,
  OrdersFilterDto,
  UpdateCustomerOrderDto,
  UpdateOrderChargeTransactionDto,
  UpdateOrderDocumentDto,
  UpdateOrderItemDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() query: OrdersFilterDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateCustomerOrderDto) {
    return this.ordersService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCustomerOrderDto) {
    return this.ordersService.update(id, body);
  }

  @Post(':id/items')
  createItem(@Param('id') id: string, @Body() body: CreateOrderItemDto) {
    return this.ordersService.createItem(id, body);
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateOrderItemDto) {
    return this.ordersService.updateItem(id, itemId, body);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.ordersService.removeItem(id, itemId);
  }

  @Get(':id/documents')
  listDocuments(@Param('id') id: string) {
    return this.ordersService.listDocuments(id);
  }

  @Post(':id/documents')
  createDocument(@Param('id') id: string, @Body() body: CreateOrderDocumentDto) {
    return this.ordersService.createDocument(id, body);
  }

  @Patch(':id/documents/:documentId')
  updateDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() body: UpdateOrderDocumentDto,
  ) {
    return this.ordersService.updateDocument(id, documentId, body);
  }

  @Delete(':id/documents/:documentId')
  removeDocument(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.ordersService.removeDocument(id, documentId);
  }

  @Get(':id/charge-transactions')
  listChargeTransactions(@Param('id') id: string) {
    return this.ordersService.listChargeTransactions(id);
  }

  @Post(':id/charge-transactions')
  createChargeTransaction(@Param('id') id: string, @Body() body: CreateOrderChargeTransactionDto) {
    return this.ordersService.createChargeTransaction(id, body);
  }

  @Patch(':id/charge-transactions/:transactionId')
  updateChargeTransaction(
    @Param('id') id: string,
    @Param('transactionId') transactionId: string,
    @Body() body: UpdateOrderChargeTransactionDto,
  ) {
    return this.ordersService.updateChargeTransaction(id, transactionId, body);
  }

  @Delete(':id/charge-transactions/:transactionId')
  removeChargeTransaction(@Param('id') id: string, @Param('transactionId') transactionId: string) {
    return this.ordersService.removeChargeTransaction(id, transactionId);
  }
}
