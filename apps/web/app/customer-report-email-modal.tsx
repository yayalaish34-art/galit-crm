'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Loader2, FileText, Sparkles, Clock, ChevronDown, Check } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

type ReportRef = {
  id: string;
  name: string;
};

/** עובד שניתן לבחור כנמען עותק — כמו בטופס שליחת הצעת המחיר. */
type EmployeeOption = { id: string; name: string; email: string };

type SignatureRec = { id: string; title: string; dataBase64: string; imageType?: string };

/** שליחה שממתינה בתור — כפי שהשרת מחזיר אותה. */
type ScheduledJob = { id: string; sendAt: string; to: string; subject?: string };

/** איש קשר של הלקוח, כפי ש-/customers/:id/contacts מחזיר (ראשי ראשון). */
type ContactRec = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
  isActive?: boolean;
};

/** "יום ג׳, 27 באוג׳ 09:00" — מספיק כדי לדעת שזה הזמן הנכון, בלי עודף. */
function fmtWhen(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

/**
 * ברירת המחדל למועד: מחר ב-09:00, בפורמט שה-input מבין.
 *
 * שליחה למחרת בבוקר היא הסיבה השכיחה לתזמון — דוח שנגמר ב-23:00 ולא צריך
 * להגיע ללקוח ב-23:00. הערך ניתן לשינוי, אבל לרוב לא צריך.
 */
function defaultSendAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * טופס "שלח דוח במייל" מכרטיס הלקוח — לדוח שכבר צורף ב"דוחות שהופקו".
 * מקביל לטופס הביצוע (SendReportModal) אך ללא משימה משויכת: אין תשלום/אישור מנהל,
 * אין סימון משימה DONE ואין בקשת דירוג. השליחה דרך /customers/:id/documents/:documentId/send-email.
 */
export function CustomerReportEmailModal({
  open,
  onClose,
  customerId,
  customerName,
  defaultEmail,
  report,
  currentUser,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName?: string;
  defaultEmail?: string;
  report: ReportRef | null;
  currentUser: { id?: string; name?: string } & Record<string, unknown>;
  onSent?: () => void;
}) {
  const autoDraftedRef = useRef(false);

  const [toList, setToList] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [ccList, setCcList] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [ccDropdownOpen, setCcDropdownOpen] = useState(false);
  const [bccList, setBccList] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState('');
  const [bccDropdownOpen, setBccDropdownOpen] = useState(false);

  /**
   * עובדי החברה לבוררי ה-CC/BCC.
   *
   * נטענים כאן ולא מגיעים כ-prop: הסקשן שמציג את הטופס יושב עמוק בכרטיס הלקוח,
   * והעברת הרשימה דרכו הייתה מחייבת prop חדש בשני רכיבים שאינם עוסקים בדואר.
   * מסונן ל"פעיל" בלבד — עובד מושבת אינו אמור להופיע בשום בורר נמענים.
   */
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');

  // אישור קריאה/מסירה — Microsoft Graph
  const [requestReadReceipt, setRequestReadReceipt] = useState(false);
  const [requestDeliveryReceipt, setRequestDeliveryReceipt] = useState(false);

  // חתימה אישית (זהה לטופס שליחת הדוח בשלב הביצוע)
  const [contacts, setContacts] = useState<ContactRec[]>([]);
  const [signatures, setSignatures] = useState<SignatureRec[]>([]);
  const [includeSignature, setIncludeSignature] = useState(false);
  const [signatureId, setSignatureId] = useState('');

  const [sending, setSending] = useState(false);

  // ── תזמון שליחה ──
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  /** ערך של <input type="datetime-local"> — שעון מקומי, מומר ל-UTC בשליחה. */
  const [sendAt, setSendAt] = useState('');
  const [scheduled, setScheduled] = useState<ScheduledJob[]>([]);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');

  const draft = useCallback(
    async (instruction?: string) => {
      setAiBusy(true);
      setErr('');
      try {
        const r = await apiFetch(apiUrl('/ai-mail/report-draft'), {
          method: 'POST',
          authUser: currentUser as never,
          body: JSON.stringify({
            customerId: customerId || undefined,
            customerName: customerName || '',
            contactName: customerName || '',
            reportName: report?.name || '',
            // מזהה מסמך הדוח — כדי שהשרת יקרא את תוכן הדוח וינסח מייל מותאם (לא גנרי).
            reportDocumentId: report?.id || undefined,
            instruction: instruction || undefined,
            previousSubject: subject || undefined,
            previousBody: body || undefined,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d?.subject) setSubject(d.subject);
          if (d?.body) setBody(d.body);
        } else {
          setErr('ניסוח ה-AI נכשל');
        }
      } catch {
        setErr('ניסוח ה-AI נכשל');
      } finally {
        setAiBusy(false);
      }
    },
    [currentUser, customerId, customerName, report, subject, body],
  );

  /** מה שכבר ממתין בתור לדוח הזה — כדי שלא יתוזמן פעמיים ושאפשר יהיה לבטל. */
  const loadScheduled = useCallback(async () => {
    if (!customerId || !report?.id) return;
    try {
      const r = await apiFetch(
        apiUrl(`/customers/${customerId}/documents/${report.id}/scheduled-emails`),
        { authUser: currentUser as never },
      );
      if (r.ok) setScheduled(await r.json());
    } catch {
      /* שקט — רשימת התור היא מידע נוסף, לא תנאי לשליחה */
    }
  }, [customerId, report?.id, currentUser]);

  // אתחול בעת פתיחה + ניסוח אוטומטי פעם אחת
  useEffect(() => {
    if (!open) {
      autoDraftedRef.current = false;
      return;
    }
    setErr('');
    setStatus('');
    setSubject('');
    setBody('');
    setAiInstruction('');
    setToList(defaultEmail && defaultEmail.includes('@') ? [defaultEmail.trim()] : []);
    setToInput('');
    setCcList([]);
    setCcInput('');
    setCcDropdownOpen(false);
    setBccList([]);
    setBccInput('');
    setBccDropdownOpen(false);
    setRequestReadReceipt(false);
    setRequestDeliveryReceipt(false);
    setSchedulingOpen(false);
    setSendAt(defaultSendAt());
    setScheduled([]);
    void loadScheduled();
    // אנשי הקשר של הלקוח — לבחירת נמען מתוך רשימה במקום לזכור כתובת בעל פה.
    setContacts([]);
    void (async () => {
      try {
        const r = await apiFetch(apiUrl(`/customers/${customerId}/contacts`), { authUser: currentUser as never });
        if (r.ok) {
          const list = await r.json();
          setContacts(Array.isArray(list) ? list : []);
        }
      } catch { /* הרשימה היא נוחות — אפשר להקליד כתובת ידנית גם בלעדיה */ }
    })();
    // עובדי החברה לבוררי העותק. עובד מושבת מסונן: הוא לא אמור לקבל דואר לקוחות.
    void (async () => {
      try {
        const r = await apiFetch(apiUrl('/users'), { authUser: currentUser as never });
        if (!r.ok) return;
        const list = await r.json();
        setEmployees(
          (Array.isArray(list) ? list : [])
            .filter((u: any) => u?.email && u?.status !== 'לא פעיל' && u?.status !== 'INACTIVE')
            .map((u: any) => ({ id: String(u.id), name: String(u.name || u.email), email: String(u.email) })),
        );
      } catch { /* אפשר להקליד כתובת ידנית גם בלי הרשימה */ }
    })();
    // טעינת חתימות המשתמש (וברירת מחדל: כלול את הראשונה).
    const uid = currentUser?.id;
    if (uid) {
      void (async () => {
        try {
          const r = await apiFetch(apiUrl(`/users/${uid}/signatures`), { authUser: currentUser as never });
          if (r.ok) {
            const list: SignatureRec[] = await r.json();
            setSignatures(Array.isArray(list) ? list : []);
            if (list?.length) { setSignatureId(list[0].id); setIncludeSignature(true); }
          }
        } catch { /* silent */ }
      })();
    }
    if (!autoDraftedRef.current) {
      autoDraftedRef.current = true;
      void draft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmail]);

  /**
   * אנשי הקשר שאפשר באמת לשלוח אליהם: רק עם כתובת מייל, בלי מי שסומן כלא-פעיל,
   * ובלי כפילויות — אותה כתובת רשומה לעיתים על שני אנשי קשר ואין טעם להציג אותה פעמיים.
   */
  const contactOptions = (() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; email: string; label: string }> = [];
    for (const c of contacts) {
      const email = (c.email ?? '').trim();
      if (!email.includes('@') || c.isActive === false) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const name = (c.fullName ?? '').trim();
      const role = (c.roleTitle ?? '').trim();
      const who = [name, role].filter(Boolean).join(' — ');
      out.push({ id: c.id, email, label: who ? `${who} · ${email}` : email });
    }
    return out;
  })();

  const addRecipients = (raw: string, which: 'to' | 'cc' | 'bcc') => {
    const emails = raw.split(/[,\s]+/).map((e) => e.trim()).filter((e) => e.includes('@'));
    if (!emails.length) return;
    if (which === 'to') {
      setToList((p) => Array.from(new Set([...p, ...emails])));
      setToInput('');
    } else if (which === 'cc') {
      setCcList((p) => Array.from(new Set([...p, ...emails])));
      setCcInput('');
    } else {
      setBccList((p) => Array.from(new Set([...p, ...emails])));
      setBccInput('');
    }
  };

  const removeRecipient = (em: string, which: 'to' | 'cc' | 'bcc') => {
    if (which === 'to') setToList((p) => p.filter((x) => x !== em));
    else if (which === 'cc') setCcList((p) => p.filter((x) => x !== em));
    else setBccList((p) => p.filter((x) => x !== em));
  };

  const allTo = toInput.includes('@') ? [...toList, toInput.trim()] : toList;
  const canSend = !!report && allTo.length > 0 && !sending;

  const send = async () => {
    if (!report) return;
    const to = allTo.filter((e) => e.includes('@'));
    if (!to.length) {
      setErr('יש להזין נמען');
      return;
    }
    setSending(true);
    setErr('');
    setStatus('שולח…');
    try {
      const cc = ccInput.includes('@') ? [...ccList, ccInput.trim()] : ccList;
      const bcc = bccInput.includes('@') ? [...bccList, bccInput.trim()] : bccList;
      const r = await apiFetch(
        apiUrl(`/customers/${customerId}/documents/${report.id}/send-email`),
        {
          method: 'POST',
          authUser: currentUser as never,
          body: JSON.stringify({
            to: to[0],
            toList: to,
            cc,
            bcc,
            subject,
            body,
            customerName: customerName || '',
            includeSignature,
            signatureId: includeSignature ? signatureId : undefined,
            requestReadReceipt,
            requestDeliveryReceipt,
          }),
        },
      );
      if (r.ok) {
        setStatus('נשלח ✓');
        onSent?.();
        setTimeout(() => onClose(), 800);
      } else {
        let msg = 'שליחת הדוח נכשלה';
        try {
          const e = await r.json();
          if (e?.message) msg = Array.isArray(e.message) ? e.message.join(', ') : e.message;
        } catch {
          /* ignore */
        }
        setErr(msg);
        setStatus('');
      }
    } catch {
      setErr('שליחת הדוח נכשלה');
      setStatus('');
    } finally {
      setSending(false);
    }
  };

  /**
   * תזמון — אותה בקשה, עם מועד.
   *
   * הטופס לא מנוסח מחדש ולא נשמר בנפרד: מה שכתוב על המסך ברגע הלחיצה הוא מה
   * שיישלח, בדיוק כמו ב"שלח דוח". ההבדל היחיד הוא מתי.
   */
  const schedule = async () => {
    if (!report) return;
    const to = allTo.filter((e) => e.includes('@'));
    if (!to.length) {
      setErr('יש להזין נמען');
      return;
    }
    if (!sendAt) {
      setErr('בחר מועד שליחה');
      return;
    }
    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
      setErr('מועד השליחה כבר עבר');
      return;
    }

    setSending(true);
    setErr('');
    setStatus('מתזמן…');
    try {
      const cc = ccInput.includes('@') ? [...ccList, ccInput.trim()] : ccList;
      const bcc = bccInput.includes('@') ? [...bccList, bccInput.trim()] : bccList;
      const r = await apiFetch(
        apiUrl(`/customers/${customerId}/documents/${report.id}/schedule-email`),
        {
          method: 'POST',
          authUser: currentUser as never,
          body: JSON.stringify({
            // השעה נבחרת מקומית ונשלחת ב-UTC, כי השרת רץ ב-UTC.
            sendAt: when.toISOString(),
            documentName: report.name,
            to: to[0],
            toList: to,
            cc,
            bcc,
            subject,
            body,
            customerName: customerName || '',
            includeSignature,
            signatureId: includeSignature ? signatureId : undefined,
            requestReadReceipt,
            requestDeliveryReceipt,
          }),
        },
      );
      if (r.ok) {
        setStatus(`תוזמן ל-${fmtWhen(when)} ✓`);
        setSchedulingOpen(false);
        setSendAt('');
        await loadScheduled();
        onSent?.();
      } else {
        let msg = 'תזמון השליחה נכשל';
        try {
          const e = await r.json();
          if (e?.message) msg = Array.isArray(e.message) ? e.message.join(', ') : e.message;
        } catch {
          /* ignore */
        }
        setErr(msg);
        setStatus('');
      }
    } catch {
      setErr('תזמון השליחה נכשל');
      setStatus('');
    } finally {
      setSending(false);
    }
  };

  const cancelScheduled = async (jobId: string) => {
    try {
      await apiFetch(apiUrl(`/customers/${customerId}/scheduled-emails/${jobId}`), {
        method: 'DELETE',
        authUser: currentUser as never,
      });
      await loadScheduled();
    } catch {
      setErr('ביטול התזמון נכשל');
    }
  };

  if (!open) return null;
  // SSR guard: portals need a DOM. On the server `document` is undefined.
  if (typeof document === 'undefined') return null;

  const sigImage = (() => {
    const s = signatures.find((x) => x.id === signatureId);
    return s ? `data:${s.imageType || 'image/png'};base64,${s.dataBase64}` : null;
  })();

  const chipBox =
    'flex flex-wrap items-center gap-2 rounded-xl border border-gray-300 px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100';

  // Render via a portal to <body> so the full-screen overlay is never trapped
  // inside a positioned/transformed ancestor (the "דוחות שהופקו" section sits
  // deep in the customer card; a `fixed` child there was being clipped to the
  // component box instead of covering the viewport).
  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !sending && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-7 shadow-2xl max-h-[92vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-3 border-b border-gray-100 pb-4 text-2xl font-bold text-gray-800">
          <Mail size={24} className="text-blue-500" /> שליחת דוח במייל
        </div>

        <div className="space-y-5">
          {/* ── הדוח לשליחה (מצורף כבר) ── */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">הדוח לשליחה</label>
            <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2.5">
              <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
              <span className="truncate text-sm font-medium text-slate-700">{report?.name || '—'}</span>
            </div>
          </div>

          {/* ── נמענים ── */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              אל <span className="font-normal text-gray-400">(Enter כדי להוסיף נמען)</span>
            </label>
            <div className={chipBox}>
              {toList.map((em) => (
                <span
                  key={em}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-sm text-blue-800"
                  dir="ltr"
                >
                  {em}
                  <button
                    type="button"
                    className="text-base text-blue-500 hover:text-blue-700"
                    onClick={() => removeRecipient(em, 'to')}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                dir="ltr"
                className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-base outline-none text-right"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addRecipients(toInput, 'to');
                  } else if (e.key === 'Backspace' && !toInput && toList.length) {
                    removeRecipient(toList[toList.length - 1], 'to');
                  }
                }}
                onBlur={() => toInput.includes('@') && addRecipients(toInput, 'to')}
                placeholder={toList.length ? 'נמען נוסף…' : 'customer@example.com'}
              />
            </div>
            {/* בחירת נמען מתוך אנשי הקשר של הלקוח. הבחירה מוסיפה לרשימת הנמענים
                ולא מחליפה אותה — דוח נשלח לא פעם לכמה אנשים באותה חברה. */}
            {contactOptions.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addRecipients(e.target.value, 'to');
                }}
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-blue-400"
              >
                <option value="">הוסף מאנשי הקשר של הלקוח…</option>
                {contactOptions.map((c) => (
                  <option key={c.id} value={c.email}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── CC ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">עותק (CC)</label>
              {!!employees.length && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCcDropdownOpen((p) => !p)}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    עובדי החברה <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ccDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {ccDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setCcDropdownOpen(false)} />
                      <div className="absolute left-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                        {employees.map((u) => {
                          const checked = ccList.includes(u.email);
                          return (
                            <button
                              type="button"
                              key={u.id}
                              onClick={() => setCcList((p) => (checked ? p.filter((e) => e !== u.email) : Array.from(new Set([...p, u.email]))))}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                                {checked && <Check className="h-3 w-3 text-white" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-bold text-gray-700">{u.name}</div>
                                <div className="truncate text-[11px] text-gray-400" dir="ltr">{u.email}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className={chipBox}>
              {ccList.map((em) => (
                <span
                  key={em}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700"
                  dir="ltr"
                >
                  {em}
                  <button
                    type="button"
                    className="text-base text-gray-400 hover:text-gray-600"
                    onClick={() => removeRecipient(em, 'cc')}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                dir="ltr"
                className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-base outline-none text-right"
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addRecipients(ccInput, 'cc');
                  } else if (e.key === 'Backspace' && !ccInput && ccList.length) {
                    removeRecipient(ccList[ccList.length - 1], 'cc');
                  }
                }}
                onBlur={() => ccInput.includes('@') && addRecipients(ccInput, 'cc')}
                placeholder="הוסף עותק…"
              />
            </div>
          </div>

          {/* ── BCC (עותק מוסתר) ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">
                עותק מוסתר (BCC) <span className="font-normal text-gray-400">(הנמענים לא רואים זה את זה)</span>
              </label>
              {!!employees.length && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setBccDropdownOpen((p) => !p)}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    עובדי החברה <ChevronDown className={`h-3.5 w-3.5 transition-transform ${bccDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {bccDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setBccDropdownOpen(false)} />
                      <div className="absolute left-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                        {employees.map((u) => {
                          const checked = bccList.includes(u.email);
                          return (
                            <button
                              type="button"
                              key={u.id}
                              onClick={() => setBccList((p) => (checked ? p.filter((e) => e !== u.email) : Array.from(new Set([...p, u.email]))))}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                                {checked && <Check className="h-3 w-3 text-white" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-bold text-gray-700">{u.name}</div>
                                <div className="truncate text-[11px] text-gray-400" dir="ltr">{u.email}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className={chipBox}>
              {bccList.map((em) => (
                <span
                  key={em}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700"
                  dir="ltr"
                >
                  {em}
                  <button
                    type="button"
                    className="text-base text-gray-400 hover:text-gray-600"
                    onClick={() => removeRecipient(em, 'bcc')}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                dir="ltr"
                className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-base outline-none text-right"
                value={bccInput}
                onChange={(e) => setBccInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addRecipients(bccInput, 'bcc');
                  } else if (e.key === 'Backspace' && !bccInput && bccList.length) {
                    removeRecipient(bccList[bccList.length - 1], 'bcc');
                  }
                }}
                onBlur={() => bccInput.includes('@') && addRecipients(bccInput, 'bcc')}
                placeholder="הוסף עותק מוסתר…"
              />
            </div>
          </div>

          {/* ── נושא + ניסוח AI ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">נושא</label>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => void draft()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiBusy ? 'מנסח…' : 'נסח לי מייל'}
              </button>
            </div>
            <input
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={aiBusy && !subject ? '✨ מנסח…' : 'נושא המייל'}
            />
          </div>

          {/* ── גוף ── */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">תוכן ההודעה</label>
            <textarea
              rows={9}
              className="w-full resize-y rounded-xl border border-gray-300 px-3 py-2.5 text-base leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                aiBusy && !body ? '✨ מנסח מייל: מצורף הדוח שהופק עבורכם…' : 'כתוב את תוכן המייל, או לחץ ׳נסח לי מייל׳'
              }
            />
          </div>

          {/* ── בקשת שינוי מ-AI ── */}
          <div className="flex gap-2">
            <input
              className="h-11 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="✨ בקש מ-AI לשנות: ׳יותר קצר׳, ׳תוסיף שנשמח לפגישה׳…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && aiInstruction.trim() && !aiBusy) {
                  const i = aiInstruction;
                  setAiInstruction('');
                  void draft(i);
                }
              }}
            />
            <button
              type="button"
              disabled={aiBusy || !aiInstruction.trim()}
              onClick={() => {
                const i = aiInstruction;
                setAiInstruction('');
                void draft(i);
              }}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {aiBusy ? 'מעדכן…' : 'עדכן'}
            </button>
          </div>

          {/* ── חתימה אישית ── */}
          {signatures.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
                <input type="checkbox" className="h-5 w-5 accent-blue-500" checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)} />
                כלול תמונת חתימה
              </label>
              {includeSignature && signatures.length > 1 && (
                <div className="mt-2 flex items-center gap-2.5">
                  <label className="shrink-0 text-sm font-medium text-gray-700">תמונת חתימה:</label>
                  <select
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                    value={signatureId}
                    onChange={(e) => setSignatureId(e.target.value)}
                  >
                    {signatures.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              )}
              {includeSignature && sigImage && (
                <img src={sigImage} alt="חתימה" className="mt-3 max-h-32 max-w-[360px]" />
              )}
            </div>
          )}

          {/* ── אישור קריאה / מסירה (Microsoft Graph read/delivery receipt) ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-3">
            <div className="mb-2 text-sm font-semibold text-gray-700">אישור קריאה / מסירה</div>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                  checked={requestReadReceipt}
                  onChange={(e) => setRequestReadReceipt(e.target.checked)}
                />
                <span>
                  <span className="font-medium">אישור קריאה</span>
                  <span className="text-gray-400"> — קבלת התראה כשהנמען פותח את המייל</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                  checked={requestDeliveryReceipt}
                  onChange={(e) => setRequestDeliveryReceipt(e.target.checked)}
                />
                <span>
                  <span className="font-medium">אישור מסירה</span>
                  <span className="text-gray-400"> — קבלת התראה כשהמייל מגיע לתיבת הנמען</span>
                </span>
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
              שים לב: אישור קריאה תלוי בתוכנת המייל של הנמען וייתכן שיסרב לשלוח אותו. אישור מסירה אמין יותר.
            </p>
          </div>
        </div>

        {/* ── שליחות שממתינות בתור ── */}
        {scheduled.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <Clock className="h-4 w-4" />
              ממתין לשליחה
            </div>
            <ul className="space-y-1">
              {scheduled.map((job) => (
                <li key={job.id} className="flex items-center gap-2 text-sm text-amber-900">
                  <span className="font-medium">{fmtWhen(job.sendAt)}</span>
                  <span className="text-amber-700">← {job.to}</span>
                  <button
                    type="button"
                    className="ms-auto rounded-md px-2 py-0.5 text-xs font-medium text-amber-800 underline hover:bg-amber-100"
                    onClick={() => void cancelScheduled(job.id)}
                  >
                    ביטול
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {err && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</div>}
        {status && !err && <div className="mt-4 text-sm font-medium text-emerald-600">{status}</div>}

        {/* ── בחירת מועד — נפתחת רק כשמבקשים לתזמן ── */}
        {schedulingOpen && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <label className="text-sm font-semibold text-gray-700">מועד השליחה</label>
            <input
              type="datetime-local"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            {sendAt && <span className="text-sm text-gray-500">{fmtWhen(new Date(sendAt))}</span>}
            <button
              type="button"
              disabled={!canSend || !sendAt}
              className="ms-auto rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              onClick={() => void schedule()}
            >
              {sending ? 'מתזמן…' : 'אישור תזמון'}
            </button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          {allTo.length === 0 && <span className="me-auto text-sm text-gray-400">הזן נמען כדי לשלוח</span>}
          <button
            type="button"
            disabled={sending}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-medium hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
          >
            ביטול
          </button>
          {/* התזמון משתמש בטופס כפי שהוא ברגע האישור — אותו מייל, מועד אחר. */}
          <button
            type="button"
            disabled={sending}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-6 py-3 text-base font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            onClick={() => {
              setErr('');
              setSchedulingOpen((v) => !v);
            }}
          >
            <Clock className="h-4 w-4" />
            {schedulingOpen ? 'סגור תזמון' : 'תזמון שליחה'}
          </button>
          <button
            type="button"
            disabled={!canSend}
            className="rounded-xl bg-blue-500 px-10 py-3 text-base font-bold text-white hover:bg-blue-600 disabled:opacity-50"
            onClick={() => void send()}
          >
            {sending ? 'שולח…' : '✉️ שלח דוח'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
