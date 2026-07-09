import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CustomerPagedQueryDto } from './dto/customer-paged-query.dto';
import {
  CreateCustomerDocumentDto,
  ReplaceAdditionalDataDto,
  ReplaceExternalDataDto,
  ReplaceQuestionnairesDto,
  ReplaceReferralSourcesDto,
  ReplaceRelationsDto,
  UpdateCustomerDocumentDto,
  UpdateCustomerDto,
} from './dto/update-customer.dto';

@Controller('customers')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.customersService.create(body);
  }

  @Get('paged')
  findPaged(@Query() query: CustomerPagedQueryDto) {
    return this.customersService.findPaged(query.page, query.limit, query.q, query.type);
  }

  @Get('not-relevant')
  listNotRelevant() {
    return this.customersService.listNotRelevant();
  }

  @Get(':id/full')
  findFull(@Param('id') id: string) {
    return this.customersService.findFull(id);
  }

  @Get(':id/contacts')
  listContacts(@Param('id') id: string) {
    return this.customersService.listContacts(id);
  }

  @Put(':id/referral-sources')
  replaceReferralSources(@Param('id') id: string, @Body() body: ReplaceReferralSourcesDto) {
    return this.customersService.replaceReferralSources(id, body);
  }

  @Put(':id/questionnaires')
  replaceQuestionnaires(@Param('id') id: string, @Body() body: ReplaceQuestionnairesDto) {
    return this.customersService.replaceQuestionnaires(id, body);
  }

  @Put(':id/relations')
  replaceRelations(@Param('id') id: string, @Body() body: ReplaceRelationsDto) {
    return this.customersService.replaceRelations(id, body);
  }

  @Put(':id/additional-data-rows')
  replaceAdditionalData(@Param('id') id: string, @Body() body: ReplaceAdditionalDataDto) {
    return this.customersService.replaceAdditionalDataRows(id, body);
  }

  @Put(':id/external-data-rows')
  replaceExternalData(@Param('id') id: string, @Body() body: ReplaceExternalDataDto) {
    return this.customersService.replaceExternalDataRows(id, body);
  }

  @Get(':id/documents')
  listDocuments(@Param('id') id: string, @Query('type') type?: string) {
    return this.customersService.listCustomerDocuments(id, type);
  }

  @Post(':id/documents')
  createDocument(@Param('id') id: string, @Body() body: CreateCustomerDocumentDto, @Req() req: any) {
    return this.customersService.createCustomerDocument(id, body, req.user?.id);
  }

  @Patch(':id/documents/:documentId')
  updateDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() body: UpdateCustomerDocumentDto,
  ) {
    return this.customersService.updateCustomerDocument(id, documentId, body);
  }

  @Delete(':id/documents/:documentId')
  removeDocument(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.customersService.removeCustomerDocument(id, documentId);
  }

  @Post(':id/contacts')
  createContact(@Param('id') id: string, @Body() body: any) {
    return this.customersService.createContact(id, body);
  }

  @Patch(':id/contacts/:contactId')
  updateContact(@Param('id') id: string, @Param('contactId') contactId: string, @Body() body: any) {
    return this.customersService.updateContact(id, contactId, body);
  }

  @Delete(':id/contacts/:contactId')
  removeContact(@Param('id') id: string, @Param('contactId') contactId: string) {
    return this.customersService.removeContact(id, contactId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCustomerDto) {
    return this.customersService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.customersService.remove(id, req.user);
  }
}
