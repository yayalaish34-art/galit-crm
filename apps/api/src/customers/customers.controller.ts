import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { ReportMailService } from '../quotes/report-mail.service';
import { SendCustomerDocumentEmailDto } from './dto/update-customer.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CustomerPagedQueryDto } from './dto/customer-paged-query.dto';
import {
  CreateCustomerDocumentDto,
  CreateManualIncomeDto,
  CreateSignedQuoteDto,
  ParseSignedQuoteDto,
  ReplaceAdditionalDataDto,
  ReplaceBlocksDto,
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
  constructor(
    private readonly customersService: CustomersService,
    private readonly reportMail: ReportMailService,
  ) {}

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.customersService.create(body);
  }

  /**
   * POST /customers/resolve — מאתר לקוח קיים לפי הפרטים, ורק אם אין יוצר חדש.
   *
   * זה המסלול שכל שלב בצינור צריך להשתמש בו. `POST /customers` הרגיל יוצר
   * תמיד, ולכן שלב שקרא לו על לקוח קיים פתח אותו מחדש בכל פעם.
   * מחזיר `{ customer, created, matchedBy }` כדי שהממשק יוכל לדעת אם שויך
   * לקוח קיים או נוצר חדש.
   */
  @Post('resolve')
  resolve(@Body() body: any) {
    return this.customersService.resolve(body);
  }

  @Get('paged')
  findPaged(@Query() query: CustomerPagedQueryDto) {
    return this.customersService.findPaged(query.page, query.limit, query.q, query.type);
  }

  @Get('not-relevant')
  listNotRelevant() {
    return this.customersService.listNotRelevant();
  }

  /** 10 הלקוחות האחרונים שהמשתמש הנוכחי נכנס אליהם (לפי viewedAt). */
  @Get('recent-views')
  recentViews(@Req() req: any) {
    return this.customersService.listRecentlyViewedCustomers(req.user?.id);
  }

  /** 20 המיילים האחרונים מתיבת ה-Outlook של העובד המחובר — לבחירה ולצירוף כבקשה. */
  @Get('inbox/recent')
  recentInbox(@Req() req: any, @Query('top') top?: string) {
    return this.customersService.listRecentInboxForUser(req.user?.id, Number(top) || 20);
  }

  /** רשימת ה"בקשות" (מיילים שתויקו) של לקוח. */
  @Get(':id/email-requests')
  listEmailRequests(@Param('id') id: string) {
    return this.customersService.listEmailRequests(id);
  }

  /** צירוף מייל מ-Outlook כבקשה לכרטיס הלקוח (לפי messageId מרשימת ה-inbox). */
  @Post(':id/email-requests')
  attachEmailRequest(@Param('id') id: string, @Body('messageId') messageId: string, @Req() req: any) {
    return this.customersService.attachEmailRequest(id, messageId, { id: req.user?.id, name: req.user?.name });
  }

  /** מחיקת בקשה שתויקה. */
  @Delete(':id/email-requests/:requestId')
  deleteEmailRequest(@Param('id') id: string, @Param('requestId') requestId: string) {
    return this.customersService.deleteEmailRequest(id, requestId);
  }

  /** חיפוש לקוח + אנשי קשר — מחזיר לקוחות תואמים עם רשימת אנשי הקשר שתאמו. */
  @Get('search')
  searchWithContacts(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.customersService.searchWithContacts(q, limit ? parseInt(limit, 10) : undefined);
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

  @Put(':id/blocks')
  replaceBlocks(@Param('id') id: string, @Body() body: ReplaceBlocksDto) {
    return this.customersService.replaceBlocks(id, body);
  }

  /**
   * POST /customers/:id/view — רושם שהמשתמש הנוכחי נכנס ללקוח (ל"10 לקוחות אחרונים").
   * best-effort: מזהה לא קיים לא זורק.
   */
  @Post(':id/view')
  recordView(@Param('id') id: string, @Req() req: any) {
    return this.customersService.recordCustomerView(id, req.user?.id);
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

  /**
   * POST /customers/:id/documents/:documentId/send-email
   * שולח דוח קיים מכרטיס הלקוח במייל דרך ה-Outlook של המשתמש — ללא משימה משויכת
   * (לא מסמן משימה כ-DONE ולא שולח בקשת דירוג).
   */
  @Post(':id/documents/:documentId/send-email')
  sendDocumentEmail(
    @Param('id') _id: string,
    @Param('documentId') documentId: string,
    @Body() body: SendCustomerDocumentEmailDto,
    @Req() req: any,
  ) {
    return this.reportMail.sendDocumentEmail({
      ...(body || {}),
      documentId,
      userId: req.user?.id,
    });
  }

  /** חילוץ הסכום הסופי מ-PDF של הצעה חתומה (לפני האישור). */
  @Post(':id/signed-quote/parse')
  parseSignedQuote(@Param('id') _id: string, @Body() body: ParseSignedQuoteDto) {
    return this.customersService.parseSignedQuoteTotal(body);
  }

  /** צירוף הצעה חתומה ידנית: מסמך SIGNED_QUOTE + Quote SIGNED + קידום משימה. */
  @Post(':id/signed-quote')
  createSignedQuote(@Param('id') id: string, @Body() body: CreateSignedQuoteDto, @Req() req: any) {
    return this.customersService.createSignedQuote(id, body, req.user?.id);
  }

  /** הכנסה ידנית — יצירה / רשימה / מחיקה (Quote סינתטי שנספר בהכנסות הדשבורד). */
  @Get(':id/manual-income')
  listManualIncome(@Param('id') id: string) {
    return this.customersService.listManualIncome(id);
  }

  @Post(':id/manual-income')
  createManualIncome(@Param('id') id: string, @Body() body: CreateManualIncomeDto, @Req() req: any) {
    return this.customersService.createManualIncome(id, body, req.user?.id);
  }

  @Delete(':id/manual-income/:quoteId')
  removeManualIncome(@Param('id') id: string, @Param('quoteId') quoteId: string) {
    return this.customersService.deleteManualIncome(id, quoteId);
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
