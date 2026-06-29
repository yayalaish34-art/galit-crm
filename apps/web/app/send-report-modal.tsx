'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Upload, Loader2, FileText, Sparkles, X } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

type TaskLike = {
  id: string;
  customerId?: string | null;
  customerName?: string | null;
  leadName?: string | null;
  projectName?: string | null;
  type?: string | null;
};

type SignatureRec = { id: string; title: string; dataBase64: string; imageType?: string };

type AttachedReport = {
  documentId: string | null; // set when saved to the customer card
  name: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result);
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

/**
 * טופס "צרף דוח ושלח במייל" לשלב הביצוע — מקביל לטופס "שלח במייל" של הצעת המחיר:
 * צירוף הדוח (נשמר אוטומטית בכרטיס הלקוח כ-REPORT), נמענים + עותק, ניסוח AI או ידני,
 * תמונת חתימה, ושליחה דרך ה-Outlook. בשליחה מוצלחת המשימה מסומנת DONE (דרך onSent).
 */
export function SendReportModal({
  open,
  onClose,
  task,
  currentUser,
  defaultEmail,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  task: TaskLike;
  currentUser: { id?: string; name?: string } & Record<string, unknown>;
  defaultEmail?: string;
  onSent: () => void;
}) {
  const customerId = task.customerId || null;
  const inputRef = useRef<HTMLInputElement>(null);

  const [attached, setAttached] = useState<AttachedReport | null>(null);
  const [attaching, setAttaching] = useState(false);

  const [toList, setToList] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [ccList, setCcList] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');

  const [signatures, setSignatures] = useState<SignatureRec[]>([]);
  const [includeSignature, setIncludeSignature] = useState(false);
  const [signatureId, setSignatureId] = useState('');

  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');

  // אתחול בעת פתיחה
  useEffect(() => {
    if (!open) return;
    setErr('');
    setStatus('');
    setToList(defaultEmail && defaultEmail.includes('@') ? [defaultEmail.trim()] : []);
    // טעינת חתימות המשתמש
    const uid = currentUser?.id;
    if (uid) {
      void (async () => {
        try {
          const r = await apiFetch(apiUrl(`/users/${uid}/signatures`), { authUser: currentUser as never });
          if (r.ok) {
            const list: SignatureRec[] = await r.json();
            setSignatures(Array.isArray(list) ? list : []);
            if (list?.length) {
              setSignatureId(list[0].id);
              setIncludeSignature(true);
            }
          }
        } catch {
          /* silent */
        }
      })();
    }
  }, [open, defaultEmail, currentUser]);

  const addRecipients = useCallback((raw: string, which: 'to' | 'cc') => {
    const emails = raw.split(/[,\s]+/).map((e) => e.trim()).filter((e) => e.includes('@'));
    if (!emails.length) return;
    if (which === 'to') {
      setToList((p) => Array.from(new Set([...p, ...emails])));
      setToInput('');
    } else {
      setCcList((p) => Array.from(new Set([...p, ...emails])));
      setCcInput('');
    }
  }, []);

  const removeRecipient = (em: string, which: 'to' | 'cc') => {
    if (which === 'to') setToList((p) => p.filter((x) => x !== em));
    else setCcList((p) => p.filter((x) => x !== em));
  };

  // צירוף הדוח — נשמר אוטומטית בכרטיס הלקוח (documentType=REPORT) אם יש לקוח משויך
  const onPick = async (file: File) => {
    setAttaching(true);
    setErr('');
    try {
      const b64 = await readFileAsBase64(file);
      let documentId: string | null = null;
      if (customerId) {
        const r = await apiFetch(apiUrl(`/customers/${customerId}/documents`), {
          method: 'POST',
          authUser: currentUser as never,
          body: JSON.stringify({
            name: file.name,
            documentType: 'REPORT',
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            dataBase64: b64,
          }),
        });
        if (r.ok) {
          const doc = await r.json();
          documentId = doc?.id || null;
          setStatus('הדוח נשמר בכרטיס הלקוח ✓');
        } else {
          setErr('שמירת הדוח בכרטיס הלקוח נכשלה — עדיין ניתן לשלוח במייל');
        }
      }
      setAttached({
        documentId,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: b64,
        sizeBytes: file.size,
      });
    } catch {
      setErr('צירוף הדוח נכשל');
    } finally {
      setAttaching(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAttachment = () => {
    setAttached(null);
    setStatus('');
  };

  const draft = async (instruction?: string) => {
    setAiBusy(true);
    setErr('');
    try {
      const r = await apiFetch(apiUrl('/ai-mail/report-draft'), {
        method: 'POST',
        authUser: currentUser as never,
        body: JSON.stringify({
          customerName: task.customerName || '',
          contactName: task.leadName || task.customerName || '',
          projectName: task.projectName || '',
          serviceName: task.type || '',
          reportName: attached?.name || '',
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
  };

  const allTo = toInput.includes('@') ? [...toList, toInput.trim()] : toList;
  const canSend = !!attached && allTo.length > 0 && !sending;

  const send = async () => {
    if (!attached) {
      setErr('יש לצרף דוח לפני השליחה');
      return;
    }
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
      const r = await apiFetch(apiUrl(`/tasks/${task.id}/send-report-email`), {
        method: 'POST',
        authUser: currentUser as never,
        body: JSON.stringify({
          documentId: attached.documentId || undefined,
          attachment: attached.documentId
            ? undefined
            : { fileName: attached.name, mimeType: attached.mimeType, dataBase64: attached.dataBase64 },
          to: to[0],
          toList: to,
          cc,
          subject,
          body,
          includeSignature,
          signatureId: includeSignature ? signatureId : undefined,
          customerName: task.customerName || '',
        }),
      });
      if (r.ok) {
        setStatus('נשלח ✓');
        onSent();
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

  if (!open) return null;

  const sigImage = (() => {
    const s = signatures.find((x) => x.id === signatureId);
    return s ? `data:${s.imageType || 'image/png'};base64,${s.dataBase64}` : null;
  })();

  const chipBox =
    'flex flex-wrap items-center gap-2 rounded-xl border border-gray-300 px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100';

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4"
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
          {/* ── צירוף הדוח ── */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">הדוח לשליחה</label>
            {attached ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
                  <span className="truncate text-sm font-medium text-slate-700">{attached.name}</span>
                </div>
                <button type="button" onClick={removeAttachment} className="shrink-0 text-gray-400 hover:text-red-500" aria-label="הסר">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-white px-3 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 ${
                  attaching ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {attaching ? 'מצרף…' : 'צרף דוח (PDF / Word)'}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  disabled={attaching}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPick(f);
                  }}
                />
              </label>
            )}
            {customerId && (
              <div className="mt-1 text-[11px] text-slate-400">הדוח נשמר אוטומטית ב"דוחות שהופקו" בכרטיס הלקוח.</div>
            )}
          </div>

          {/* ── נמענים ── */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              אל <span className="font-normal text-gray-400">(Enter כדי להוסיף נמען)</span>
            </label>
            <div className={chipBox}>
              {toList.map((em) => (
                <span key={em} className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-sm text-blue-800" dir="ltr">
                  {em}
                  <button type="button" className="text-base text-blue-500 hover:text-blue-700" onClick={() => removeRecipient(em, 'to')}>×</button>
                </span>
              ))}
              <input
                dir="ltr"
                className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-base outline-none text-right"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipients(toInput, 'to'); }
                  else if (e.key === 'Backspace' && !toInput && toList.length) removeRecipient(toList[toList.length - 1], 'to');
                }}
                onBlur={() => toInput.includes('@') && addRecipients(toInput, 'to')}
                placeholder={toList.length ? 'נמען נוסף…' : 'customer@example.com'}
              />
            </div>
          </div>

          {/* ── CC ── */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">עותק (CC)</label>
            <div className={chipBox}>
              {ccList.map((em) => (
                <span key={em} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700" dir="ltr">
                  {em}
                  <button type="button" className="text-base text-gray-400 hover:text-gray-600" onClick={() => removeRecipient(em, 'cc')}>×</button>
                </span>
              ))}
              <input
                dir="ltr"
                className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-base outline-none text-right"
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipients(ccInput, 'cc'); }
                  else if (e.key === 'Backspace' && !ccInput && ccList.length) removeRecipient(ccList[ccList.length - 1], 'cc');
                }}
                onBlur={() => ccInput.includes('@') && addRecipients(ccInput, 'cc')}
                placeholder="הוסף עותק…"
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
              placeholder="נושא המייל"
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
              placeholder="כתוב את תוכן המייל, או לחץ ׳נסח לי מייל׳"
            />
          </div>

          {/* ── בקשת שינוי מ-AI ── */}
          <div className="flex gap-2">
            <input
              className="h-11 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="✨ בקש מ-AI לשנות: ׳יותר קצר׳, ׳תוסיף שנשמח לפגישה׳…"
              onKeyDown={(e) => { if (e.key === 'Enter' && aiInstruction.trim() && !aiBusy) { const i = aiInstruction; setAiInstruction(''); void draft(i); } }}
            />
            <button
              type="button"
              disabled={aiBusy || !aiInstruction.trim()}
              onClick={() => { const i = aiInstruction; setAiInstruction(''); void draft(i); }}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {aiBusy ? 'מעדכן…' : 'עדכן'}
            </button>
          </div>

          {/* ── חתימה ── */}
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
        </div>

        {err && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</div>}
        {status && !err && <div className="mt-4 text-sm font-medium text-emerald-600">{status}</div>}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          {!attached && <span className="me-auto text-sm text-gray-400">צרף דוח והזן נמען כדי לשלוח</span>}
          <button
            type="button"
            disabled={sending}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-medium hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
          >
            ביטול
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
    </div>
  );
}
