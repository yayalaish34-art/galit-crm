/**
 * בניית קישורי WhatsApp אחידים לכל המערכת.
 *
 * למה web.whatsapp.com ולא wa.me:
 *   wa.me פותח דף ביניים ("Continue to Chat") שמנסה את *אפליקציית הדסקטופ* — ובמחשב
 *   הוא לרוב לא נכנס ישירות ל-WhatsApp Web הפתוח. web.whatsapp.com/send פותח ישירות
 *   את WhatsApp Web עם הצ'אט מוכן. הצוות עובד מהמחשב, ולכן דסקטופ קודם.
 *
 * בלי מספר יעד — web.whatsapp.com/send לא מציג בורר נמען טוב, אז נשארים על wa.me/?text
 * (בורר "בחר איש קשר"). זה המקרה היחיד שבו wa.me עדיף.
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
 * - עם מספר → web.whatsapp.com/send (נפתח ישירות ב-WhatsApp Web).
 * - בלי מספר → wa.me/?text (בורר נמען).
 */
export function whatsAppLink(phone?: string | null, text?: string): string {
  const wa = toWhatsAppPhone(phone);
  const t = text ? encodeURIComponent(text) : '';
  if (wa) {
    return `https://web.whatsapp.com/send?phone=${wa}${t ? `&text=${t}` : ''}`;
  }
  return `https://wa.me/${t ? `?text=${t}` : ''}`;
}
