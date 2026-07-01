'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiBaseUrl } from '../../lib/api-base';
import PdfPreview from './pdf-preview';

/** אימות תקינות ת"ז ישראלית לפי ספרת הביקורת (אלגוריתם משרד הפנים). */
function isValidIsraeliId(value: string): boolean {
  const id = (value || '').trim();
  if (!/^\d{5,9}$/.test(id)) return false;
  const padded = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

type Meta = {
  quoteNumber: string;
  customerName: string;
  companyName: string;
  customerType: 'PRIVATE' | 'BUSINESS';
  prefillFullName: string;
  prefillCompanyName: string;
  status: string;
  alreadySigned: boolean;
  signedAt: string | null;
};

type Phase = 'loading' | 'ready' | 'submitting' | 'done' | 'already' | 'error';

/** הצהרת ההסכמה שהלקוח מאשר לפני החתימה — מוטמעת גם ב-PDF החתום. */
const CONSENT_TEXT =
  'בחתימתי על מסמך זה אני מאשר/ת את קבלת הצעת המחיר הנ"ל, מאשר/ת את תנאיה, ומורה לחברתכם להתחיל בביצוע העבודה בהתאם להצעה.';

/**
 * עמוד חתימה ציבורי (ללא התחברות) — הלקוח פותח את הקישור מהמייל/וואטסאפ,
 * רואה את ההצעה (PDF) וחותם באצבע. החתימה נצרבת על ה-PDF בשרת ונשמרת כהצעה חתומה.
 */
export default function SignQuotePage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(String(params?.token || ''));
  const base = getApiBaseUrl();
  const pdfUrl = `${base}/public/sign/${encodeURIComponent(token)}/pdf`;

  const [phase, setPhase] = useState<Phase>('loading');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [hasInk, setHasInk] = useState(false);

  // ── פרטי החותם (מוצגים לפי סיווג הלקוח) ──
  const isBusiness = meta?.customerType === 'BUSINESS';
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [agreed, setAgreed] = useState(false);

  const idValid = isValidIsraeliId(idNumber);
  const fieldsValid = isBusiness
    ? !!(companyName.trim() && fullName.trim() && role.trim()) && idValid
    : !!fullName.trim() && idValid;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // ── טעינת פרטי ההצעה ──
  useEffect(() => {
    if (!token) { setPhase('error'); setErrMsg('קישור לא תקין'); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${base}/public/sign/${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!alive) return;
        if (!r.ok) {
          setErrMsg(r.status === 404 ? 'קישור החתימה אינו תקף או שפג תוקפו.' : 'אירעה שגיאה בטעינת ההצעה.');
          setPhase('error');
          return;
        }
        const m: Meta = await r.json();
        setMeta(m);
        if (m.prefillFullName) setFullName(m.prefillFullName);
        if (m.prefillCompanyName) setCompanyName(m.prefillCompanyName);
        setPhase(m.alreadySigned ? 'already' : 'ready');
      } catch {
        if (alive) { setErrMsg('לא הצלחנו לטעון את ההצעה. בדוק את החיבור לאינטרנט ונסה שוב.'); setPhase('error'); }
      }
    })();
    return () => { alive = false; };
  }, [token, base]);

  // ── הכנת הקנבס לרזולוציית המסך ──
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    if (phase !== 'ready') return;
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [phase, setupCanvas]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  /**
   * בונה "בלוק חתימה" כתמונת PNG אחת: פרטי החותם (עברית) + החתימה המצוירת + תאריך.
   * נבנה בדפדפן כי הוא מרנדר עברית נאמנה — השרת רק צורב את התמונה ל-PDF.
   */
  const buildSignatureBlock = (): string | null => {
    const sig = canvasRef.current;
    if (!sig) return null;
    const fields: [string, string][] = isBusiness
      ? [['שם החברה', companyName], ['שם מלא', fullName], ['תפקיד', role], ['ת.ז', idNumber]]
      : [['שם מלא', fullName], ['ת.ז', idNumber]];

    const scale = 2;
    const W = 600;
    const pad = 28, headerH = 46, lineH = 38, sigLabelH = 26, sigBoxH = 132, gapFields = 8, gapBox = 26, dateH = 22;
    const consentFont = '400 16px Arial, sans-serif';
    const consentLineH = 22;
    const consentMaxW = W - pad * 2;

    // עוטף את הצהרת ההסכמה לשורות (מדידה מקדימה) כדי לחשב גובה בלוק נכון.
    const measure = document.createElement('canvas').getContext('2d');
    const wrap = (text: string, maxW: number): string[] => {
      if (!measure) return [text];
      measure.font = consentFont;
      const words = text.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (measure.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      return lines;
    };
    const consentLines = wrap(CONSENT_TEXT, consentMaxW);
    const consentH = consentLines.length * consentLineH + 10;

    const H = pad + headerH + fields.length * lineH + gapFields + consentH + sigLabelH + sigBoxH + gapBox + dateH + pad;

    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5; ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    const right = W - pad;

    let y = pad;
    ctx.fillStyle = '#0f172a'; ctx.font = '700 26px Arial, sans-serif';
    ctx.fillText('אישור וחתימת לקוח', right, y + 28);
    y += headerH;
    for (const [label, value] of fields) {
      ctx.fillStyle = '#0f172a'; ctx.font = '500 20px Arial, sans-serif';
      ctx.fillText(`${label}: ${value || '—'}`, right, y + 24);
      y += lineH;
    }
    y += gapFields;
    // הצהרת ההסכמה (מה שהלקוח אישר ב-checkbox) — מוטמעת במסמך החתום.
    ctx.fillStyle = '#475569'; ctx.font = consentFont;
    for (const ln of consentLines) {
      ctx.fillText(ln, right, y + 16);
      y += consentLineH;
    }
    y += 10;
    ctx.fillStyle = '#64748b'; ctx.font = '600 17px Arial, sans-serif';
    ctx.fillText('חתימה:', right, y + 18);
    y += sigLabelH;
    const boxX = pad, boxW = W - pad * 2;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.strokeRect(boxX, y, boxW, sigBoxH);
    const r = Math.min(boxW / sig.width, sigBoxH / sig.height);
    const dw = sig.width * r, dh = sig.height * r;
    ctx.drawImage(sig, boxX + (boxW - dw) / 2, y + (sigBoxH - dh) / 2, dw, dh);
    y += sigBoxH + gapBox;
    const n = new Date();
    const p2 = (v: number) => String(v).padStart(2, '0');
    ctx.fillStyle = '#94a3b8'; ctx.font = '400 15px Arial, sans-serif';
    ctx.fillText(`נחתם בתאריך ${p2(n.getDate())}/${p2(n.getMonth() + 1)}/${n.getFullYear()} ${p2(n.getHours())}:${p2(n.getMinutes())}`, right, y + 16);

    return c.toDataURL('image/png');
  };

  const submit = async () => {
    if (!fieldsValid || !hasInk || !agreed) return;
    setPhase('submitting');
    setErrMsg('');
    try {
      const signature = buildSignatureBlock();
      if (!signature) { setErrMsg('שגיאה ביצירת בלוק החתימה. נסה שוב.'); setPhase('ready'); return; }
      const signer = isBusiness
        ? { companyName: companyName.trim(), fullName: fullName.trim(), role: role.trim(), idNumber: idNumber.trim() }
        : { fullName: fullName.trim(), idNumber: idNumber.trim() };
      const r = await fetch(`${base}/public/sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, signer }),
      });
      if (!r.ok) {
        let msg = 'שליחת החתימה נכשלה. נסה שוב.';
        try { const e = await r.json(); if (e?.message) msg = Array.isArray(e.message) ? e.message[0] : e.message; } catch { /* ignore */ }
        setErrMsg(msg);
        setPhase('ready');
        return;
      }
      setPhase('done');
    } catch {
      setErrMsg('שליחת החתימה נכשלה. בדוק את החיבור ונסה שוב.');
      setPhase('ready');
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-100 px-4 py-6">
      <div className="mx-auto w-full max-w-2xl">
        {/* כותרת */}
        <div className="mb-4 rounded-3xl bg-gradient-to-l from-[#2f5c32] to-[#4ba647] px-6 py-5 text-white shadow-lg">
          <div className="text-sm font-medium text-white/80">{meta?.companyName || 'גלית – החברה לאיכות הסביבה'}</div>
          <h1 className="mt-1 text-2xl font-black">חתימה על הצעת מחיר</h1>
          {meta?.quoteNumber ? <div className="mt-1 text-sm text-white/85">הצעה מס׳ {meta.quoteNumber}</div> : null}
        </div>

        {phase === 'loading' && (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">טוען את ההצעה…</div>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="text-2xl">⚠️</div>
            <div className="mt-2 text-base font-bold text-slate-800">לא ניתן להציג את ההצעה</div>
            <div className="mt-1 text-sm text-slate-500">{errMsg}</div>
          </div>
        )}

        {phase === 'already' && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="text-4xl">✅</div>
            <div className="mt-3 text-lg font-bold text-emerald-700">ההזמנה כבר נחתמה</div>
            <div className="mt-1 text-sm text-slate-500">
              תודה{meta?.customerName ? `, ${meta.customerName}` : ''}! קיבלנו את חתימתך.
            </div>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="mt-5 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:brightness-110">
              צפה בהזמנה החתומה
            </a>
          </div>
        )}

        {phase === 'done' && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="text-4xl">🎉</div>
            <div className="mt-3 text-lg font-bold text-emerald-700">החתימה נשלחה בהצלחה!</div>
            <div className="mt-1 text-sm text-slate-500">
              תודה רבה{meta?.customerName ? `, ${meta.customerName}` : ''}. ההזמנה נחתמה והתקבלה אצלנו.
            </div>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="mt-5 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:brightness-110">
              צפה בהזמנה החתומה
            </a>
          </div>
        )}

        {(phase === 'ready' || phase === 'submitting') && (
          <div className="space-y-4">
            {/* תצוגת ההצעה */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-sm font-bold text-slate-700">📄 ההצעה שלך</span>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">
                  פתח במסך מלא
                </a>
              </div>
              <PdfPreview url={pdfUrl} className="h-[460px] w-full overflow-y-auto bg-slate-50" />
            </div>

            {/* פרטי החותם — לפי סיווג הלקוח */}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-bold text-slate-700">📝 פרטי החותם</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {isBusiness && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">שם החברה *</span>
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="שם החברה"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">שם מלא *</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="שם מלא"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
                {isBusiness && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">תפקיד *</span>
                    <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="תפקיד בחברה"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">ת.ז *</span>
                  <input value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" maxLength={9} placeholder="מספר תעודת זהות"
                    className={`w-full rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white ${
                      idNumber && !idValid
                        ? 'border-rose-300 focus:border-rose-400'
                        : 'border-slate-200 focus:border-emerald-400'
                    }`} />
                  {idNumber && !idValid && (
                    <span className="mt-1 block text-[11px] font-medium text-rose-500">מספר תעודת זהות אינו תקין</span>
                  )}
                </label>
              </div>
            </div>

            {/* אזור החתימה */}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">✍️ חתום כאן באצבע</span>
                <button type="button" onClick={clear}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">
                  נקה
                </button>
              </div>
              <div className="relative rounded-xl border-2 border-dashed border-emerald-300 bg-slate-50">
                {!hasInk && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
                    חתום כאן
                  </span>
                )}
                <canvas
                  ref={canvasRef}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerLeave={onUp}
                  className="h-44 w-full touch-none"
                />
              </div>
              {/* אישור הסכמה — חובה לפני החתימה */}
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-5 w-5 flex-shrink-0 accent-emerald-600"
                />
                <span className="text-[13px] leading-relaxed text-slate-700">{CONSENT_TEXT}</span>
              </label>

              {errMsg ? <div className="mt-2 text-center text-sm text-rose-500">{errMsg}</div> : null}

              {(!fieldsValid || !agreed) && (
                <div className="mt-2 text-center text-[11px] text-amber-600">
                  {!fieldsValid ? 'יש למלא את כל השדות המסומנים ב-* ' : ''}
                  {!fieldsValid && !agreed ? 'ולסמן את אישור ההסכמה ' : (!agreed ? 'יש לסמן את אישור ההסכמה ' : '')}
                  לפני החתימה
                </div>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={!fieldsValid || !hasInk || !agreed || phase === 'submitting'}
                className="mt-3 w-full rounded-xl bg-[#4ba647] py-3.5 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {phase === 'submitting' ? 'שולח…' : 'אשר וחתום ✓'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 text-center text-[11px] text-slate-400">
          חתימה מאובטחת · {meta?.companyName || 'גלית – החברה לאיכות הסביבה'}
        </div>
      </div>
    </div>
  );
}
