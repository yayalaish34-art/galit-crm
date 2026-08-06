import { RadonJobState, missingRequiredFields, validateStageAdvance } from './radon-rules';
import { ALL_TRACKS, RadonTrack, getTrack } from './radon-tracks';

/** עבודה תקינה כבסיס — כל בדיקה משנה ממנה רק את מה שהיא בודקת. */
function jobState(over: Partial<RadonJobState> = {}): RadonJobState {
  return {
    track: 'track2',
    stageIndex: 0,
    detectorCount: 2,
    placedAt: new Date('2026-07-01'),
    expectedEndAt: new Date('2026-07-04'),
    collectedAt: null,
    shippingAddress: null,
    outboundTracking: null,
    returnTracking: null,
    clientReportedAt: null,
    detectors: [
      { placementNote: 'סלון', placedAt: new Date('2026-07-01'), detector: { serialNumber: 'A1', status: 'DEPLOYED' } },
      { placementNote: 'מרתף', placedAt: new Date('2026-07-01'), detector: { serialNumber: 'A2', status: 'DEPLOYED' } },
    ],
    ...over,
  };
}

/** אינדקס השלב הראשון שמתאים לביטוי — כדי לא לקודד אינדקסים קשיחים. */
function stageIdx(track: RadonTrack, re: RegExp): number {
  const i = track.stages.findIndex((s) => re.test(s));
  if (i < 0) throw new Error(`no stage matching ${re} in ${track.id}`);
  return i;
}

describe('חובת תיעוד גלאים לפני "גלאים בשטח"', () => {
  const track = getTrack('track2');
  const idx = stageIdx(track, /גלאים בשטח/);

  it('עבודה מתועדת במלואה — עוברת', () => {
    expect(validateStageAdvance({ job: jobState(), track, toIndex: idx })).toHaveLength(0);
  });

  it('בלי גלאים משויכים — נחסם', () => {
    const problems = validateStageAdvance({ job: jobState({ detectors: [] }), track, toIndex: idx });
    expect(problems.join(' ')).toContain('ללא גלאים משויכים');
  });

  it('גלאי בלי מיקום — נחסם (החוק מעמ׳ 6)', () => {
    const job = jobState({
      detectors: [
        { placementNote: 'סלון', placedAt: new Date(), detector: { serialNumber: 'A1', status: 'DEPLOYED' } },
        { placementNote: null, placedAt: new Date(), detector: { serialNumber: 'A2', status: 'DEPLOYED' } },
      ],
    });
    expect(validateStageAdvance({ job, track, toIndex: idx }).join(' ')).toContain('חסר תיעוד מיקום');
  });

  it('שויכו פחות גלאים מהנדרש — נחסם', () => {
    const job = jobState({
      detectorCount: 3,
      detectors: [{ placementNote: 'סלון', placedAt: new Date(), detector: { serialNumber: 'A1', status: 'DEPLOYED' } }],
    });
    expect(validateStageAdvance({ job, track, toIndex: idx }).join(' ')).toContain('מתוך 3');
  });
});

describe('בדיקה ארוכה — תאריכי התחלה וסיום', () => {
  const track = getTrack('track3');
  const idx = stageIdx(track, /גלאים בשטח/);

  it('בלי תאריך סיום צפוי — נחסם', () => {
    const job = jobState({ track: 'track3', expectedEndAt: null });
    expect(validateStageAdvance({ job, track, toIndex: idx }).join(' ')).toContain('תאריך סיום צפוי');
  });

  it('בלי תאריך התחלה — נחסם', () => {
    const job = jobState({ track: 'track3', placedAt: null });
    expect(validateStageAdvance({ job, track, toIndex: idx }).join(' ')).toContain('תאריך התחלה');
  });
});

describe('מסלול 4 — בדיקה עצמית במשלוח', () => {
  const track = getTrack('track4');

  it('שליחת ערכה בלי כתובת ומספר מעקב — נחסם', () => {
    const job = jobState({ track: 'track4' });
    const problems = validateStageAdvance({ job, track, toIndex: stageIdx(track, /שליחת ערכה/) });
    expect(problems.join(' ')).toContain('כתובת משלוח');
    expect(problems.join(' ')).toContain('מספר מעקב');
  });

  it('בדיקה פעילה בלי דיווח הצבה מהלקוח — נחסם', () => {
    const job = jobState({ track: 'track4', clientReportedAt: null });
    const problems = validateStageAdvance({ job, track, toIndex: stageIdx(track, /בדיקה פעילה/) });
    expect(problems.join(' ')).toContain('ידווח על תאריך ההצבה');
  });

  it('דיווח לקוח קיים — לא נחסם על הסעיף הזה', () => {
    const job = jobState({ track: 'track4', clientReportedAt: new Date('2026-07-02') });
    const problems = validateStageAdvance({ job, track, toIndex: stageIdx(track, /בדיקה פעילה/) });
    expect(problems.join(' ')).not.toContain('ידווח על תאריך ההצבה');
  });

  it('החזרה בלי מספר מעקב חוזר — נחסם', () => {
    const job = jobState({ track: 'track4', returnTracking: null });
    const problems = validateStageAdvance({ job, track, toIndex: stageIdx(track, /הלקוח שלח חזרה/) });
    expect(problems.join(' ')).toContain('משלוח החוזר');
  });
});

describe('מסלול 1 — טופס 4', () => {
  const track = getTrack('track1');
  const idx = stageIdx(track, /אנליזה/);

  it('העברה לאנליזה בלי מועד איסוף — נחסם', () => {
    const job = jobState({ track: 'track1', collectedAt: null });
    expect(validateStageAdvance({ job, track, toIndex: idx }).join(' ')).toContain('מועד האיסוף');
  });

  it('גלאי בלי תאריך הצבה — נחסם', () => {
    const job = jobState({
      track: 'track1',
      collectedAt: new Date('2026-07-04'),
      detectors: [{ placementNote: 'סלון', placedAt: null, detector: { serialNumber: 'A1', status: 'COLLECTED' } }],
    });
    expect(validateStageAdvance({ job, track, toIndex: idx }).join(' ')).toContain('תאריך הצבה לכל גלאי');
  });

  it('עבודה מתועדת במלואה — עוברת', () => {
    const job = jobState({ track: 'track1', collectedAt: new Date('2026-07-04') });
    expect(validateStageAdvance({ job, track, toIndex: idx })).toHaveLength(0);
  });
});

describe('missingRequiredFields', () => {
  it('עבודה שלמה — אין חוסרים', () => {
    expect(missingRequiredFields({
      track: 'track2', detectorCount: 2, siteAddress: 'הרצל 1', contactName: 'דנה', contactPhone: '0501234567',
    })).toHaveLength(0);
  });

  it('שאלון לא הושלם — המסלול מסומן כחסר', () => {
    const missing = missingRequiredFields({
      track: null, detectorCount: null, siteAddress: null, contactName: null, contactPhone: null,
    });
    expect(missing).toHaveLength(5);
    expect(missing.join(' ')).toContain('השאלון');
  });
});

describe('שפיות כללית', () => {
  it('כל מסלול מגיע לשלב סגירה בלי חוקים חסומים כשהעבודה מלאה', () => {
    for (const track of ALL_TRACKS) {
      const last = track.stages.length - 1;
      const job = jobState({
        track: track.id,
        collectedAt: new Date('2026-07-04'),
        clientReportedAt: new Date('2026-07-02'),
        shippingAddress: 'הרצל 1', outboundTracking: 'TR1', returnTracking: 'TR2',
      });
      expect(validateStageAdvance({ job, track, toIndex: last })).toHaveLength(0);
    }
  });
});
