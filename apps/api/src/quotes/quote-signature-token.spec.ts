import { NotFoundException } from '@nestjs/common';
import { QuoteSignatureService } from './quote-signature.service';

/**
 * תוקף קישור החתימה — הנקודה שבה קישורים מתו בשקט.
 *
 * הרקע: התוקף נשען על שדה JSON יחיד ומשתנה (`digitalCertificateMeta.secret`).
 * כתיבה שהחליפה את ה-blob בלי לגרור את הסוד הישן קדימה הרגה כל קישור שכבר היה
 * ביד הלקוח, וזה התגלה רק כשלקוח התלונן (הצעה 18507, 17.08.2026).
 *
 * התיקון העביר את התוקף לטבלה שרק מוסיפים לה (`QuoteSignatureToken`). הבדיקות
 * כאן נועלות בדיוק את ההתנהגות הזו: קישור חייב להמשיך לעבוד גם כשה-blob כבר
 * לא מכיר אותו, וקישור שלא הונפק מעולם חייב להידחות.
 */
describe('QuoteSignatureService — תוקף קישור חתימה', () => {
  const QUOTE_ID = '1510b2c9-0dc8-4cbd-a194-af1122edb604';
  const LIVE_SECRET = '332d1ce38ae64970aa0a1e73c51a0e2d';
  const OLD_SECRET = '6fd2c76dcd1940759f0524f6c5faa404';

  /** בונה שירות עם prisma מזויף בלבד — loadByToken לא נוגע בשאר התלויות. */
  function makeService(opts: {
    /** מה ה-blob מכיר. null = אין meta כלל. */
    metaSecrets: { secret: string; previousSecrets?: string[] } | null;
    /** אילו סודות רשומים בטבלת ה-append-only. */
    issuedSecrets?: Array<{ secret: string; revokedAt?: Date | null }>;
    quoteExists?: boolean;
  }) {
    const issued = opts.issuedSecrets ?? [];
    const updates: any[] = [];
    const created: any[] = [];

    const prisma: any = {
      quote: {
        findUnique: jest.fn().mockResolvedValue(
          opts.quoteExists === false
            ? null
            : {
                id: QUOTE_ID,
                digitalSignatureStatus: 'REQUESTED',
                digitalCertificateMeta: opts.metaSecrets
                  ? { fileName: 'q.pdf', unsignedPdfBase64: 'AAA', ...opts.metaSecrets }
                  : null,
              },
        ),
        update: jest.fn().mockImplementation((args: any) => {
          updates.push(args);
          return Promise.resolve({});
        }),
      },
      quoteSignatureToken: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          const hit = issued.find(
            (t) => t.secret === where.secret && !t.revokedAt,
          );
          return Promise.resolve(hit ? { id: 'tok-1' } : null);
        }),
        createMany: jest.fn().mockImplementation((args: any) => {
          created.push(...args.data);
          return Promise.resolve({ count: args.data.length });
        }),
      },
    };

    const svc = new QuoteSignatureService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { svc, prisma, updates, created };
  }

  /** loadByToken פרטי — נקרא דרך גישה מפורשת, כדי לבדוק את הכלל עצמו. */
  const load = (svc: QuoteSignatureService, token: string) =>
    (svc as any).loadByToken(token);

  // ── המסלול הרגיל ──────────────────────────────────────────────────────

  it('מקבל את הסוד הנוכחי מה-blob, בלי לגעת בטבלה', async () => {
    const { svc, prisma } = makeService({ metaSecrets: { secret: LIVE_SECRET } });

    const { quote } = await load(svc, `${QUOTE_ID}~${LIVE_SECRET}`);

    expect(quote.id).toBe(QUOTE_ID);
    // המסלול המהיר לא משלם על שאילתה נוספת.
    expect(prisma.quoteSignatureToken.findFirst).not.toHaveBeenCalled();
  });

  it('מקבל סוד שנשמר ב-previousSecrets', async () => {
    const { svc, prisma } = makeService({
      metaSecrets: { secret: LIVE_SECRET, previousSecrets: [OLD_SECRET] },
    });

    await expect(load(svc, `${QUOTE_ID}~${OLD_SECRET}`)).resolves.toBeTruthy();
    expect(prisma.quoteSignatureToken.findFirst).not.toHaveBeenCalled();
  });

  // ── הרגרסיה עצמה ──────────────────────────────────────────────────────

  it('מקבל סוד שנדרס מה-blob אבל רשום בטבלה — זה התרחיש שהרג את הצעה 18507', async () => {
    // בדיוק המצב שנמצא בפרודקשן: ה-blob מכיר רק את הסוד החדש,
    // previousSecrets ריק, והקישור שביד הלקוח נושא את הישן.
    const { svc } = makeService({
      metaSecrets: { secret: LIVE_SECRET, previousSecrets: [] },
      issuedSecrets: [{ secret: LIVE_SECRET }, { secret: OLD_SECRET }],
    });

    await expect(load(svc, `${QUOTE_ID}~${OLD_SECRET}`)).resolves.toBeTruthy();
  });

  it('מרפא את ה-blob אחרי הצלה מהטבלה, כדי שהבדיקה המהירה תתפוס בפעם הבאה', async () => {
    const { svc, updates } = makeService({
      metaSecrets: { secret: LIVE_SECRET, previousSecrets: [] },
      issuedSecrets: [{ secret: OLD_SECRET }],
    });

    await load(svc, `${QUOTE_ID}~${OLD_SECRET}`);
    // ההחלמה היא best-effort ולא ממתינים לה — נותנים ל-microtask להתנקז.
    await new Promise((r) => setImmediate(r));

    expect(updates).toHaveLength(1);
    expect(updates[0].data.digitalCertificateMeta.previousSecrets).toContain(OLD_SECRET);
    // הסוד החי לא נדרס תוך כדי הריפוי.
    expect(updates[0].data.digitalCertificateMeta.secret).toBe(LIVE_SECRET);
  });

  it('הצלה מהטבלה עובדת גם כש-previousSecrets חסר לגמרי (רשומות ישנות)', async () => {
    const { svc } = makeService({
      metaSecrets: { secret: LIVE_SECRET },
      issuedSecrets: [{ secret: OLD_SECRET }],
    });

    await expect(load(svc, `${QUOTE_ID}~${OLD_SECRET}`)).resolves.toBeTruthy();
  });

  // ── דחיות ─────────────────────────────────────────────────────────────

  it('דוחה סוד שלא הונפק מעולם', async () => {
    const { svc } = makeService({
      metaSecrets: { secret: LIVE_SECRET },
      issuedSecrets: [{ secret: LIVE_SECRET }],
    });

    await expect(load(svc, `${QUOTE_ID}~deadbeefdeadbeefdeadbeefdeadbeef`)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('דוחה סוד שבוטל מפורשות — ביטול מכוון חייב להישאר אפשרי', async () => {
    const { svc } = makeService({
      metaSecrets: { secret: LIVE_SECRET },
      issuedSecrets: [{ secret: OLD_SECRET, revokedAt: new Date() }],
    });

    await expect(load(svc, `${QUOTE_ID}~${OLD_SECRET}`)).rejects.toThrow(NotFoundException);
  });

  it('דוחה טוקן בלי מפריד', async () => {
    const { svc } = makeService({ metaSecrets: { secret: LIVE_SECRET } });
    await expect(load(svc, 'no-separator-here')).rejects.toThrow(NotFoundException);
  });

  it('דוחה הצעה שלא קיימת, בלי לחפש בטבלה', async () => {
    const { svc, prisma } = makeService({ metaSecrets: null, quoteExists: false });

    await expect(load(svc, `${QUOTE_ID}~${LIVE_SECRET}`)).rejects.toThrow(NotFoundException);
    expect(prisma.quoteSignatureToken.findFirst).not.toHaveBeenCalled();
  });

  it('לא מקריס את הבקשה כשהשאילתה לטבלה נכשלת — נופל חזרה לדחייה נקייה', async () => {
    const { svc, prisma } = makeService({ metaSecrets: { secret: LIVE_SECRET } });
    prisma.quoteSignatureToken.findFirst = jest
      .fn()
      .mockRejectedValue(new Error('connection lost'));

    await expect(load(svc, `${QUOTE_ID}~${OLD_SECRET}`)).rejects.toThrow(NotFoundException);
  });

  // ── רישום ההנפקה ──────────────────────────────────────────────────────

  it('רישום סוד לא זורק כשה-DB נכשל — עדיף לשלוח הצעה מאשר להיכשל', async () => {
    const { svc, prisma } = makeService({ metaSecrets: { secret: LIVE_SECRET } });
    prisma.quoteSignatureToken.createMany = jest
      .fn()
      .mockRejectedValue(new Error('unique index missing'));

    await expect(
      (svc as any).recordIssuedSecret(QUOTE_ID, LIVE_SECRET, null, 'request_signature'),
    ).resolves.toBeUndefined();
  });

  it('רישום חוזר של אותו סוד הוא לא שגיאה — שליחה חוזרת היא המקרה הרגיל', async () => {
    const { svc, created } = makeService({ metaSecrets: { secret: LIVE_SECRET } });

    await (svc as any).recordIssuedSecret(QUOTE_ID, LIVE_SECRET, 'user-1', 'send_pdf');
    await (svc as any).recordIssuedSecret(QUOTE_ID, LIVE_SECRET, 'user-1', 'send_pdf');

    // skipDuplicates הוא מה שהופך את זה לבטוח; שתי הקריאות עוברות בלי לזרוק.
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ quoteId: QUOTE_ID, secret: LIVE_SECRET });
  });
});
