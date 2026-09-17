import { RadonKitAutoSendService } from './radon-kit-autosend.service';

/**
 * סריקת 48 השעות שולחת וואטסאפ ללקוחות אמיתיים בלי שאף אדם אישר את זה, ולכן
 * *מי* נכנס לרשימה הוא כל הסיפור. הבדיקות כאן נועלות את התנאים שמפרידים בין
 * "העובד שכח" לבין "עוד לא הגיע הזמן".
 *
 * ה-DB ממוקק — הכוונה היא לבדוק את ההחלטה, לא את Prisma.
 */
describe('RadonKitAutoSendService', () => {
  const HOUR = 3_600_000;

  function makeService(opts: {
    tasks?: any[];
    /** משימות שכבר יצאה בהן הודעה. */
    alreadySentTaskIds?: string[];
    /** markKitSent שזורק עבור משימות מסוימות (למשל לקוח בלי טלפון). */
    failFor?: string[];
  }) {
    const taskFindMany = jest.fn().mockResolvedValue(opts.tasks ?? []);
    const prisma: any = {
      task: { findMany: taskFindMany },
      radonJob: {
        findMany: jest.fn().mockResolvedValue(
          (opts.alreadySentTaskIds ?? []).map((taskId) => ({ taskId })),
        ),
      },
    };

    const sentCalls: any[] = [];
    const kit: any = {
      markKitSent: jest.fn().mockImplementation((input: any) => {
        if ((opts.failFor ?? []).includes(input.taskId)) {
          return Promise.reject(new Error('אין ללקוח מספר טלפון במערכת'));
        }
        sentCalls.push(input);
        return Promise.resolve({});
      }),
    };

    return { svc: new RadonKitAutoSendService(prisma, kit), taskFindMany, sentCalls, kit };
  }

  const task = (id: string, over: any = {}) => ({
    id,
    productName: '10000',
    customerId: `cust-${id}`,
    currentStageChangedAt: new Date(Date.now() - 72 * HOUR),
    ...over,
  });

  // ── מה נכנס לשאילתה ────────────────────────────────────────────────────

  it('סורק רק משימות בשלב ביצוע, פתוחות, עם קוד ערכה', async () => {
    const { svc, taskFindMany } = makeService({ tasks: [] });
    await svc.run();

    const where = taskFindMany.mock.calls[0][0].where;
    expect(where.type).toEqual({ in: ['step6', 'FIELD_WORK'] });
    expect(where.status).toEqual({ notIn: ['DONE', 'CANCELLED'] });
    // גם קוד וגם שם עברי — יש משימות שבהן productName הוא שם השירות.
    expect(where.OR[0].productName.in).toEqual(expect.arrayContaining(['61', '10000']));
    expect(where.OR[1].AND).toHaveLength(2);
  });

  it('דורש חותמת כניסה לשלב, ולא סופר ממנה אם היא חסרה', async () => {
    const { svc, taskFindMany } = makeService({ tasks: [] });
    await svc.run();

    // null = לא ידוע מתי נכנסה לביצוע. שליחה במקרה כזה היא ניחוש.
    const where = taskFindMany.mock.calls[0][0].where;
    expect(where.currentStageChangedAt.not).toBeNull();
    expect(where.currentStageChangedAt.lte).toBeInstanceOf(Date);
  });

  it('חוסם משימות ישנות מדי — בלי זה ההפעלה הראשונה מציפה לקוחות מלפני חודשים', async () => {
    const { svc, taskFindMany } = makeService({ tasks: [] });
    const before = Date.now();
    await svc.run();

    const floor: Date = taskFindMany.mock.calls[0][0].where.currentStageChangedAt.gte;
    const daysBack = (before - floor.getTime()) / (24 * HOUR);
    expect(daysBack).toBeGreaterThan(13.9);
    expect(daysBack).toBeLessThan(14.2);

    // החלון סגור משני הצדדים: לא מוקדם מדי ולא ישן מדי.
    const { lte, gte } = taskFindMany.mock.calls[0][0].where.currentStageChangedAt;
    expect(gte.getTime()).toBeLessThan(lte.getTime());
  });

  it('חלון החסד הוא 48 שעות אחורה', async () => {
    const { svc, taskFindMany } = makeService({ tasks: [] });
    const before = Date.now();
    await svc.run();

    const cutoff: Date = taskFindMany.mock.calls[0][0].where.currentStageChangedAt.lte;
    const hoursBack = (before - cutoff.getTime()) / HOUR;
    expect(hoursBack).toBeGreaterThan(47.9);
    expect(hoursBack).toBeLessThan(48.2);
  });

  // ── מי באמת מקבל הודעה ─────────────────────────────────────────────────

  it('שולח למשימה שעברה את החלון וסימון ידני לא בוצע', async () => {
    const { svc, sentCalls } = makeService({ tasks: [task('t1')] });

    const res = await svc.run();

    expect(res.sent).toBe(1);
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0]).toMatchObject({ taskId: 't1', via: 'auto', actorUserId: null });
  });

  it('לא שולח פעמיים — משימה שכבר יצאה בה הודעה מסוננת החוצה', async () => {
    const { svc, sentCalls } = makeService({
      tasks: [task('t1'), task('t2')],
      alreadySentTaskIds: ['t1'],
    });

    const res = await svc.run();

    expect(res.sent).toBe(1);
    expect(sentCalls.map((c) => c.taskId)).toEqual(['t2']);
  });

  it('לא שולח כלום כשאין מועמדים, ולא נוגע ב-DB מעבר לסריקה', async () => {
    const { svc, kit } = makeService({ tasks: [] });

    const res = await svc.run();

    expect(res).toEqual({ scanned: 0, sent: 0, skipped: 0 });
    expect(kit.markKitSent).not.toHaveBeenCalled();
  });

  it('מעביר את קוד השירות כפי שהוא, כולל שם בעברית', async () => {
    const hebrew = 'ראדון – ערכה לבדיקת גז ראדון ארוכת טווח';
    const { svc, sentCalls } = makeService({
      tasks: [task('t1', { productName: hebrew })],
    });

    await svc.run();
    expect(sentCalls[0].sku).toBe(hebrew);
  });

  // ── עמידות ─────────────────────────────────────────────────────────────

  it('כשל במשימה אחת לא עוצר את השאר', async () => {
    const { svc, sentCalls } = makeService({
      tasks: [task('t1'), task('t2'), task('t3')],
      failFor: ['t2'],
    });

    const res = await svc.run();

    expect(res.sent).toBe(2);
    expect(res.skipped).toBe(1);
    expect(sentCalls.map((c) => c.taskId)).toEqual(['t1', 't3']);
  });

  it('מוגבל ל-20 שליחות בסבב, כדי שתקלה במיון לא תציף לקוחות', async () => {
    const many = Array.from({ length: 35 }, (_, i) => task(`t${i}`));
    const { svc, sentCalls } = makeService({ tasks: many });

    const res = await svc.run();

    expect(sentCalls).toHaveLength(20);
    expect(res.sent).toBe(20);
  });

  it('רצפת הפעלה גוברת על הגיל המרבי כשהיא מאוחרת ממנו', async () => {
    const prev = process.env.RADON_KIT_AUTOSEND_NOT_BEFORE;
    const activation = new Date(Date.now() - 3 * 24 * HOUR); // מאוחר מ-14 יום
    process.env.RADON_KIT_AUTOSEND_NOT_BEFORE = activation.toISOString();
    try {
      const { svc, taskFindMany } = makeService({ tasks: [] });
      await svc.run();

      const gte: Date = taskFindMany.mock.calls[0][0].where.currentStageChangedAt.gte;
      // הרצפה היא מועד ההפעלה, לא 14 יום אחורה — כך שמשימות שקדמו לו לא נסרקות.
      expect(Math.abs(gte.getTime() - activation.getTime())).toBeLessThan(1000);
    } finally {
      if (prev === undefined) delete process.env.RADON_KIT_AUTOSEND_NOT_BEFORE;
      else process.env.RADON_KIT_AUTOSEND_NOT_BEFORE = prev;
    }
  });

  it('רצפת הפעלה לא תקינה מתעלמים ממנה במקום לחסום הכל', async () => {
    const prev = process.env.RADON_KIT_AUTOSEND_NOT_BEFORE;
    process.env.RADON_KIT_AUTOSEND_NOT_BEFORE = 'not-a-date';
    try {
      const { svc, taskFindMany } = makeService({ tasks: [] });
      await svc.run();

      const gte: Date = taskFindMany.mock.calls[0][0].where.currentStageChangedAt.gte;
      const daysBack = (Date.now() - gte.getTime()) / (24 * HOUR);
      expect(daysBack).toBeGreaterThan(13.9); // חזרה לגיל המרבי
    } finally {
      if (prev === undefined) delete process.env.RADON_KIT_AUTOSEND_NOT_BEFORE;
      else process.env.RADON_KIT_AUTOSEND_NOT_BEFORE = prev;
    }
  });

  it('כיבוי דרך env עוצר את הסבב לגמרי', async () => {
    const prev = process.env.RADON_KIT_AUTOSEND_ENABLED;
    process.env.RADON_KIT_AUTOSEND_ENABLED = '0';
    try {
      const { svc, kit, taskFindMany } = makeService({ tasks: [task('t1')] });
      await svc.tick();
      expect(taskFindMany).not.toHaveBeenCalled();
      expect(kit.markKitSent).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.RADON_KIT_AUTOSEND_ENABLED;
      else process.env.RADON_KIT_AUTOSEND_ENABLED = prev;
    }
  });

  it('tick בולע שגיאות — cron שנופל לא מפיל את השרת', async () => {
    const { svc } = makeService({ tasks: [] });
    (svc as any).prisma = null; // יגרום ל-TypeError בתוך run
    await expect(svc.tick()).resolves.toBeUndefined();
  });
});
