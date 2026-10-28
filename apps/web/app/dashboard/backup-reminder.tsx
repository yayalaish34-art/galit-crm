'use client';
import { useEffect, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/api-base';

/**
 * פופ-אפ "גיבוי לדיסקאון קי" — מופיע אוטומטית למנהל אחרי שהגיבוי החודשי
 * של טבלת הלקוחות עלה ל-OneDrive, ועד שהוא מאשר "הורדתי לדיסקאון קי".
 * מתחבר ל-`/backup/customer/latest`, `/backup/customer/download`, `/backup/customer/ack`.
 *
 * נראות: מוצג רק ל-ADMIN; רק אם ה-meta הוא לחודש הנוכחי ו-`acknowledgedAt == null`.
 * "אזכיר לי מאוחר יותר" מכבה את הפופ-אפ ל-24 שעות דרך localStorage (per-browser).
 */

type Meta = {
  createdAt: string;
  fileName: string;
  rowCount: number;
  byteSize: number;
  oneDriveWebUrl: string;
  oneDriveItemId: string;
  ownerUserId: string;
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
  error?: string | null;
};

type AppUser = { id: string; role?: string; name?: string };

/** Narrows a local AppUser to the ApiAuthUser shape apiFetch wants (both id+role required). */
function toAuth(u: AppUser | null): { id: string; role: string } | undefined {
  if (!u) return undefined;
  return { id: u.id, role: String(u.role || 'ADMIN') };
}

const SNOOZE_KEY = 'backup-reminder-snoozed-until';

function isSnoozed(): boolean {
  try {
    const s = localStorage.getItem(SNOOZE_KEY);
    if (!s) return false;
    return Date.now() < Number(s);
  } catch {
    return false;
  }
}

function snoozeFor24h() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
  } catch {
    /* ignore */
  }
}

function isCurrentMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function humanBytes(n: number): string {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupReminderPopup({ currentUser }: { currentUser: AppUser | null }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const isAdmin = (currentUser?.role || '').toUpperCase() === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(apiUrl('/backup/customer/latest'), { authUser: toAuth(currentUser) });
        if (cancelled) return;
        if (r?.ok) {
          const j = (await r.json().catch(() => null)) as Meta | null;
          setMeta(j);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, currentUser]);

  if (!isAdmin || !meta || hidden) return null;
  if (meta.acknowledgedAt) return null;
  if (!isCurrentMonth(meta.createdAt)) return null; // קובץ ישן — לא מציקים
  if (isSnoozed()) return null;

  const errored = !!meta.error;

  const download = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(apiUrl('/backup/customer/download'), { authUser: toAuth(currentUser) });
      if (!r?.ok) throw new Error(`download failed: ${r?.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      alert(`הורדה נכשלה: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const acknowledge = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(apiUrl('/backup/customer/ack'), {
        method: 'POST',
        authUser: toAuth(currentUser),
        body: JSON.stringify({ userId: currentUser?.id }),
      });
      if (!r?.ok) throw new Error(`ack failed: ${r?.status}`);
      setHidden(true);
    } catch (e) {
      alert(`לא ניתן לאשר: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const snoozeAndClose = () => {
    snoozeFor24h();
    setHidden(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10100,
        padding: 16,
      }}
    >
      <div
        dir="rtl"
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: '24px 24px 20px',
          maxWidth: 460,
          width: '100%',
          boxShadow: '0 20px 60px rgba(15,23,42,.3)',
          border: errored ? '2px solid #fbbf24' : '2px solid #1d7a3d',
        }}
      >
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 6 }} aria-hidden>
          {errored ? '⚠️' : '💾'}
        </div>
        <h3 style={{ textAlign: 'center', fontSize: 18, fontWeight: 900, margin: '2px 0 4px', color: errored ? '#92400e' : '#15532a' }}>
          {errored ? 'הגיבוי החודשי נכשל' : 'גיבוי חודשי של טבלת הלקוחות מוכן'}
        </h3>
        {errored ? (
          <>
            <p style={{ textAlign: 'center', fontSize: 13.5, color: '#78350f', lineHeight: 1.6, margin: '6px 0 14px' }}>
              {meta.error}
            </p>
            <div style={{ fontSize: 11.5, color: '#64748b', textAlign: 'center', marginBottom: 14 }}>
              בדוק שהמשתמש-מנהל מחובר ל-Microsoft (OneDrive) ושיש מספיק מקום.
            </div>
            <button
              onClick={snoozeAndClose}
              style={{
                width: '100%',
                background: '#fff',
                border: '1px solid #e2e8f0',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              אסתכל על זה אחר כך
            </button>
          </>
        ) : (
          <>
            <p style={{ textAlign: 'center', fontSize: 13.5, color: '#334155', lineHeight: 1.6, margin: '6px 0 14px' }}>
              הגיבוי האוטומטי של טבלת הלקוחות נשמר ב-OneDrive.<br />
              <strong>מומלץ להוריד עותק לדיסקאון קי</strong> ולשמור במקום בטוח.
            </p>

            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12.5,
                color: '#065f46',
                marginBottom: 14,
              }}
            >
              <div><strong>קובץ:</strong> {meta.fileName}</div>
              <div><strong>רשומות:</strong> {meta.rowCount.toLocaleString('he-IL')}</div>
              <div><strong>גודל:</strong> {humanBytes(meta.byteSize)}</div>
              <div><strong>נוצר:</strong> {new Date(meta.createdAt).toLocaleString('he-IL')}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={download}
                disabled={busy}
                style={{
                  background: 'linear-gradient(135deg,#1d7a3d,#8cc63f)',
                  color: '#fff',
                  border: 0,
                  padding: '12px 14px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  boxShadow: '0 6px 18px rgba(29,122,61,.3)',
                }}
              >
                ⬇ הורד את ה-SQL
              </button>

              <button
                onClick={acknowledge}
                disabled={busy}
                style={{
                  background: '#fff',
                  border: '1.5px solid #1d7a3d',
                  color: '#1d7a3d',
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                ✓ הורדתי לדיסקאון קי — אל תזכיר שוב החודש
              </button>

              <button
                onClick={snoozeAndClose}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: '#64748b',
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                אזכיר לי מחר
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
