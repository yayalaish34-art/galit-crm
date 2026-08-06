import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CaspitService, CASPIT_DOC_KINDS, type CaspitDocKind } from './caspit.service';
import { computeDueDate, PAYMENT_TERM_OPTIONS } from './payment-terms';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/**
 * חשבוniות כספית (Caspit) — הגדרות + הנפקת חשבונית משלב הגבייה.
 */
@Controller('caspit')
@UseGuards(RolesGuard)
export class CaspitController {
  constructor(
    private readonly caspit: CaspitService,
    private readonly prisma: PrismaService,
  ) {}

  /** סטטוס ההגדרות (בלי סיסמה) — למסך ההגדרות. */
  @Get('settings')
  @Roles('ADMIN', 'MANAGER', 'BILLING')
  settings() {
    return this.caspit.getStatus();
  }

  /** שמירת פרטי הגישה לכספית. סיסמה ריקה = שמירת הקיימת. מנהל/אדמין. */
  @Post('settings')
  @Roles('ADMIN', 'MANAGER')
  saveSettings(@Body() body: { userName?: string; password?: string; osekMorshe?: string }) {
    return this.caspit.saveCredentials({
      userName: body?.userName || '',
      password: body?.password,
      osekMorshe: body?.osekMorshe || '',
    });
  }

  /** בדיקת חיבור לכספית. */
  @Post('test')
  @Roles('ADMIN', 'MANAGER', 'BILLING')
  test() {
    return this.caspit.testConnection();
  }

  /**
   * POST /caspit/invoice/quote/:quoteId
   * מנפיק חשבונית בכספית מתוך הצעת מחיר (שורות הפריטים + פרטי הלקוח).
   * מחזיר { number, linkToPdf, viewUrl } ושומר את מספר החשבונית + קישור ה-PDF על ההצעה.
   */
  /**
   * POST /caspit/invoice/task/:taskId
   * מנפיק חשבונית עבור משימה — מאתר את הצעת המחיר המקושרת (linkedEntityId=taskId).
   * זהו המסלול משלב הגבייה (כל שורה שם היא משימה).
   */
  /**
   * POST /caspit/document/task/:taskId
   * מנפיק אחד מארבעת סוגי המסמכים משלב הגבייה, לפי body.kind:
   * proforma (חשבונית עסקה) | invoice (חשבונית מס) | invoiceReceipt (חשבונית מס קבלה) | receipt (קבלה).
   * שני האחרונים מייצגים כסף שהתקבל בפועל ונספרים בדוח "הכנסות בפועל".
   */
  @Post('document/task/:taskId')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  async documentForTask(
    @Param('taskId') taskId: string,
    @Body()
    body: {
      kind?: CaspitDocKind;
      amount?: number;
      paymentTypeId?: number;
      comments?: string;
      /** תנאי התשלום שאושרו במסך הגבייה — מהם נגזר תאריך היעד בכספית. */
      paymentTerms?: string | null;
      /** איש הקשר שנבחר בדיאלוג — אליו מופנה המסמך ואליו יוצע לשלוח אותו. */
      contactId?: string | null;
    },
  ) {
    const kind: CaspitDocKind = body?.kind && CASPIT_DOC_KINDS[body.kind] ? body.kind : 'invoice';
    if (kind === 'receipt') {
      // קבלה מתעדת כסף שכבר התקבל — אין לה תאריך יעד, ולכן תנאי התשלום
      // אינם רלוונטיים לה.
      return this.receiptForTask(taskId, {
        amount: body?.amount,
        paymentTypeId: body?.paymentTypeId,
        comments: body?.comments,
        contactId: body?.contactId,
      });
    }

    const quote: any = await this.prisma.quote.findFirst({
      where: { linkedEntityId: taskId } as any,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, customerContact: true },
    });
    if (!quote) {
      throw new BadRequestException(
        `לא נמצאה הצעת מחיר מקושרת למשימה — לא ניתן להנפיק ${CASPIT_DOC_KINDS[kind].label}`,
      );
    }
    return this.issueInvoiceFromQuote(
      quote,
      body?.comments || '',
      kind,
      { amount: body?.amount, paymentTypeId: body?.paymentTypeId },
      body?.paymentTerms,
      body?.contactId,
    );
  }

  /**
   * GET /caspit/customer/:customerId/documents
   * כל החשבוניות והקבלות שהונפקו בכספית ללקוח — לטאב "חשבוניות/קבלות" בכרטיס.
   */
  @Get('customer/:customerId/documents')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  customerDocuments(@Param('customerId') customerId: string) {
    return this.caspit.listCustomerDocuments(customerId);
  }

  /**
   * GET /caspit/due-date?terms=...&date=...
   * תצוגה מקדימה של תאריך היעד שייגזר מתנאי תשלום — המסך מציג אותו למשתמש
   * לפני ההנפקה, כדי שלא יאשר תאריך שלא ראה.
   */
  @Get('due-date')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  dueDatePreview(@Query('terms') terms?: string, @Query('date') date?: string) {
    return computeDueDate(terms ?? null, date ?? null);
  }

  /**
   * GET /caspit/task/:taskId/payment-terms
   * כל מה שדיאלוג "תנאי תשלום" צריך בקריאה אחת: התנאים שעל ההצעה המקושרת
   * (ברירת המחדל שתוצג), רשימת האפשרויות, ותצוגה מקדימה של תאריך היעד.
   */
  @Get('task/:taskId/payment-terms')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  async taskPaymentTerms(@Param('taskId') taskId: string) {
    const quote: any = await this.prisma.quote.findFirst({
      where: { linkedEntityId: taskId } as any,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, quoteNumber: true, paymentTerms: true, totalAmount: true,
        customerId: true, customerContactId: true,
      } as any,
    });
    const quoteTerms: string | null = quote?.paymentTerms ?? null;

    // אנשי הקשר של הלקוח — הדיאלוג מבקש לבחור למי המסמך מופנה (שם + מייל
    // על המסמך בכספית, וגם נמען ברירת המחדל לשליחה).
    const contacts = quote?.customerId
      ? await this.prisma.customerContact.findMany({
          where: { customerId: quote.customerId },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: { id: true, fullName: true, email: true, phone: true, mobile: true, isPrimary: true, roleTitle: true },
        }).catch(() => [])
      : [];

    return {
      quoteTerms,
      quoteNumber: quote?.quoteNumber ?? null,
      preview: computeDueDate(quoteTerms),
      options: await this.paymentTerms(),
      contacts,
      // איש הקשר שכבר נבחר בהצעה, אחרת הראשי — הבחירה שתסומן מראש.
      selectedContactId: quote?.customerContactId ?? contacts[0]?.id ?? null,
    };
  }

  /** GET /caspit/payment-terms — האפשרויות הקבועות לבחירה בדיאלוג הגבייה. */
  @Get('payment-terms')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  async paymentTerms() {
    return PAYMENT_TERM_OPTIONS.map((label) => ({ label, ...computeDueDate(label) }));
  }

  /** GET /caspit/income?period=month|quarter|year — הכנסות בפועל מכספית (אדמין). */
  @Get('income')
  @Roles('ADMIN')
  income(@Query('period') period?: string) {
    const p = ['month', 'quarter', 'year'].includes(String(period)) ? (period as any) : 'month';
    return this.caspit.getRealIncome(p);
  }

  @Post('invoice/task/:taskId')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  async invoiceForTask(@Param('taskId') taskId: string, @Body() body: { comments?: string }) {
    const quote: any = await this.prisma.quote.findFirst({
      where: { linkedEntityId: taskId } as any,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, customerContact: true },
    });
    if (!quote) {
      throw new BadRequestException('לא נמצאה הצעת מחיר מקושרת למשימה — לא ניתן להנפיק חשבונית אוטומטית');
    }
    return this.issueInvoiceFromQuote(quote, body?.comments || '');
  }

  @Post('invoice/quote/:quoteId')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  async invoiceForQuote(@Param('quoteId') quoteId: string, @Body() body: { comments?: string }) {
    const quote: any = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true },
    });
    if (!quote) throw new BadRequestException('הצעת המחיר לא נמצאה');
    return this.issueInvoiceFromQuote(quote, body?.comments || '');
  }

  /**
   * POST /caspit/receipt/task/:taskId
   * מנפיק **קבלה** על תשלום שהתקבל, לפי ההצעה המקושרת למשימה. בלי זה החשבונית
   * נשארת פתוחה ביתרת הלקוח בכספית גם אחרי שהלקוח שילם.
   * body.amount — סכום בפועל; ברירת מחדל: סכום ההצעה כולל מע"מ.
   * body.paymentTypeId — אמצעי תשלום (CASPIT_PAYMENT_TYPES); ברירת מחדל "אחר".
   */
  @Post('receipt/task/:taskId')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  async receiptForTask(
    @Param('taskId') taskId: string,
    @Body() body: { amount?: number; paymentTypeId?: number; comments?: string; emailTo?: string; contactId?: string | null },
  ) {
    const quote: any = await this.prisma.quote.findFirst({
      where: { linkedEntityId: taskId } as any,
      orderBy: { createdAt: 'desc' },
      // customerContact — איש הקשר שנבחר בהצעה; הוא הנמען הנכון לקבלה,
      // ולא כתובת המייל הכללית של החברה.
      include: { customer: true, customerContact: true },
    });
    if (!quote) {
      throw new BadRequestException('לא נמצאה הצעת מחיר מקושרת למשימה — לא ניתן להנפיק קבלה אוטומטית');
    }
    const cust = quote.customer || {};
    const amount = Number(body?.amount ?? quote.totalAmount ?? 0) || 0;
    if (amount <= 0) throw new BadRequestException('אין סכום לקבלה');

    const chosenContact = await this.loadChosenContact(quote, body?.contactId);
    const recipient = await this.resolveReceiptRecipient(
      quote, cust, body?.emailTo || chosenContact?.email || undefined,
    );
    const result = await this.caspit.createReceipt({
      documentId: `crm-receipt-${quote.id}`,
      customer: {
        id: quote.customerId || cust.id || null,
        businessName: quote.customerName || cust.name || 'לקוח',
        osekMorshe: cust.companyRegNumber || null,
        contactName: chosenContact?.fullName || cust.contactName || null,
        address1: cust.address || null,
        city: cust.city || null,
        email: chosenContact?.email || cust.email || null,
        phone: chosenContact?.phone || chosenContact?.mobile || cust.phone || null,
      },
      amount,
      paymentTypeId: body?.paymentTypeId,
      comments: body?.comments || '',
    });
    // הנמען מוחזר כהצעה בלבד — השליחה עצמה מחייבת אישור מפורש במסך.
    return {
      ...result,
      suggestedEmail: recipient.email,
      suggestedEmailName: chosenContact?.fullName || recipient.name,
    };
  }

  /**
   * POST /caspit/email/task/:taskId
   * שולח ללקוח מסמך שכבר הונפק — **רק** אחרי אישור המשתמש במסך.
   * kind קובע איזה מסמך: 'invoice' → crm-quote-<id>, 'receipt' → crm-receipt-<id>.
   */
  @Post('email/task/:taskId')
  @Roles('ADMIN', 'MANAGER', 'BILLING', 'SALES')
  async emailForTask(
    @Param('taskId') taskId: string,
    @Body() body: { kind?: CaspitDocKind; to?: string },
  ) {
    // הקידומת של DocumentId שונה לכל סוג מסמך — בלי הסוג הנכון היינו שולחים
    // ללקוח מסמך אחר (או נכשלים) אחרי הנפקת חשבונית עסקה / חשבונית מס קבלה.
    const kind: CaspitDocKind = body?.kind && CASPIT_DOC_KINDS[body.kind] ? body.kind : 'invoice';
    const spec = CASPIT_DOC_KINDS[kind];
    const quote: any = await this.prisma.quote.findFirst({
      where: { linkedEntityId: taskId } as any,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, customerContact: true },
    });
    if (!quote) throw new BadRequestException('לא נמצאה הצעת מחיר מקושרת למשימה');

    const recipient = await this.resolveReceiptRecipient(quote, quote.customer || {}, body?.to);
    if (!recipient.email) {
      throw new BadRequestException('אין כתובת מייל לאיש הקשר — הוסיפו כתובת בכרטיס הלקוח');
    }
    return this.caspit.sendDocumentEmail({
      documentId: `${spec.idPrefix}${quote.id}`,
      to: recipient.email,
      toName: recipient.name,
      label: spec.label,
      amount: Number(quote.totalAmount ?? 0) || null,
    });
  }

  /**
   * לאן נשלחת הקבלה. סדר עדיפות: כתובת מפורשת מהבקשה → איש הקשר שנבחר בהצעה →
   * איש הקשר הראשי של הלקוח → המייל הכללי של הלקוח. מחזיר email=null אם אין אף
   * כתובת תקינה — אז הקבלה עדיין מונפקת, פשוט בלי שליחה.
   */
  private async resolveReceiptRecipient(
    quote: any,
    cust: any,
    explicit?: string,
  ): Promise<{ email: string | null; name: string | null }> {
    const valid = (v: any) => {
      const s = String(v ?? '').trim();
      return s.includes('@') ? s : null;
    };

    const fromRequest = valid(explicit);
    if (fromRequest) return { email: fromRequest, name: null };

    const onQuote = valid(quote?.customerContact?.email);
    if (onQuote) return { email: onQuote, name: quote.customerContact?.fullName || null };

    if (cust?.id) {
      const primary: any = await this.prisma.customerContact
        .findFirst({
          where: { customerId: cust.id, email: { not: '' } },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: { email: true, fullName: true },
        })
        .catch(() => null);
      const fromContact = valid(primary?.email);
      if (fromContact) return { email: fromContact, name: primary?.fullName || null };
    }

    const onCustomer = valid(cust?.email);
    if (onCustomer) return { email: onCustomer, name: cust?.contactName || null };

    return { email: null, name: null };
  }

  /** ליבה משותפת: בונה שורות מהצעה ומנפיק חשבונית בכספית. */
  private async issueInvoiceFromQuote(
    quote: any,
    comments: string,
    kind: 'proforma' | 'invoice' | 'invoiceReceipt' = 'invoice',
    payment?: { amount?: number; paymentTypeId?: number },
    /** תנאי התשלום שנבחרו במסך; ריק → נופלים לתנאים שעל ההצעה. */
    paymentTerms?: string | null,
    /** איש הקשר שנבחר בדיאלוג; ריק → איש הקשר שעל ההצעה. */
    contactId?: string | null,
  ) {
    const quoteId = quote.id;
    const spec = CASPIT_DOC_KINDS[kind];
    const chosenContact = await this.loadChosenContact(quote, contactId);

    // ── בניית שורות החשבונית מפריטי ההצעה ──
    const rawItems: any[] = Array.isArray(quote.lineItemsJson) ? quote.lineItemsJson : [];
    const lines = rawItems
      .map((it) => {
        const name = String(it?.description ?? it?.name ?? it?.productDescription ?? 'שירות').trim();
        const qty = Number(it?.qty ?? it?.quantity ?? 1) || 1;
        const price = Number(it?.price ?? it?.unitPrice ?? 0) || 0;
        const discPct = Number(it?.discountPct ?? it?.lineDiscountPercent ?? 0) || 0;
        // הנחת-שורה מוחלת על מחיר היחידה (כספית מקבל UnitPrice סופי לשורה).
        const effPrice = discPct > 0 ? Math.round(price * (1 - discPct / 100) * 100) / 100 : price;
        return { name, details: it?.sku ? `מק״ט ${it.sku}` : '', unitPrice: effPrice, qty, chargeVat: true };
      })
      .filter((l) => l.name && (l.unitPrice > 0 || l.qty > 0));

    if (lines.length === 0) {
      // נפילה חזרה: שורה אחת עם הסכום הכולל של ההצעה (לפני מע״מ), אם אין פריטים.
      const before = Number(quote.amountBeforeVat ?? quote.totalAmount ?? 0) || 0;
      if (before <= 0) throw new BadRequestException(`אין פריטים או סכום להנפקת ${spec.label}`);
      lines.push({ name: `הצעת מחיר ${quote.quoteNumber || ''}`.trim(), details: '', unitPrice: before, qty: 1, chargeVat: true });
    }

    const cust = quote.customer || {};
    // מזהה נפרד לכל סוג מסמך — אחרת "חשבונית עסקה" ו"חשבונית מס" על אותה הצעה
    // היו מתנגשות באותו DocumentId, וכספית הייתה מסרבת לשנייה.
    const documentId = `${spec.idPrefix}${quoteId}`;
    // חשבונית מס קבלה כוללת את התקבול; ברירת מחדל = סכום ההצעה כולל מע"מ.
    const paidAmount = spec.hasPayment
      ? Number(payment?.amount ?? quote.totalAmount ?? 0) || 0
      : 0;
    const result = await this.caspit.createInvoice({
      documentId,
      ...(spec.hasPayment
        ? { payment: { amount: paidAmount, paymentTypeId: payment?.paymentTypeId } }
        : {}),
      customer: {
        // ממנו נגזר ContactId בכספית — בלעדיו החשבונית לא מתקשרת לכרטיס לקוח.
        id: quote.customerId || cust.id || null,
        businessName: quote.customerName || cust.name || 'לקוח',
        osekMorshe: cust.companyRegNumber || null,
        // איש הקשר שנבחר בדיאלוג גובר — הוא זה שהמסמך מופנה אליו.
        contactName: chosenContact?.fullName || cust.contactName || null,
        address1: cust.address || null,
        city: cust.city || null,
        email: chosenContact?.email || cust.email || null,
        phone: chosenContact?.phone || chosenContact?.mobile || cust.phone || null,
      },
      lines,
      comments: comments || '',
      // תנאי התשלום שנבחרו במסך הגבייה גוברים על אלה שעל ההצעה (המשתמש רואה
      // אותם ומאשר בזמן ההנפקה). לא זוהו → null, כלומר בלי תאריך יעד.
      // מסמך שנושא תקבול ("חשבונית מס קבלה") מתעד כסף שכבר התקבל — אין לו מועד
      // תשלום עתידי, ולכן לעולם לא נשלח לו תאריך יעד גם אם נשלחו תנאי תשלום.
      dueDate: spec.hasPayment ? null : computeDueDate(paymentTerms ?? quote.paymentTerms).dueDate,
    }, kind);

    // ── שמירת מספר החשבונית על ההצעה (best-effort) ──
    // רק למסמכי מס אמיתיים: "חשבונית עסקה" היא דרישת תשלום ואינה מספר חשבונית.
    if (kind !== 'proforma') {
      try {
        await (this.prisma.quote.update as any)({
          where: { id: quoteId },
          data: { accountingNumber: result.number || undefined },
        });
      } catch {
        /* עמודה עשויה שלא להתקיים — לא מפילים את ההנפקה */
      }
    }

    // נמען מוצע לשליחה במייל. הצעה בלבד — לא נשלח כלום עד אישור מפורש.
    // המייל של איש הקשר שנבחר גובר על סדר העדיפות הרגיל.
    const recipient = await this.resolveReceiptRecipient(quote, cust, chosenContact?.email || undefined);
    return {
      ...result,
      suggestedEmail: recipient.email,
      suggestedEmailName: chosenContact?.fullName || recipient.name,
    };
  }

  /** איש הקשר שנבחר בדיאלוג; נופל לאיש הקשר שעל ההצעה כשלא נבחר. */
  private async loadChosenContact(
    quote: any,
    contactId?: string | null,
  ): Promise<{ fullName: string; email: string; phone: string; mobile: string } | null> {
    const id = String(contactId || '').trim() || quote?.customerContactId || null;
    if (!id) return null;
    const c: any = await this.prisma.customerContact
      .findFirst({
        // מאומת מול הלקוח של ההצעה — שלא ניתן יהיה להפנות מסמך לאיש קשר של לקוח אחר.
        where: { id, customerId: quote?.customerId ?? undefined },
        select: { fullName: true, email: true, phone: true, mobile: true },
      })
      .catch(() => null);
    return c || null;
  }
}
