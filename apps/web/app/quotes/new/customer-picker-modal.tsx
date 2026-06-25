'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Search as SearchIcon, X, Plus } from 'lucide-react';
import { apiUrl, apiFetch } from '../../lib/api-base';

/* ── types ─────────────────────────────────────────────────────────────── */
type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  contactName: string | null;
};

export type { CustomerRow };

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (c: CustomerRow) => void;
};

/* ── auth helper — reads session stored by the main app ─────────────────── */
function getAuthUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('galit-crm-session');
    if (!raw) return null;
    const s = JSON.parse(raw) as { id?: string; role?: string };
    if (!s?.id || !s?.role) return null;
    return { id: s.id, role: String(s.role).toUpperCase() };
  } catch {
    return null;
  }
}

/* ── overlay style constants ───────────────────────────────────────────── */
const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.40)',
  zIndex: 9000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const DIALOG: React.CSSProperties = {
  background: '#fff',
  width: 580,
  maxHeight: '78vh',
  borderRadius: 4,
  border: '1px solid #a0a0a0',
  boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  direction: 'rtl',
};

const HEADER: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  padding: '5px 10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
  fontSize: 13,
  fontWeight: 'bold',
};

/* ──────────────────────────────────────────────────────────────────────── */
export function CustomerPickerModal({ open, onClose, onSelect }: Props) {
  const [mode, setMode] = useState<'search' | 'create'>('search');

  /* search state */
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  /* create form state */
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCity, setNewCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  /* ── search ── */
  const doSearch = useCallback(async (term: string) => {
    setLoading(true);
    setSearchError('');
    try {
      const url = apiUrl(`/customers/paged?q=${encodeURIComponent(term)}&page=1&limit=40`);
      const res = await apiFetch(url, { authUser: getAuthUser() });
      if (!res.ok) throw new Error('שגיאה בטעינת לקוחות');
      const json = await res.json();
      /* API returns { data: [...], total, page, limit } */
      setCustomers(Array.isArray(json) ? json : (json.data ?? json.items ?? []));
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, []);

  /* reload list when modal opens */
  useEffect(() => {
    if (!open) return;
    setMode('search');
    setQ('');
    setSearchError('');
    setNewName(''); setNewPhone(''); setNewEmail(''); setNewCity('');
    setSaveError('');
    doSearch('');
  }, [open, doSearch]);

  /* debounced search on q change */
  useEffect(() => {
    if (!open || mode !== 'search') return;
    const t = setTimeout(() => doSearch(q), 280);
    return () => clearTimeout(t);
  }, [q, open, mode, doSearch]);

  /* ── create new customer ── */
  async function handleCreate() {
    if (!newName.trim()) { setSaveError('שם לקוח הוא שדה חובה'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const body: Record<string, string> = { name: newName.trim() };
      if (newPhone.trim()) body.phone = newPhone.trim();
      if (newEmail.trim()) body.email = newEmail.trim();
      if (newCity.trim()) body.city = newCity.trim();

      const res = await apiFetch(apiUrl('/customers'), {
        method: 'POST',
        authUser: getAuthUser(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err?.message || 'שגיאה ביצירת לקוח');
      }
      const created = await res.json() as CustomerRow & { [k: string]: unknown };
      onSelect({
        id: created.id,
        name: created.name,
        phone: (created.phone as string | null) ?? null,
        email: (created.email as string | null) ?? null,
        city: (created.city as string | null) ?? null,
        contactName: (created.contactName as string | null) ?? null,
      });
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  /* ── render ── */
  return (
    <div style={OVERLAY} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={DIALOG}>

        {/* ── header ── */}
        <div style={HEADER}>
          <span>{mode === 'create' ? 'לקוח חדש' : 'בחירת לקוח'}</span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', padding: 2, lineHeight: 1 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ══════════════ SEARCH MODE ══════════════ */}
        {mode === 'search' && (
          <>
            {/* toolbar: search + new customer button */}
            <div style={{ padding: '7px 10px', borderBottom: '1px solid #d4d4d4', display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr', flex: 1, border: '1px solid #b8b8b8', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ececec', borderLeft: '1px solid #b8b8b8' }}>
                  <SearchIcon size={12} color="#555" />
                </div>
                <input
                  autoFocus
                  placeholder="חיפוש לפי שם, טלפון, עיר, מייל..."
                  style={{ height: 26, border: 'none', padding: '0 7px', fontSize: 12, outline: 'none', background: '#fff', textAlign: 'right' }}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setMode('create')}
                style={{ height: 28, padding: '0 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <Plus size={12} />
                לקוח חדש
              </button>
            </div>

            {/* customer list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading && (
                <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: '#777' }}>טוען...</div>
              )}
              {searchError && (
                <div style={{ padding: 12, fontSize: 12, color: '#c00', textAlign: 'right' }}>{searchError}</div>
              )}
              {!loading && !searchError && customers.length === 0 && (
                <div style={{ padding: 14, fontSize: 12, color: '#888', textAlign: 'center' }}>לא נמצאו לקוחות</div>
              )}
              {!loading && customers.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#2563eb', color: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
                      {['שם לקוח', 'טלפון', 'מייל', 'עיר'].map((h) => (
                        <th key={h} style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 'normal', fontSize: 11, borderLeft: '1px solid #4a88c0', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c, i) => (
                      <tr
                        key={c.id}
                        onClick={() => onSelect(c)}
                        style={{ background: i % 2 === 0 ? '#fff' : '#f4f7fb', cursor: 'pointer' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#dbeafe'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? '#fff' : '#f4f7fb'; }}
                      >
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #e8e8e8', fontWeight: 500 }}>{c.name}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #e8e8e8', direction: 'ltr', textAlign: 'right' }}>{c.phone ?? ''}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #e8e8e8', direction: 'ltr', textAlign: 'right' }}>{c.email ?? ''}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #e8e8e8' }}>{c.city ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ══════════════ CREATE MODE ══════════════ */}
        {mode === 'create' && (
          <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 14, marginTop: 0 }}>
              מלא פרטי לקוח חדש. לאחר השמירה הלקוח יתווסף אוטומטית להצעה.
            </p>
            {(
              [
                { label: 'שם לקוח', required: true, val: newName, set: setNewName, ph: 'שם מלא / חברה' },
                { label: 'טלפון',   required: false, val: newPhone, set: setNewPhone, ph: '050-0000000' },
                { label: 'מייל',    required: false, val: newEmail, set: setNewEmail, ph: 'example@company.com' },
                { label: 'עיר',     required: false, val: newCity,  set: setNewCity,  ph: 'תל אביב, חיפה...' },
              ] as { label: string; required: boolean; val: string; set: (v: string) => void; ph: string }[]
            ).map(({ label, required, val, set, ph }) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', columnGap: 10, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#4b4b4b', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {label}{required && <span style={{ color: '#c00', marginRight: 2 }}>*</span>}
                </span>
                <input
                  style={{ height: 26, border: '1px solid #b8b8b8', padding: '0 7px', fontSize: 12, outline: 'none', borderRadius: 2, textAlign: 'right' }}
                  placeholder={ph}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                />
              </div>
            ))}

            {saveError && (
              <div style={{ fontSize: 12, color: '#c00', marginBottom: 10, padding: '4px 8px', background: '#fff0f0', border: '1px solid #fcc', borderRadius: 2 }}>
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, borderTop: '1px solid #e8e8e8', paddingTop: 12 }}>
              <button
                type="button"
                onClick={() => { setMode('search'); setSaveError(''); }}
                style={{ height: 28, padding: '0 16px', border: '1px solid #c0c0c0', background: '#f3f3f3', fontSize: 12, cursor: 'pointer', borderRadius: 3 }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                style={{ height: 28, padding: '0 16px', background: saving ? '#7aabcf' : '#2563eb', color: '#fff', border: 'none', fontSize: 12, cursor: saving ? 'default' : 'pointer', borderRadius: 3, fontWeight: 500 }}
              >
                {saving ? 'שומר...' : 'שמור לקוח'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
