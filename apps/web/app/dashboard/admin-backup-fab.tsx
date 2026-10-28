'use client';
import { useState } from 'react';
import { apiFetch, apiUrl } from '../lib/api-base';

/**
 * כפתור צף של "ייצוא כל הדוחות ל-ZIP" + טריגר ידני לגיבוי טבלת הלקוחות.
 * ADMIN בלבד; מוצג בתחתית-ימין של הדשבורד כפתור קטן שלא מפריע, לחיצה פותחת תפריט.
 * ה-ZIP נבנה בשרת (BackupService.exportAllReportsAsZip) ומגיע כקובץ להורדה.
 */

type AppUser = { id: string; role?: string; name?: string };

function toAuth(u: AppUser | null): { id: string; role: string } | undefined {
  if (!u) return undefined;
  return { id: u.id, role: String(u.role || 'ADMIN') };
}

export function AdminBackupFab({ currentUser }: { currentUser: AppUser | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'reports' | 'customer'>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isAdmin = (currentUser?.role || '').toUpperCase() === 'ADMIN';
  if (!isAdmin) return null;

  async function downloadReports() {
    setBusy('reports');
    setMsg('מכין ZIP של כל הדוחות — זה יכול לקחת זמן לפי כמות הדוחות…');
    try {
      const r = await apiFetch(apiUrl('/backup/reports/export-all'), { authUser: toAuth(currentUser) });
      if (!r?.ok) throw new Error(`בקשה נכשלה (${r?.status ?? '?'})`);
      const stats = (() => {
        try { return JSON.parse(r.headers.get('X-Backup-Stats') || 'null'); } catch { return null; }
      })();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `galit-reports-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (stats) {
        const mb = Math.round((stats.totalBytes || 0) / (1024 * 1024));
        setMsg(
          `הורדה החלה · ${stats.filesIncluded} דוחות · ${stats.customersWithReports} לקוחות · ${mb} MB`,
        );
      } else {
        setMsg('ההורדה החלה');
      }
    } catch (e) {
      setMsg(`כשל: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function triggerCustomerBackup() {
    setBusy('customer');
    setMsg('מריץ גיבוי של טבלת הלקוחות ל-OneDrive…');
    try {
      const r = await apiFetch(apiUrl('/backup/customer/run'), { method: 'POST', authUser: toAuth(currentUser) });
      if (!r?.ok) throw new Error(`בקשה נכשלה (${r?.status ?? '?'})`);
      const data = (await r.json().catch(() => null)) as { fileName?: string; rowCount?: number; error?: string } | null;
      if (data?.error) setMsg(`הגיבוי נכשל: ${data.error}`);
      else if (data) setMsg(`גיבוי הצליח · ${data.fileName} · ${data.rowCount?.toLocaleString('he-IL') ?? '?'} רשומות`);
      else setMsg('גיבוי הסתיים');
    } catch (e) {
      setMsg(`כשל: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setMsg(null); }}
          aria-label="כלי גיבוי"
          title="גיבויים (אדמין)"
          style={{
            position: 'fixed',
            bottom: 20,
            insetInlineEnd: 20,
            width: 50,
            height: 50,
            borderRadius: 999,
            background: 'linear-gradient(135deg,#1d7a3d,#8cc63f)',
            color: '#fff',
            border: 0,
            fontSize: 22,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(29,122,61,.35)',
            zIndex: 9050,
          }}
        >
          🗄️
        </button>
      )}

      {/* Sheet */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 10050,
            padding: 16,
          }}
        >
          <div
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: '20px 22px 18px',
              maxWidth: 460,
              width: '100%',
              boxShadow: '0 20px 60px rgba(15,23,42,.35)',
              border: '2px solid #1d7a3d',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#15532a' }}>
                🗄️ גיבויים (אדמין)
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגור"
                style={{ background: 'transparent', border: 0, fontSize: 22, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}
              >×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={downloadReports}
                disabled={busy !== null}
                style={{
                  background: 'linear-gradient(135deg,#1d7a3d,#8cc63f)',
                  color: '#fff',
                  border: 0,
                  padding: '12px 14px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.65 : 1,
                  boxShadow: '0 6px 18px rgba(29,122,61,.3)',
                  textAlign: 'start',
                }}
              >
                {busy === 'reports' ? '📦 מכין ZIP…' : '📦 ייצוא כל הדוחות (ZIP)'}
              </button>

              <button
                type="button"
                onClick={triggerCustomerBackup}
                disabled={busy !== null}
                style={{
                  background: '#fff',
                  border: '1.5px solid #1d7a3d',
                  color: '#1d7a3d',
                  padding: '11px 14px',
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.65 : 1,
                  textAlign: 'start',
                }}
              >
                {busy === 'customer' ? '💾 מגבה…' : '💾 הפעל גיבוי לקוחות (SQL ל-OneDrive)'}
              </button>
            </div>

            {msg && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: msg.startsWith('כשל') || msg.includes('נכשל') ? '#fef2f2' : '#f0fdf4',
                  color: msg.startsWith('כשל') || msg.includes('נכשל') ? '#991b1b' : '#065f46',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  border: `1px solid ${msg.startsWith('כשל') || msg.includes('נכשל') ? '#fecaca' : '#bbf7d0'}`,
                }}
              >
                {msg}
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', lineHeight: 1.55 }}>
              <strong>ZIP דוחות:</strong> כל קבצי ה-DOCX/PDF שמצורפים לדוחות ב-Document.dataBase64, עם _INDEX.csv בשורש.<br />
              <strong>גיבוי לקוחות:</strong> דאמפ SQL של כל טבלת Customer ל-OneDrive בתיקיית CRM-Backups/.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
