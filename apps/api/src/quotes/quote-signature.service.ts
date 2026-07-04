import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFArray } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { PrismaService } from '../prisma/prisma.service';
import { PdfConvertService } from './pdf-convert.service';
import { GraphMailService } from '../microsoft/graph-mail.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { HEBREW_FONT_BASE64 } from './hebrew-font';

const HEBREW_FONT_BYTES = Buffer.from(HEBREW_FONT_BASE64, 'base64');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * סימן מיקום החתימה בתבנית ה-Word. מקמו את הטקסט `SIGNATUREHERE` בתבנית במקום שבו
 * החתימה תיצרב (מומלץ בצבע לבן/קטן כדי שלא ייראה). המערכת מאתרת אותו ב-PDF, מסתירה אותו,
 * וצורבת את בלוק החתימה במרכזו. אם לא נמצא — נפילה-חזרה לתחתית-ימין של העמוד האחרון.
 */
const SIGN_MARKER = 'SIGNATUREHERE';

/** פרטי החותם שנאספים בעמוד החתימה (לפי סיווג הלקוח). */
interface SignerInfo {
  fullName?: string;
  idNumber?: string;
  companyName?: string;
  role?: string;
}

/** מבנה השדה digitalCertificateMeta (Json) של ההצעה בזמן תהליך החתימה. */
interface SignatureMeta {
  /** סוד אקראי לא-ניתן-לניחוש — הבסיס לקישור הציבורי (capability URL). */
  secret: string;
  /** ה-PDF המקורי (ללא חתימה) — מאוחסן base64 לתצוגה בעמוד החתימה. */
  unsignedPdfBase64?: string;
  /** ה-PDF החתום (אחרי שהלקוח חתם). */
  signedPdfBase64?: string;
  fileName: string;
  requestedById?: string | null;
  signedAt?: string;
  /** פרטי החותם (שם/ת.ז/חברה/תפקיד) — נשמרים לתיעוד. */
  signer?: SignerInfo;
  /** מיקום סימן החתימה שנמצא ב-PDF (אם הוטמע בתבנית) — לצריבה במקום הנכון. */
  marker?: SignMarker | null;
  /** מלבן כפתור "לחץ לחתום" בעמוד האחרון [x1,y1,x2,y2] — כדי לכסות אותו בלבן במסמך החתום. */
  signButtonRect?: number[];
}

/** מיקום הסימן ב-PDF: עמוד (0-based) + קואורדינטות pdf-lib (מקור בתחתית-שמאל). */
interface SignMarker {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * חתימה דיגיטלית על הצעת מחיר ע"י הלקוח — דרך קישור ציבורי (ללא התחברות).
 * השרת ממיר את ההצעה ל-PDF, שומר אותו עם סוד אקראי, ומציג ללקוח עמוד חתימה.
 * הלקוח מצייר חתימה באצבע, השרת צורב אותה על ה-PDF ושומר כ-"הצעת מחיר חתומה".
 */
@Injectable()
export class QuoteSignatureService {
  private readonly logger = new Logger(QuoteSignatureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfConvert: PdfConvertService,
    private readonly graphMail: GraphMailService,
    private readonly msAuth: MicrosoftAuthService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // צד מנהל: יצירת בקשת חתימה
  // ─────────────────────────────────────────────────────────────

  /**
   * מכין הצעה לחתימה: ממיר ל-PDF, מייצר סוד וטוקן, ומסמן digitalSignatureStatus=REQUESTED.
   * מחזיר את הטוקן (הקישור עצמו נבנה בצד הלקוח מ-window.location.origin) + פרטי הלקוח.
   */
  async requestSignature(quoteId: string, userId?: string, opts?: { markRequested?: boolean; webOrigin?: string }) {
    const quote: any = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        quoteDocuments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!quote) throw new NotFoundException('הצעת מחיר לא נמצאה');
    if (!quote.customerId) throw new BadRequestException('להצעה אין לקוח משויך — לא ניתן לשלוח לחתימה');

    const { content, fileName, isPdf } = this.resolveQuoteDoc(quote);

    // המרה ל-PDF (אם זה DOCX). דורש Outlook מחובר (Graph) או CloudConvert.
    let pdfBuffer = content;
    if (!isPdf) {
      try {
        pdfBuffer = await this.pdfConvert.docxToPdf(content, fileName, userId);
      } catch (e: any) {
        this.logger.warn(`docxToPdf failed for quote ${quoteId}: ${e?.message || e}`);
        throw new BadRequestException(
          'המרת ההצעה ל-PDF נכשלה — חבר חשבון Outlook (מומלץ) או הגדר המרת PDF, ונסה שוב',
        );
      }
    }

    // איתור סימן מיקום החתימה בתבנית (SIGNATUREHERE). אם נמצא — נצרוב שם; אחרת בתחתית-ימין.
    const marker = await this.findMarkerInPdf(pdfBuffer);
    // מסתירים את הסימן כבר בתצוגה המקדימה (כדי שהלקוח לא יראה "SIGNATUREHERE").
    if (marker) {
      pdfBuffer = await this.coverMarker(pdfBuffer, marker);
    }

    const secret = randomUUID().replace(/-/g, '');
    const token = `${quoteId}~${secret}`;
    const baseName = fileName.replace(/\.(docx|pdf)$/i, '');

    // ── כפתור "לחץ לחתום" מוטמע בעמוד האחרון של ה-PDF ──
    // רק במצב חתימה (markRequested !== false) וכשידוע ה-origin של האתר. הלקוח פותח את ה-PDF,
    // גולל לעמוד האחרון, לוחץ על הכפתור — ומגיע לטופס החתימה (/sign) שבו הוא ממלא שם/ת"ז/חתימה.
    let signButtonRect: number[] | undefined;
    if (opts?.markRequested !== false && opts?.webOrigin) {
      try {
        const signFormUrl = `${opts.webOrigin.replace(/\/+$/, '')}/sign/${token}#sign-form`;
        const stamped = await this.stampSignButton(pdfBuffer, signFormUrl);
        pdfBuffer = stamped.pdf;
        signButtonRect = stamped.rect;
      } catch (e: any) {
        this.logger.warn(`stampSignButton failed for quote ${quoteId}: ${e?.message || e}`);
      }
    }

    const meta: SignatureMeta = {
      secret,
      unsignedPdfBase64: pdfBuffer.toString('base64'),
      fileName: `${baseName}.pdf`,
      requestedById: userId ?? null,
      marker,
      signButtonRect,
    };

    // markRequested=false — רק שומרים את ה-PDF/טוקן (כדי ש-/public/sign/:token/pdf יגיש את
    // ה-PDF), בלי לשנות את סטטוס החתימה. משמש להורדת PDF (למשל "שלח בווצאפ" הפשוט).
    const updateData: any = { digitalCertificateMeta: meta as any };
    if (opts?.markRequested !== false) {
      updateData.digitalSignatureStatus = 'REQUESTED';
      updateData.signatureRequestedAt = new Date();
      updateData.signedAt = null;
      updateData.signedPdfPath = null;
    }
    await this.prisma.quote.update({ where: { id: quoteId }, data: updateData });

    return {
      token,
      quoteNumber: quote.quoteNumber || quote.importLegacyId || '',
      customerName: quote.customer?.name || '',
      customerEmail: quote.customer?.email || '',
      customerPhone: quote.customer?.phone || '',
      // מיידע את המנהל היכן תיצרב החתימה: 'marker' = במקום שסומן בתבנית; 'default' = תחתית-ימין.
      signaturePlacement: marker ? 'marker' : 'default',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // צד לקוח (ציבורי): טעינה + חתימה
  // ─────────────────────────────────────────────────────────────

  /** מטא-דאטה לעמוד החתימה הציבורי. */
  async getForSigning(token: string) {
    const { quote, meta } = await this.loadByToken(token);
    // סיווג הלקוח קובע אילו שדות מוצגים בעמוד החתימה.
    const isPrivate = (quote.customer?.type || '').toUpperCase() === 'PRIVATE';
    const customerType: 'PRIVATE' | 'BUSINESS' = isPrivate ? 'PRIVATE' : 'BUSINESS';
    return {
      quoteNumber: quote.quoteNumber || quote.importLegacyId || '',
      customerName: quote.customer?.name || '',
      companyName: 'גלית – החברה לאיכות הסביבה',
      customerType,
      // ערכי ברירת-מחדל למילוי-מראש: בפרטי שם הלקוח = שם החותם; בעסקי = שם החברה.
      prefillFullName: isPrivate ? (quote.customer?.name || '') : '',
      prefillCompanyName: isPrivate ? '' : (quote.customer?.name || ''),
      status: quote.digitalSignatureStatus,
      alreadySigned: quote.digitalSignatureStatus === 'SIGNED',
      signedAt: meta.signedAt || null,
    };
  }

  /** ה-PDF להצגה בעמוד החתימה (החתום אם כבר נחתם, אחרת המקורי). */
  async getPdf(token: string): Promise<{ buffer: Buffer; fileName: string }> {
    const { meta } = await this.loadByToken(token);
    const b64 = meta.signedPdfBase64 || meta.unsignedPdfBase64;
    if (!b64) throw new NotFoundException('המסמך אינו זמין');
    return { buffer: Buffer.from(b64, 'base64'), fileName: meta.fileName };
  }

  /**
   * הלקוח שלח את "בלוק החתימה" (תמונת PNG שכוללת את פרטי החותם + החתימה, נבנית בדפדפן
   * כדי לתמוך בעברית) + פרטי החותם המובנים לתיעוד. צורבים את התמונה על ה-PDF ושומרים.
   */
  async submitSignature(token: string, signatureDataUrl: string, signer?: SignerInfo) {
    const { quote, meta } = await this.loadByToken(token);
    if (quote.digitalSignatureStatus === 'SIGNED') {
      throw new BadRequestException('ההצעה כבר נחתמה');
    }
    if (!meta.unsignedPdfBase64) throw new BadRequestException('המסמך לחתימה אינו זמין');

    const sigBytes = this.dataUrlToBuffer(signatureDataUrl);
    if (!sigBytes) throw new BadRequestException('חתימה לא תקינה');

    const cleanSigner = this.sanitizeSigner(signer);

    const signedPdf = await this.stampSignature(
      Buffer.from(meta.unsignedPdfBase64, 'base64'),
      sigBytes,
      meta.marker || undefined,
      meta.signButtonRect || undefined,
    );
    const signedAt = new Date();

    // שמירת ה-PDF החתום כ-"הצעת מחיר חתומה" של הלקוח — יופיע אוטומטית בסקשן הקיים.
    await this.prisma.document.create({
      data: {
        id: randomUUID(),
        customerId: quote.customerId,
        name: `הצעת מחיר${quote.quoteNumber ? ' ' + quote.quoteNumber : ''} - חתומה דיגיטלית.pdf`,
        filePath: 'signature:digital',
        documentType: 'SIGNED_QUOTE',
        mimeType: 'application/pdf',
        sizeBytes: signedPdf.length,
        dataBase64: signedPdf.toString('base64'),
        documentDate: signedAt,
        uploadedById: meta.requestedById || null,
      },
    });

    const nextMeta: SignatureMeta = {
      ...meta,
      signedPdfBase64: signedPdf.toString('base64'),
      unsignedPdfBase64: undefined, // שחרור מקום — שומרים רק את החתום
      signedAt: signedAt.toISOString(),
      signer: cleanSigner,
    };
    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        digitalSignatureStatus: 'SIGNED',
        signedAt,
        signedPdfPath: 'signature:digital',
        digitalCertificateMeta: nextMeta as any,
      },
    });

    // שליחת ההצעה החתומה חזרה לאיש המכירות ששלח לחתימה (Outlook שלו).
    // best-effort — לעולם לא מפיל את החתימה (היא כבר נשמרה בכרטיס הלקוח).
    await this.notifySignedToRequester(quote, meta, signedPdf, cleanSigner, signedAt);

    return { success: true as const };
  }

  /**
   * מודיע לאיש המכירות ששלח לחתימה (meta.requestedById) שההצעה נחתמה, ומצרף את
   * ה-PDF החתום. נשלח מתיבת ה-Outlook שלו אל עצמו. best-effort: כל כשל (לא מחובר
   * ל-Outlook / אין מייל / Graph נכשל) נרשם בלוג בלבד ולא משפיע על תהליך החתימה.
   */
  private async notifySignedToRequester(
    quote: any,
    meta: SignatureMeta,
    signedPdf: Buffer,
    signer: SignerInfo,
    signedAt: Date,
  ): Promise<void> {
    const requesterId = meta.requestedById;
    if (!requesterId) {
      this.logger.log('signed: no requestedById — skipping back-to-sender email');
      return;
    }
    try {
      const connected = (await this.msAuth.getStatus(requesterId)).connected;
      if (!connected) {
        this.logger.warn(`signed: requester ${requesterId} not connected to Outlook — skipping notify`);
        return;
      }
      const user = await this.prisma.user.findUnique({
        where: { id: requesterId },
        select: { email: true, name: true },
      });
      if (!user?.email) {
        this.logger.warn(`signed: requester ${requesterId} has no email — skipping notify`);
        return;
      }

      const quoteNumber = quote.quoteNumber || quote.importLegacyId || '';
      const customerName = quote.customer?.name || '';
      const p2 = (v: number) => String(v).padStart(2, '0');
      const when = `${p2(signedAt.getDate())}/${p2(signedAt.getMonth() + 1)}/${signedAt.getFullYear()} ${p2(signedAt.getHours())}:${p2(signedAt.getMinutes())}`;
      const esc = (s: string) =>
        String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const rows: [string, string][] = [
        ['הצעה', quoteNumber],
        ['לקוח', customerName],
        ['חתם/ה', signer.fullName || ''],
      ];
      if (signer.companyName) rows.push(['חברה', signer.companyName]);
      if (signer.role) rows.push(['תפקיד', signer.role]);
      if (signer.idNumber) rows.push(['ת.ז', signer.idNumber]);
      rows.push(['נחתם בתאריך', when]);

      const rowsHtml = rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:3px 14px 3px 0;color:#64748b;">${esc(k)}</td><td style="padding:3px 0;font-weight:600;color:#0f172a;">${esc(v || '—')}</td></tr>`,
        )
        .join('');

      const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6;">
<p style="font-size:16px;font-weight:700;color:#16a34a;">✔ הצעת מחיר${quoteNumber ? ' ' + esc(quoteNumber) : ''} נחתמה דיגיטלית על ידי הלקוח</p>
<table style="border-collapse:collapse;margin:8px 0 14px;">${rowsHtml}</table>
<p>ההצעה החתומה מצורפת למייל זה, ונשמרה אוטומטית בכרטיס הלקוח (סקשן "הצעת מחיר חתומה").</p>
<p style="color:#64748b;">גלית – החברה לאיכות הסביבה</p>
</div>`;

      const fileName = `הצעת מחיר${quoteNumber ? ' ' + quoteNumber : ''} - חתומה.pdf`;
      await this.graphMail.sendMailAsUser(requesterId, {
        to: user.email,
        subject: `✔ הצעה${quoteNumber ? ' ' + quoteNumber : ''} נחתמה${customerName ? ' — ' + customerName : ''}`,
        html,
        attachments: [{ name: fileName, contentType: 'application/pdf', content: signedPdf }],
      });
      this.logger.log(`signed quote ${quote.id} emailed back to requester ${user.email}`);
    } catch (e: any) {
      this.logger.warn(`notifySignedToRequester failed: ${e?.message || e}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // עזרים פנימיים
  // ─────────────────────────────────────────────────────────────

  /** מפענח טוקן `<quoteId>~<secret>`, טוען את ההצעה ומאמת את הסוד. */
  private async loadByToken(token: string): Promise<{ quote: any; meta: SignatureMeta }> {
    const sep = (token || '').indexOf('~');
    if (sep <= 0) throw new NotFoundException('קישור לא תקין');
    const quoteId = token.slice(0, sep);
    const secret = token.slice(sep + 1);

    const quote: any = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { customer: { select: { id: true, name: true, email: true, phone: true, type: true } } },
    });
    const meta = (quote?.digitalCertificateMeta as SignatureMeta | null) || null;
    if (!quote || !meta?.secret || meta.secret !== secret) {
      throw new NotFoundException('קישור החתימה אינו תקף או שפג תוקפו');
    }
    return { quote, meta };
  }

  /** בוחר את מסמך ההצעה (DB bytes → disk) ומחזיר buffer + שם + האם כבר PDF. */
  private resolveQuoteDoc(quote: any): { content: Buffer; fileName: string; isPdf: boolean } {
    const latest = quote.quoteDocuments?.[0];
    if (latest?.data) {
      const fileName = latest.fileName || 'הצעת מחיר.docx';
      return { content: Buffer.from(latest.data), fileName, isPdf: /\.pdf$/i.test(fileName) || latest.mimeType === 'application/pdf' };
    }
    const relPath = latest?.filePath || quote.lastMergedDocPath;
    if (relPath) {
      const abs = path.resolve(process.cwd(), relPath);
      if (fs.existsSync(abs)) {
        const fileName = path.basename(relPath);
        return { content: fs.readFileSync(abs), fileName, isPdf: /\.pdf$/i.test(fileName) };
      }
    }
    throw new BadRequestException('אין מסמך ממוזג להצעה זו — יש לבצע מיזוג קודם');
  }

  /** מנקה/מקצר את פרטי החותם שמגיעים מהלקוח (הגנה בסיסית). */
  private sanitizeSigner(signer?: SignerInfo): SignerInfo {
    const clip = (v?: string) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');
    return {
      fullName: clip(signer?.fullName),
      idNumber: clip(signer?.idNumber),
      companyName: clip(signer?.companyName),
      role: clip(signer?.role),
    };
  }

  /** ממיר PNG/JPEG data-URL ל-Buffer (מגביל גודל סביר). */
  private dataUrlToBuffer(dataUrl: string): Buffer | null {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!m) return null;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null;
    return buf;
  }

  /**
   * מאתר את סימן מיקום החתימה (SIGNATUREHERE) ב-PDF ומחזיר את מיקומו בקואורדינטות pdf-lib
   * (מקור בתחתית-שמאל — זהה ל-pdfjs transform[4]/[5], אומת אמפירית). null אם לא נמצא/נכשל.
   * מבודד ב-try/catch כך שכשל ב-pdfjs לעולם לא שובר את החתימה (נפילה-חזרה לברירת מחדל).
   */
  private async findMarkerInPdf(pdf: Buffer): Promise<SignMarker | null> {
    try {
      // טעינה עצלה של pdfjs (legacy CJS — תואם Node 20 בפרודקשן; v4 דורש Node 22+).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
      } catch { /* fake worker on main thread — extraction still works */ }

      const target = SIGN_MARKER.replace(/\s/g, '').toUpperCase();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;

      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items = (content.items as any[]).filter((it) => typeof it.str === 'string' && it.transform);

        // 1) התאמה בפריט בודד (המקרה הנפוץ — ריצת טקסט אחת).
        for (const it of items) {
          if (it.str.replace(/\s/g, '').toUpperCase().includes(target)) {
            return { pageIndex: p - 1, x: it.transform[4], y: it.transform[5], width: it.width || 60, height: it.height || it.transform[3] || 12 };
          }
        }
        // 2) נפילה-חזרה: הסימן פוצל לכמה פריטים — משרשרים ומאתרים את הפריט בתחילת ההתאמה.
        let concat = '';
        const map: { start: number; it: any }[] = [];
        for (const it of items) { map.push({ start: concat.length, it }); concat += it.str.replace(/\s/g, ''); }
        const at = concat.toUpperCase().indexOf(target);
        if (at >= 0) {
          let chosen = map[0]?.it;
          for (const e of map) { if (e.start <= at) chosen = e.it; else break; }
          if (chosen) return { pageIndex: p - 1, x: chosen.transform[4], y: chosen.transform[5], width: chosen.width || 60, height: chosen.height || chosen.transform[3] || 12 };
        }
      }
      return null;
    } catch (e: any) {
      this.logger.warn(`findMarkerInPdf failed (using default placement): ${e?.message || e}`);
      return null;
    }
  }

  /** מצייר ריבוע לבן מעל הסימן כדי להסתירו (לתצוגה מקדימה ולגיבוי בזמן הצריבה). */
  private async coverMarker(pdf: Buffer, marker: SignMarker): Promise<Buffer> {
    try {
      const pdfDoc = await PDFDocument.load(pdf);
      const pages = pdfDoc.getPages();
      const page = pages[marker.pageIndex];
      if (!page) return pdf;
      page.drawRectangle({
        x: marker.x - 2,
        y: marker.y - 3,
        width: (marker.width || 60) + 4,
        height: (marker.height || 12) + 6,
        color: rgb(1, 1, 1),
      });
      return Buffer.from(await pdfDoc.save());
    } catch {
      return pdf;
    }
  }

  /**
   * צורב את "בלוק החתימה" (תמונה שכוללת את פרטי החותם + החתימה) ל-PDF.
   * אם נמצא סימן בתבנית — מסתיר אותו וצורב את הבלוק במרכזו; אחרת בתחתית-ימין של העמוד האחרון.
   * הבלוק נבנה בדפדפן (עברית) ולכן אין צורך בגופן עברי בשרת.
   */
  /** הופך מחרוזת עברית לתצוגה נכונה ב-pdf-lib (שמצייר LTR ואינו עושה סידור bidi). */
  private reverseForRtl(s: string): string {
    return Array.from(s).reverse().join('');
  }

  /**
   * צורב כפתור לחיץ "לחץ כאן לחתימה" בתחתית-מרכז העמוד האחרון של ה-PDF, עם קישור (URI) לטופס
   * החתימה. הטקסט העברי מוטמע דרך NotoSansHebrew (pdf-lib לא תומך עברית בגופנים המובנים).
   * מחזיר את ה-PDF החדש ואת מלבן הכפתור (לכיסוי במסמך החתום).
   */
  private async stampSignButton(pdf: Buffer, url: string): Promise<{ pdf: Buffer; rect: number[] }> {
    const doc = await PDFDocument.load(pdf);
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(HEBREW_FONT_BYTES, { subset: true });
    const pages = doc.getPages();
    const page = pages[pages.length - 1];
    const { width } = page.getSize();

    const label = this.reverseForRtl('לחץ כאן לחתימה');
    const fontSize = 18;
    const padX = 30;
    const padY = 14;
    const textW = font.widthOfTextAtSize(label, fontSize);
    const textH = font.heightAtSize(fontSize);
    const bw = textW + padX * 2;
    const bh = textH + padY * 2;
    const bx = (width - bw) / 2;
    const by = 46; // מעל תחתית העמוד

    // רקע ירוק (צבע גלית) + טקסט לבן ממורכז.
    page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: rgb(0.184, 0.361, 0.196) });
    page.drawText(label, { x: bx + padX, y: by + padY, size: fontSize, font, color: rgb(1, 1, 1) });

    // אנוטציית קישור לחיצה מעל הכפתור.
    const rect = [bx, by, bx + bw, by + bh];
    const linkDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rect,
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    const linkRef = doc.context.register(linkDict);
    const existing = page.node.Annots();
    if (existing instanceof PDFArray) {
      existing.push(linkRef);
    } else {
      page.node.set(PDFName.of('Annots'), doc.context.obj([linkRef]));
    }

    const out = await doc.save();
    return { pdf: Buffer.from(out), rect };
  }

  private async stampSignature(pdf: Buffer, sigPng: Buffer, marker?: SignMarker, coverRect?: number[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdf);
    const png = await pdfDoc.embedPng(sigPng);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const ratio = png.width / png.height || 1.4; // width / height

    // כיסוי כפתור "לחץ לחתום" (שהוטמע בעמוד האחרון) בלבן — כדי שלא יופיע במסמך החתום הסופי.
    if (coverRect && coverRect.length === 4) {
      const last = pages[pages.length - 1];
      const [x1, y1, x2, y2] = coverRect;
      last.drawRectangle({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, color: rgb(1, 1, 1) });
    }

    // ── מצב סימן-בתבנית: צריבה במקום שסומן ──
    if (marker && pages[marker.pageIndex]) {
      const page = pages[marker.pageIndex];
      const { width: pw, height: ph } = page.getSize();
      // בלוק גדול יותר (לבקשת המשתמש). הגודל לפי הרוחב, עם תקרת גובה.
      let drawW = 340;
      let drawH = drawW / ratio;
      const maxH = 320;
      if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }

      // הסתרת הסימן עצמו (ריבוע לבן מעל הטקסט).
      page.drawRectangle({
        x: marker.x - 2,
        y: marker.y - 3,
        width: (marker.width || 60) + 4,
        height: (marker.height || 12) + 6,
        color: rgb(1, 1, 1),
      });

      // ממורכז אופקית על הסימן, ונצרב *מתחת* לסימן (יורד למטה) עם מרווח —
      // כך הבלוק לא מטפס כלפי מעלה ולא עולה על ה-Header של העמוד.
      const gap = 20;
      const cx = marker.x + (marker.width || 0) / 2;
      let x = cx - drawW / 2;
      let y = marker.y - gap - drawH; // הקצה העליון של הבלוק מתחת לסימן
      x = Math.max(18, Math.min(x, pw - drawW - 18));
      y = Math.max(18, Math.min(y, ph - drawH - 18));
      page.drawImage(png, { x, y, width: drawW, height: drawH });

      const out = await pdfDoc.save();
      return Buffer.from(out);
    }

    // ── ברירת מחדל: תחתית-ימין של העמוד האחרון ──
    const page = pages[pages.length - 1];
    const { width } = page.getSize();
    const maxW = 260;
    const maxH = 210;
    let drawW = maxW;
    let drawH = drawW / ratio;
    if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
    const x = width - drawW - 40;
    const y = 40;
    page.drawImage(png, { x, y, width: drawW, height: drawH });

    // חותמת זמן (שרת) מתחת לבלוק — אנגלית בלבד (Helvetica לא תומך עברית).
    const now = new Date();
    const p2 = (v: number) => String(v).padStart(2, '0');
    page.drawText(`Signed via e-signature  ${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`, {
      x,
      y: y - 11,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });

    const out = await pdfDoc.save();
    return Buffer.from(out);
  }
}
