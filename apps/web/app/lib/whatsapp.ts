/**
 * בניית קישורי WhatsApp אחידים לכל המערכת.
 *
 * למה wa.me ולא web.whatsapp.com:
 *   web.whatsapp.com/send פותח *טאב חדש* של WhatsApp Web שנטען מאפס בכל פעם — ובמחשב
 *   זה השאיר טאב ריק/טוען וגרם לפתיחה מחדש של WhatsApp בכל שליחה. wa.me מעביר את הפנייה
 *   ל-handler של מערכת ההפעלה: אם מותקנת אפליקציית WhatsApp Desktop היא נפתחת עם הצ'אט
 *   הקיים (בלי לטעון מחדש), ולא נשאר טאב ריק תקוע. לכן wa.me עדיף גם למחשב וגם לנייד.
 */

/** ניקוי מספר ישראלי לפורמט בינלאומי לוואטסאפ: 0501234567 → 972501234567, בלי '+' וספרות בלבד. */
export function toWhatsAppPhone(raw?: string | null): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/**
 * קישור WhatsApp לפתיחה ב-window.open / href.
 * - עם מספר → wa.me/<phone> (מעביר לאפליקציית WhatsApp Desktop הקיימת, בלי לטעון WhatsApp Web מחדש).
 * - בלי מספר → wa.me/?text (בורר נמען).
 */
export function whatsAppLink(phone?: string | null, text?: string): string {
  const wa = toWhatsAppPhone(phone);
  const t = text ? encodeURIComponent(text) : '';
  if (wa) {
    return `https://wa.me/${wa}${t ? `?text=${t}` : ''}`;
  }
  return `https://wa.me/${t ? `?text=${t}` : ''}`;
}
