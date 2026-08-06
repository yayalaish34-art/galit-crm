import {
  RadonAnswers,
  isRadonTestSku,
  resolveTrack,
  RADON_TEST_SKUS,
} from './radon-tracks';

/** עוזר: מחלץ את מזהה המסלול, ונכשל בבירור אם ההכרעה לא הושלמה. */
function trackIdOf(answers: RadonAnswers): string {
  const r = resolveTrack(answers);
  if (r.status !== 'resolved') {
    throw new Error(`expected resolved, got ${r.status}`);
  }
  return r.track.id;
}

describe('isRadonTestSku', () => {
  it('מזהה את ארבעת קודי הבדיקות', () => {
    expect(RADON_TEST_SKUS).toHaveLength(4);
    for (const sku of RADON_TEST_SKUS) expect(isRadonTestSku(sku)).toBe(true);
  });

  it('לא פותח זרימה לפרט ראדון, מכירת גלאים או כיול', () => {
    // 87 = תכנון ; 10022/10160 = חומרה ; 70/10069 = כיול
    for (const sku of ['87', '10022', '10095', '10160', '10161', '10162', '70', '10069']) {
      expect(isRadonTestSku(sku)).toBe(false);
    }
  });

  it('עמיד לקלט ריק ולרווחים', () => {
    expect(isRadonTestSku(null)).toBe(false);
    expect(isRadonTestSku(undefined)).toBe(false);
    expect(isRadonTestSku('')).toBe(false);
    expect(isRadonTestSku('  10044  ')).toBe(true);
  });
});

describe('resolveTrack — הציר הראשי', () => {
  it('טופס 4 → מסלול 1', () => {
    expect(trackIdOf({ purpose: 'form4' })).toBe('track1');
  });

  it('טופס 4 מכריע גם כשסוג הבדיקה קצרה ואופן הביצוע בודק', () => {
    expect(trackIdOf({ purpose: 'form4', testType: 'short', method: 'inspector' })).toBe('track1');
  });

  it('פרטית + קצרה → מסלול 2', () => {
    expect(trackIdOf({ purpose: 'private', testType: 'short' })).toBe('track2');
  });

  it('פרטית + ארוכה + בודק → מסלול 3', () => {
    expect(trackIdOf({ purpose: 'private', testType: 'long', method: 'inspector' })).toBe('track3');
  });

  it('פרטית + ארוכה + עצמית → מסלול 4', () => {
    expect(trackIdOf({ purpose: 'private', testType: 'long', method: 'self' })).toBe('track4');
  });

  it('מוסד חינוך מנותב כרגיל לפי סוג הבדיקה', () => {
    expect(trackIdOf({ purpose: 'institution', testType: 'long', method: 'inspector' })).toBe('track3');
  });
});

describe('resolveTrack — תשובות חסרות', () => {
  it('שאלון ריק → חסרה מטרת הבדיקה', () => {
    const r = resolveTrack({});
    expect(r.status).toBe('incomplete');
    if (r.status === 'incomplete') expect(r.missing).toContain('purpose');
  });

  it('"לא יודע" בסוג הבדיקה אינו שגיאה — פשוט אין הכרעה', () => {
    const r = resolveTrack({ purpose: 'private', testType: 'unknown' });
    expect(r.status).toBe('incomplete');
    if (r.status === 'incomplete') expect(r.missing).toContain('testType');
  });

  it('ארוכה בלי אופן ביצוע → חסר method', () => {
    const r = resolveTrack({ purpose: 'private', testType: 'long' });
    expect(r.status).toBe('incomplete');
    if (r.status === 'incomplete') expect(r.missing).toContain('method');
  });

  it('"טרם נקבע" באופן הביצוע מתנהג כמו חסר', () => {
    const r = resolveTrack({ purpose: 'private', testType: 'long', method: 'undecided' });
    expect(r.status).toBe('incomplete');
  });
});

describe('resolveTrack — סתירות (החוקים מעמ׳ 15)', () => {
  it('טופס 4 + בדיקה עצמית → נחסם', () => {
    const r = resolveTrack({ purpose: 'form4', method: 'self' });
    expect(r.status).toBe('conflict');
    if (r.status === 'conflict') expect(r.reason).toContain('טופס 4');
  });

  it('טופס 4 + בדיקה ארוכה → נחסם', () => {
    expect(resolveTrack({ purpose: 'form4', testType: 'long' }).status).toBe('conflict');
  });

  it('בדיקה קצרה + עצמית → נחסם (קצרה מחייבת תנאים סגורים)', () => {
    expect(resolveTrack({ purpose: 'private', testType: 'short', method: 'self' }).status).toBe('conflict');
  });
});

describe('resolveTrack — אזהרות התאמה', () => {
  it('בדיקה קצרה בנכס שאינו צמוד קרקע → אזהרה, אך המסלול עדיין נקבע', () => {
    const r = resolveTrack({ purpose: 'private', testType: 'short', groundContact: 'no' });
    expect(r.status).toBe('resolved');
    expect(r.warnings.join(' ')).toContain('צמודי קרקע בלבד');
  });

  it('טופס 4 בדירה בקומה רגילה → אזהרה על אי-התאמה', () => {
    const r = resolveTrack({ purpose: 'form4', propertyType: 'upper_apartment' });
    expect(r.status).toBe('resolved');
    expect(r.warnings.join(' ')).toContain('אינה צמודת קרקע');
  });

  it('בדיקה ארוכה אינה מקבלת אזהרת צמוד קרקע', () => {
    const r = resolveTrack({
      purpose: 'private', testType: 'long', method: 'inspector', groundContact: 'no',
    });
    expect(r.status).toBe('resolved');
    expect(r.warnings).toHaveLength(0);
  });

  it('מספר גלאים לא תקין מסומן כאזהרה', () => {
    const r = resolveTrack({ purpose: 'private', testType: 'long', method: 'self', detectorCount: 0 });
    expect(r.warnings.join(' ')).toContain('לפחות 1');
  });
});

describe('מבנה המסלולים', () => {
  it('רק מסלול 1 דורש בעל היתר', () => {
    expect(resolveTrack({ purpose: 'form4' })).toMatchObject({
      track: { requiresLicensedInspector: true, conditions: 'closed' },
    });
  });

  it('רק מסלול 4 הוא בדיקה עצמית', () => {
    const selfService = ['track1', 'track2', 'track3', 'track4'].map((id) => {
      const answers: RadonAnswers =
        id === 'track1' ? { purpose: 'form4' }
        : id === 'track2' ? { purpose: 'private', testType: 'short' }
        : id === 'track3' ? { purpose: 'private', testType: 'long', method: 'inspector' }
        : { purpose: 'private', testType: 'long', method: 'self' };
      const r = resolveTrack(answers);
      return r.status === 'resolved' && r.track.isSelfService;
    });
    expect(selfService).toEqual([false, false, false, true]);
  });

  it('לכל מסלול יש שלבים והמסלול הרשמי הוא הארוך ביותר', () => {
    const r1 = resolveTrack({ purpose: 'form4' });
    const r2 = resolveTrack({ purpose: 'private', testType: 'short' });
    if (r1.status !== 'resolved' || r2.status !== 'resolved') throw new Error('unresolved');
    expect(r1.track.stages.length).toBeGreaterThan(r2.track.stages.length);
  });
});
