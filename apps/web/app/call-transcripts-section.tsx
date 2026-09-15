'use client';

import { useCallback, useEffect, useState } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, Loader2, FileText, RefreshCw, ChevronDown } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

/**
 * תמלולי שיחות — רכיב אחד שמשרת גם את כרטיס הלקוח וגם את רכיב המשימה.
 *
 * אותן שיחות מוצגות בשני מקומות שונים בתכלית: טאב רחב בכרטיס הלקוח, ועמודה
 * צרה בת 248px במשימה. משתי סיבות זה עדיין רכיב אחד ולא שניים — התמלול הוא
 * אותו מידע, ושני עותקים שלו נוטים להיפרד (אחד מקבל תיקון והשני לא). מה שמשתנה
 * הוא הצפיפות בלבד, ולכן `compact` הוא הבדל של עיצוב, לא של תוכן.
 *
 * הטקסט המלא מקופל כברירת מחדל: שיחה מתומללת היא פסקאות שלמות, ורשימה שפורשת
 * את כולן הופכת בלתי קריאה כבר בשלוש שיחות.
 */

export interface CallRecording {
  id: string;
  phone: string;
  direction: string;
  startedAt: string;
  durationSec: number;
  agentName?: string | null;
  transcriptStatus: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'SKIPPED';
  transcript?: string | null;
  transcriptError?: string | null;
  customerId?: string | null;
  taskId?: string | null;
}

/** תווית הסטטוס בעברית + הצבע שלה. */
const STATUS_LABEL: Record<CallRecording['transcriptStatus'], { text: string; color: string; bg: string }> = {
  PENDING: { text: 'ממתין לתמלול', color: '#a16207', bg: '#fef9c3' },
  PROCESSING: { text: 'מתמלל…', color: '#1d4ed8', bg: '#dbeafe' },
  DONE: { text: 'תומלל', color: '#15803d', bg: '#dcfce7' },
  FAILED: { text: 'התמלול נכשל', color: '#b91c1c', bg: '#fee2e2' },
  SKIPPED: { text: 'ללא הקלטה', color: '#475569', bg: '#f1f5f9' },
};

/** משך בפורמט מ:שש — שניות גולמיות אינן נקראות. */
function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CallTranscriptsSection({
  customerId,
  taskId,
  currentUser,
  compact = false,
}: {
  /** כרטיס הלקוח: כל שיחות הלקוח. */
  customerId?: string | null;
  /** רכיב המשימה: רק שיחות המשימה. אחד מהשניים חייב להימסר. */
  taskId?: string | null;
  currentUser?: any;
  /** תצוגה צפופה לעמודה הצרה של המשימה. */
  compact?: boolean;
}) {
  const [calls, setCalls] = useState<CallRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const scope = taskId ? `task/${taskId}` : customerId ? `customer/${customerId}` : '';

  const load = useCallback(async () => {
    if (!scope) { setCalls([]); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(apiUrl(`/call-recordings/${scope}`), { authUser: currentUser });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCalls(Array.isArray(data) ? data : []);
    } catch {
      setError('טעינת השיחות נכשלה');
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [scope, currentUser]);

  useEffect(() => { void load(); }, [load]);

  /** תמלול יזום — גם ניסיון חוזר אחרי כישלון. */
  const transcribe = async (id: string) => {
    setBusyId(id);
    try {
      const res = await apiFetch(apiUrl(`/call-recordings/${id}/transcribe`), {
        method: 'POST',
        authUser: currentUser,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'התמלול נכשל');
      }
      await load();
      setOpenId(id);
    } catch (e: any) {
      setError(e?.message || 'התמלול נכשל');
      // הסטטוס על השורה התעדכן בשרת גם בכישלון — טוענים כדי להראות אותו.
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const pad = compact ? 8 : 12;
  const font = compact ? 11 : 13;

  if (loading && calls.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: font, padding: pad }}>
        <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
        טוען שיחות…
      </div>
    );
  }

  return (
    <div style={{ direction: 'rtl' }}>
      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: 8, fontSize: font - 1, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {calls.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: font, padding: compact ? '8px 0' : 16, textAlign: compact ? 'right' : 'center' }}>
          אין שיחות מוקלטות{taskId ? ' למשימה זו' : ' ללקוח זה'}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {calls.map((call) => {
            const status = STATUS_LABEL[call.transcriptStatus] ?? STATUS_LABEL.PENDING;
            const open = openId === call.id;
            const Icon = call.direction === 'OUT' ? PhoneOutgoing : PhoneIncoming;
            return (
              <div
                key={call.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  background: '#fff',
                  padding: pad,
                  fontSize: font,
                }}
              >
                {/* שורת הכותרת: כיוון, מתי, משך, סטטוס */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Icon style={{ width: 13, height: 13, color: call.direction === 'OUT' ? '#2563eb' : '#16a34a', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatWhen(call.startedAt)}</span>
                  <span style={{ color: '#64748b' }}>{formatDuration(call.durationSec)}</span>
                  <span
                    style={{
                      marginRight: 'auto',
                      background: status.bg,
                      color: status.color,
                      borderRadius: 999,
                      padding: '1px 8px',
                      fontSize: font - 2,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {status.text}
                  </span>
                </div>

                <div style={{ color: '#64748b', fontSize: font - 2, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Phone style={{ width: 10, height: 10 }} />
                    {call.phone}
                  </span>
                  {call.agentName && <span>{call.agentName}</span>}
                </div>

                {/* הטקסט עצמו — מקופל, כדי ששיחה ארוכה לא תבלע את הרשימה */}
                {call.transcriptStatus === 'DONE' && call.transcript && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : call.id)}
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: '#2563eb',
                        fontSize: font - 1,
                        fontWeight: 700,
                      }}
                    >
                      <FileText style={{ width: 11, height: 11 }} />
                      {open ? 'הסתר תמלול' : 'הצג תמלול'}
                      <ChevronDown
                        style={{ width: 11, height: 11, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                      />
                    </button>
                    {open && (
                      <div
                        style={{
                          marginTop: 6,
                          background: '#f8fafc',
                          borderRadius: 8,
                          padding: 8,
                          color: '#334155',
                          fontSize: font - 1,
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          maxHeight: compact ? 220 : 420,
                          overflowY: 'auto',
                        }}
                      >
                        {call.transcript}
                      </div>
                    )}
                  </>
                )}

                {call.transcriptStatus === 'FAILED' && call.transcriptError && (
                  <div style={{ marginTop: 5, color: '#b91c1c', fontSize: font - 2 }}>{call.transcriptError}</div>
                )}

                {/* תמלול יזום — למה שממתין ולמה שנכשל */}
                {(call.transcriptStatus === 'PENDING' || call.transcriptStatus === 'FAILED') && (
                  <button
                    type="button"
                    onClick={() => void transcribe(call.id)}
                    disabled={busyId === call.id}
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      borderRadius: 8,
                      border: '1px solid #bfdbfe',
                      background: '#eff6ff',
                      color: '#2563eb',
                      padding: '4px 10px',
                      fontSize: font - 1,
                      fontWeight: 700,
                      cursor: busyId === call.id ? 'default' : 'pointer',
                      opacity: busyId === call.id ? 0.6 : 1,
                    }}
                  >
                    {busyId === call.id ? (
                      <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <RefreshCw style={{ width: 11, height: 11 }} />
                    )}
                    {call.transcriptStatus === 'FAILED' ? 'נסה לתמלל שוב' : 'תמלל עכשיו'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
