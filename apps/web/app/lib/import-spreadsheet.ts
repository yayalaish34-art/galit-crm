import * as XLSX from 'xlsx';

export function normalizeEmail(value: string) {
  return (value || '').toString().trim().toLowerCase();
}

export function validateEmail(value: string) {
  const v = (value || '').toString().trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function normalizeIsraeliPhoneDigits(value: string) {
  const digits = (value || '').toString().replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
}

export function formatIsraeliPhone(value: string) {
  const digits = normalizeIsraeliPhoneDigits(value);
  if (!digits) return null;
  if ((digits.startsWith('05') || digits.startsWith('07')) && digits.length === 10) {
    const area = digits.slice(0, 3);
    const rest = digits.slice(3);
    return `${area}-${rest}`;
  }
  // 09 (השרון — נתניה/הרצליה/רעננה/כפר סבא) חסר כאן וגרם ל"טלפון לא תקין" בייבוא.
  const landlinePrefixes = ['02', '03', '04', '08', '09'];
  if (landlinePrefixes.some((p) => digits.startsWith(p)) && digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return null;
}

export function parseSpreadsheetFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return file.arrayBuffer().then((buf) => {
    const lower = file.name.toLowerCase();
    let wb: XLSX.WorkBook;
    if (lower.endsWith('.csv')) {
      const text = new TextDecoder('utf-8').decode(buf);
      wb = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string' });
    } else {
      wb = XLSX.read(buf, { type: 'array' });
    }
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    const filtered = data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
    if (filtered.length === 0) return { headers: [], rows: [] };
    const headers = (filtered[0] as unknown[]).map((h) => String(h).trim());
    const rows = filtered.slice(1).map((row) => {
      const r = row as unknown[];
      return headers.map((_, i) => String(r[i] ?? '').trim());
    });
    return { headers, rows };
  });
}

export function getCell(row: string[], headers: string[], columnName: string): string {
  if (!columnName) return '';
  const idx = headers.indexOf(columnName);
  if (idx < 0) return '';
  return String(row[idx] ?? '').trim();
}
