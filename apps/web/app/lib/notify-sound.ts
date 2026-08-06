/**
 * צליל התראה קצר ("דינג") שמתלווה לפופ-אפים של ליד נכנס / משימה שהגיעה למועד.
 *
 * למה Web Audio ולא קובץ MP3:
 *  - אין תלות בקובץ חיצוני (אין בקשת רשת, אין 404 אחרי deploy, עובד גם אופליין).
 *  - נשמע זהה בכל דפדפן ומערכת הפעלה, בלי לצרוף נכס שמע לריפו.
 *
 * מדיניות autoplay: דפדפנים חוסמים ניגון עד שהמשתמש נגע בדף. לכן ה-AudioContext
 * נוצר בעצלתיים ומנסה resume() לפני כל ניגון; אם הדפדפן עדיין חוסם — פשוט אין צליל,
 * בלי שגיאה ובלי לפגוע בפופ-אפ עצמו. בפועל, עד שמגיעה התראה המשתמש כבר לחץ במערכת.
 */

/** מפתח localStorage לכיבוי הצליל (ההתראה החזותית נשארת). ערך '0' = מושתק. */
export const NOTIFY_SOUND_STORAGE_KEY = 'galit_notify_sound';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** האם הצליל מופעל (ברירת מחדל: כן). */
export function isNotifySoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(NOTIFY_SOUND_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** הפעלה/כיבוי של צליל ההתראה. */
export function setNotifySoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(NOTIFY_SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** צליל בודד עם עטיפת עוצמה רכה — בלי "קליק" בהתחלה ובסוף. */
function tone(audio: AudioContext, freq: number, startAt: number, duration: number, peak: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/**
 * "דינג" דו-צלילי עולה (לה → דו#), קצר ולא צורמני.
 * בטוח לקריאה מכל מקום — לעולם לא זורק ולא מחזיר Promise שצריך לתפוס.
 */
export function playNotifyChime(): void {
  if (!isNotifySoundEnabled()) return;
  const audio = getContext();
  if (!audio) return;
  const schedule = () => {
    try {
      const t0 = audio.currentTime + 0.01;
      tone(audio, 880, t0, 0.16, 0.16);            // A5
      tone(audio, 1174.66, t0 + 0.11, 0.28, 0.13); // D6
    } catch {
      /* ignore */
    }
  };
  try {
    // ה-context נכנס ל-suspended בטעינה ראשונה ואחרי חוסר פעילות. מתזמנים רק *אחרי*
    // ש-resume הסתיים — כשה-context מושהה currentTime קפוא, וזמנים שחושבו לפניו
    // היו נופלים בעבר והצליל היה נבלע.
    if (audio.state === 'suspended') {
      void audio.resume().then(schedule).catch(() => {});
    } else {
      schedule();
    }
  } catch {
    /* אם הדפדפן חוסם ניגון — מוותרים בשקט, הפופ-אפ עדיין מוצג */
  }
}

/**
 * "שחרור" ה-AudioContext במגע הראשון של המשתמש בדף.
 * מדיניות ה-autoplay מתירה resume() רק בתוך אירוע משתמש; בלי זה, התראה שמגיעה
 * לפני הלחיצה הראשונה הייתה יוצאת אילמת. נרשם פעם אחת ומסיר את עצמו.
 */
export function primeNotifySound(): () => void {
  if (typeof window === 'undefined') return () => {};
  let done = false;
  const unlock = () => {
    if (done) return;
    done = true;
    const audio = getContext();
    if (audio && audio.state === 'suspended') void audio.resume().catch(() => {});
    remove();
  };
  const remove = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  return remove;
}
