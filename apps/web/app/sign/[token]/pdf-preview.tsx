'use client';

import { useEffect, useState } from 'react';

/**
 * האם הדפדפן מציג PDF מוטמע (<iframe>) באופן מקורי ונאמן.
 * דסקטופ (Chrome/Edge/Firefox/Safari) כן — והרינדור שלהם מושלם, זהה ל-PDF עצמו.
 * מובייל (iOS/Android) לא — שם <iframe> חוצה-מקור מציג מסך לבן, וניסיון לרנדר
 * את ה-PDF ל-canvas עם pdf.js שובר את הטקסט העברי (רוחבי גופן שגויים → אותיות
 * מפוזרות ולא קריאות). לכן במובייל מציגים כפתור גדול שפותח את ה-PDF במציג
 * המקורי של המכשיר — שם העברית מרונדרת נאמנה ומדויקת.
 */
function supportsNativePdf(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  return !isIOS && !isAndroid;
}

/**
 * תצוגה מקדימה של PDF.
 * בדסקטופ — מוטמע נאמנה דרך <iframe> (רינדור מקורי, חד ומדויק כמו ה-PDF עצמו).
 * במובייל — כפתור גדול "פתח מסמך מלא" שפותח את ה-PDF במציג המקורי של המכשיר,
 * שמרנדר עברית נאמנה (בניגוד ל-pdf.js שהיה מפזר/שובר את הטקסט).
 */
export default function PdfPreview({ url, className }: { url: string; className?: string }) {
  // מחושב רק בצד הלקוח כדי להימנע מאי-התאמת SSR.
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => { setNative(supportsNativePdf()); }, []);

  if (native === null) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center p-10 text-sm text-slate-400">טוען תצוגה מקדימה…</div>
      </div>
    );
  }

  if (native) {
    return (
      <div className={`${className ?? ''} h-[460px]`}>
        <iframe
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          title="תצוגה מקדימה של ההצעה"
          className="h-full w-full"
          style={{ border: 'none' }}
        />
      </div>
    );
  }

  // ── מובייל: כפתור גדול לפתיחת המסמך המלא במציג המקורי ──
  return (
    <div className={className}>
      <div className="flex flex-col items-center justify-center gap-5 px-8 py-10 text-center">
        <div className="text-6xl leading-none">📄</div>
        <div className="text-lg font-black text-slate-800">הצעת המחיר שלך מוכנה</div>
        <div className="max-w-xs text-sm leading-relaxed text-slate-500">
          לחצו לפתיחת המסמך המלא והברור. לאחר הצפייה חזרו לעמוד זה כדי למלא את הפרטים ולחתום.
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-2xl bg-[#4ba647] px-10 py-4 text-lg font-black text-white shadow-lg transition hover:brightness-110 active:scale-95"
        >
          📄 פתח מסמך מלא
        </a>
      </div>
    </div>
  );
}
