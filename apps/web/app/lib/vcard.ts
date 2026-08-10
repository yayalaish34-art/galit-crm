/**
 * ייצוא איש קשר כקובץ vCard (.vcf) — להורדה ופתיחה בתוכנה שעל המחשב
 * (Outlook, אנשי הקשר של Windows, הטלפון).
 *
 * שתי החלטות שאינן מובנות מאליהן, ושתיהן בגלל Outlook לחלונות:
 *   1. **BOM בתחילת הקובץ.** בלעדיו Outlook קורא את הקובץ כ-ANSI והעברית
 *      נפתחת כג'יבריש. ה-BOM הוא מה שגורם לו לזהות UTF-8.
 *   2. **איש קשר אחד לקובץ.** Outlook לשולחן העבודה מייבא רק את הכרטיס
 *      הראשון בקובץ שמכיל כמה — ולכן ייצוא מרובה חייב להיות קובץ לכל אחד,
 *      אחרת השאר נעלמים בשקט.
 *
 * סופי שורה הם CRLF כנדרש ב-RFC 2426. שורות ארוכות אינן מקופלות בכוונה:
 * הקיפול נספר באוקטטים, ואות עברית היא שני אוקטטים — קיפול לא זהיר חותך
 * תו באמצע. כל הלקוחות הרלוונטיים מקבלים שורות ארוכות.
 */

export type VCardContact = {
  fullName: string;
  roleTitle?: string | null;
  phone?: string | null;
  mobile?: string | null;
  fax?: string | null;
  email?: string | null;
  notes?: string | null;
};

/** פרטי הארגון שאיש הקשר שייך אליו — נכנסים לכרטיס כדי שיהיה שימושי בפני עצמו. */
export type VCardOrg = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  website?: string | null;
};

/** תווים בעלי משמעות תחבירית ב-vCard חייבים בריחה, אחרת הערך נחתך. */
function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .trim();
}

/**
 * פיצול שם מלא ל-N (משפחה;פרטי). המילה הראשונה היא השם הפרטי והשאר משפחה —
 * נכון לעברית ("ישראל בן דוד"). שם במילה אחת נשאר כשם פרטי בלבד.
 */
function splitName(fullName: string): { given: string; family: string } {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { given: '', family: '' };
  if (parts.length === 1) return { given: parts[0], family: '' };
  return { given: parts[0], family: parts.slice(1).join(' ') };
}

/** בונה את תוכן ה-vCard (ללא BOM). מיוצא בנפרד כדי לאפשר בדיקה. */
export function buildVCard(contact: VCardContact, org?: VCardOrg): string {
  const fullName = String(contact.fullName || '').trim() || 'איש קשר';
  const { given, family } = splitName(fullName);
  const orgName = String(org?.name || '').trim();

  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${esc(family)};${esc(given)};;;`);
  lines.push(`FN:${esc(fullName)}`);
  // בלקוח פרטי שם הלקוח זהה לשם איש הקשר — ORG כזה רק מכפיל את השם בכרטיס.
  if (orgName && orgName !== fullName) lines.push(`ORG:${esc(orgName)}`);
  if (contact.roleTitle) lines.push(`TITLE:${esc(contact.roleTitle)}`);
  if (contact.mobile) lines.push(`TEL;TYPE=CELL,VOICE:${esc(contact.mobile)}`);
  if (contact.phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(contact.phone)}`);
  if (contact.fax) lines.push(`TEL;TYPE=WORK,FAX:${esc(contact.fax)}`);
  if (contact.email) lines.push(`EMAIL;TYPE=INTERNET,PREF:${esc(contact.email)}`);
  if (org?.address || org?.city) {
    // ADR: תיבה;דירה;רחוב;עיר;אזור;מיקוד;מדינה
    lines.push(`ADR;TYPE=WORK:;;${esc(org.address)};${esc(org.city)};;;`);
  }
  if (org?.website) lines.push(`URL:${esc(org.website)}`);
  if (contact.notes) lines.push(`NOTE:${esc(contact.notes)}`);
  lines.push(`REV:${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
  lines.push('END:VCARD');

  return lines.join('\r\n') + '\r\n';
}

/** שם קובץ בטוח לחלונות — תווים אסורים בנתיב מוחלפים. */
function safeFileName(name: string): string {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'contact').slice(0, 80);
}

/** מוריד את איש הקשר כקובץ .vcf. לחיצה כפולה עליו מוסיפה אותו ל-Outlook. */
export function downloadContactVCard(contact: VCardContact, org?: VCardOrg): void {
  const content = buildVCard(contact, org);
  // '﻿' — ה-BOM שגורם ל-Outlook לזהות UTF-8 ולהציג עברית תקינה.
  const blob = new Blob(['﻿', content], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(contact.fullName)}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // שחרור מושהה — Safari זקוק ל-URL עוד רגע אחרי הלחיצה.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
