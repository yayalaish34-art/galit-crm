'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'loading' | 'rendered' | 'error';

// פוליפיל קטן לדפדפני מובייל ישנים (iOS < 17.4) — pdf.js מסתמך על Promise.withResolvers.
function ensurePromisePolyfill() {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers !== 'function') {
    P.withResolvers = function withResolvers<T>() {
      let resolve!: (v: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
}

/**
 * האם הדפדפן מציג PDF מוטמע (<iframe>) באופן מקורי ונאמן.
 * דסקטופ (Chrome/Edge/Firefox/Safari) כן — והרינדור שלהם מושלם, זהה ל-PDF עצמו.
 * מובייל (iOS/Android) לא — שם <iframe> מציג מסך לבן, ולכן נפנה ל-pdf.js.
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
 * במובייל — דפדפנים לא מרנדרים PDF בתוך <iframe> (מסך לבן), לכן מרנדרים כל עמוד
 * לתמונה (canvas) בעזרת pdf.js.
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
      <div className={className}>
        <iframe
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          title="תצוגה מקדימה של ההצעה"
          className="h-full w-full"
          style={{ border: 'none' }}
        />
      </div>
    );
  }

  return <PdfCanvasPreview url={url} className={className} />;
}

/** מסלול pdf.js (מובייל) — מרנדר כל עמוד לקנבס. */
function PdfCanvasPreview({ url, className }: { url: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    setStatus('loading');

    (async () => {
      try {
        ensurePromisePolyfill();
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (cancelled) return;

        // חשוב לעברית: בלי נתוני הגופנים הסטנדרטיים pdf.js מציב את האותיות ברוחב שגוי,
        // מה שגורם לטקסט "שבור"/מפוזר בתצוגת הקנבס במובייל. אספקת cMap + standard_fonts
        // (קבצי גופנים סטטיים של pdf.js עצמו) מתקנת את המיקום. זה נוגע *רק* למסלול המובייל.
        const PDFJS_ASSETS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';
        const pdf = await pdfjs.getDocument({
          data,
          cMapUrl: `${PDFJS_ASSETS}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
        }).promise;
        if (cancelled) return;

        container.replaceChildren();
        // רזולוציה גבוהה יותר (עד ×3) לטקסט עברי חד יותר בקנבס.
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const cssWidth = container.clientWidth || 600;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const unscaled = page.getViewport({ scale: 1 });
          const scale = (cssWidth * dpr) / unscaled.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          if (i > 1) canvas.style.marginTop = '8px';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          container.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setStatus('rendered');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className={className}>
      <div ref={containerRef} className="w-full" />
      {status === 'loading' && (
        <div className="flex items-center justify-center p-10 text-sm text-slate-400">טוען תצוגה מקדימה…</div>
      )}
      {status === 'error' && (
        <div className="p-6 text-center text-sm text-slate-500">
          לא ניתן להציג את ה-PDF כאן.{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-600 underline">
            פתח את ההצעה
          </a>
        </div>
      )}
    </div>
  );
}
