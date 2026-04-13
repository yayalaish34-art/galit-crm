'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

export type QuoteLookupRow = { id: string; label: string; subLabel?: string };

type Props = {
  open: boolean;
  title: string;
  rows: QuoteLookupRow[];
  onClose: () => void;
  /** `null` = clear selection */
  onSelect: (row: QuoteLookupRow | null) => void;
  allowClear?: boolean;
  clearLabel?: string;
  emptyMessage?: string;
};

const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.40)',
  zIndex: 9000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const DIALOG: React.CSSProperties = {
  background: '#fff',
  width: 520,
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
  background: '#2d6ea3',
  color: '#fff',
  padding: '5px 10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
  fontSize: 13,
  fontWeight: 'bold',
};

function rowMatches(row: QuoteLookupRow, q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  if (row.label.includes(t)) return true;
  if (row.subLabel && row.subLabel.includes(t)) return true;
  const tl = t.toLowerCase();
  if (row.label.toLowerCase().includes(tl)) return true;
  if (row.subLabel && row.subLabel.toLowerCase().includes(tl)) return true;
  return false;
}

export function QuoteLookupModal({
  open,
  title,
  rows,
  onClose,
  onSelect,
  allowClear = true,
  clearLabel = '— ללא בחירה —',
  emptyMessage = 'אין רשומות להצגה',
}: Props) {
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ('');
  }, [open]);

  const filtered = useMemo(() => rows.filter((r) => rowMatches(r, q)), [rows, q]);

  if (!open) return null;

  return (
    <div
      style={OVERLAY}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={DIALOG}>
        <div style={HEADER}>
          <span>{title}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              padding: 2,
              lineHeight: 1,
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div
          style={{
            padding: '7px 10px',
            borderBottom: '1px solid #d4d4d4',
            display: 'flex',
            gap: 6,
            flexShrink: 0,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '26px 1fr',
              flex: 1,
              border: '1px solid #b8b8b8',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ececec',
                borderLeft: '1px solid #b8b8b8',
              }}
            >
              <SearchIcon size={12} color="#555" />
            </div>
            <input
              autoFocus
              placeholder="חיפוש..."
              style={{
                height: 26,
                border: 'none',
                padding: '0 7px',
                fontSize: 12,
                outline: 'none',
                background: '#fff',
                textAlign: 'right',
              }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 120 }}>
          {allowClear ? (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              style={{
                width: '100%',
                textAlign: 'right',
                padding: '8px 12px',
                border: 'none',
                borderBottom: '1px solid #e8e8e8',
                background: '#f9f9f9',
                fontSize: 12,
                cursor: 'pointer',
                color: '#555',
              }}
            >
              {clearLabel}
            </button>
          ) : null}
          {rows.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: '#666', textAlign: 'center' }}>{emptyMessage}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: '#666', textAlign: 'center' }}>לא נמצאו תוצאות</div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelect(r);
                  onClose();
                }}
                style={{
                  width: '100%',
                  textAlign: 'right',
                  padding: '8px 12px',
                  border: 'none',
                  borderBottom: '1px solid #eee',
                  background: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'block',
                }}
              >
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                {r.subLabel ? <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{r.subLabel}</div> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
