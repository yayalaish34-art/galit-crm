import {
  RADON_DETECTOR_STATUSES,
  DETECTOR_STATUS_LABELS,
  RadonDetectorStatusId,
  allowedNextStatuses,
  canTransition,
  isAvailableForAssignment,
  isBusyStatus,
  isUnusableStatus,
} from './radon-detector-status';

describe('סטטוסי גלאי', () => {
  it('13 הסטטוסים מהאפיון קיימים, ולכולם תווית עברית', () => {
    expect(RADON_DETECTOR_STATUSES).toHaveLength(13);
    for (const s of RADON_DETECTOR_STATUSES) {
      expect(DETECTOR_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe('canTransition — מסלול הבודק', () => {
  it('מלאי → שמור → אצל עובד → הוצב → נאסף → חזר למשרד → אנליזה', () => {
    const path: RadonDetectorStatusId[] = [
      'IN_STOCK', 'RESERVED', 'WITH_EMPLOYEE', 'DEPLOYED', 'COLLECTED', 'RETURNED', 'SENT_TO_LAB',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });
});

describe('canTransition — מסלול הבדיקה העצמית', () => {
  it('שמור → נשלח ללקוח → אצל לקוח → הוצב → חזר למשרד', () => {
    const path: RadonDetectorStatusId[] = [
      'RESERVED', 'SHIPPED_TO_CLIENT', 'WITH_CLIENT', 'DEPLOYED', 'RETURNED',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('גלאי שנשלח ללקוח לא קופץ ישירות להוצב — הוא חייב להתקבל קודם', () => {
    expect(canTransition('SHIPPED_TO_CLIENT', 'DEPLOYED')).toBe(false);
  });
});

describe('canTransition — מעברים אסורים', () => {
  it('לא ניתן לדלג ממלאי ישירות להצבה', () => {
    expect(canTransition('IN_STOCK', 'DEPLOYED')).toBe(false);
  });

  it('לא ניתן לחזור אחורה מאנליזה להצבה', () => {
    expect(canTransition('SENT_TO_LAB', 'DEPLOYED')).toBe(false);
  });

  it('נפסל הוא סטטוס סופי', () => {
    expect(allowedNextStatuses('DISQUALIFIED')).toHaveLength(0);
    for (const s of RADON_DETECTOR_STATUSES) {
      if (s !== 'DISQUALIFIED') expect(canTransition('DISQUALIFIED', s)).toBe(false);
    }
  });

  it('גלאי שאבד יכול להימצא ולחזור למלאי', () => {
    expect(canTransition('LOST', 'IN_STOCK')).toBe(true);
  });

  it('מעבר לאותו סטטוס תמיד מותר (אידמפוטנטיות)', () => {
    for (const s of RADON_DETECTOR_STATUSES) expect(canTransition(s, s)).toBe(true);
  });
});

describe('אבידה ופסילה זמינות כמעט מכל מצב', () => {
  it('כל סטטוס פעיל יכול לעבור לאבד ולנפסל', () => {
    const active: RadonDetectorStatusId[] = [
      'IN_STOCK', 'RESERVED', 'WITH_EMPLOYEE', 'SHIPPED_TO_CLIENT',
      'WITH_CLIENT', 'DEPLOYED', 'COLLECTED', 'RETURNED', 'SENT_TO_LAB',
    ];
    for (const s of active) {
      expect(canTransition(s, 'LOST')).toBe(true);
      expect(canTransition(s, 'DISQUALIFIED')).toBe(true);
    }
  });
});

describe('זמינות לשיוך', () => {
  it('רק גלאי במלאי, סגור, או שנמצא — זמין לשיוך', () => {
    const available = RADON_DETECTOR_STATUSES.filter(isAvailableForAssignment);
    expect(available).toEqual(['IN_STOCK', 'RESULT_RECEIVED', 'CLOSED']);
  });

  it('גלאי בשטח או אצל לקוח אינו זמין', () => {
    for (const s of ['DEPLOYED', 'WITH_CLIENT', 'SHIPPED_TO_CLIENT', 'RESERVED'] as RadonDetectorStatusId[]) {
      expect(isBusyStatus(s)).toBe(true);
      expect(isAvailableForAssignment(s)).toBe(false);
    }
  });

  it('גלאי שאבד או נפסל אינו שמיש', () => {
    expect(isUnusableStatus('LOST')).toBe(true);
    expect(isUnusableStatus('DISQUALIFIED')).toBe(true);
    expect(isAvailableForAssignment('LOST')).toBe(false);
  });
});
