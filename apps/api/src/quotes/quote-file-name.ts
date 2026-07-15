/**
 * בונה את השם הקנוני של מסמך/קובץ הצעת מחיר, בפורמט אחיד בכל המערכת:
 *   "{שם לקוח/חברה} - הצעת מחיר ל: {שם השירות}"
 * השם *תמיד* מסתיים ב-"ל: {שירות}" (לבקשת המשתמש — לעולם לא להציג שם בלי
 * שם השירות בסוף). אם אין שם שירות כלל — נופל חזרה למילה "שירות".
 *
 * שם הלקוח/חברה: quote.customerName, ואם ריק — שם הלקוח מהיחס (quote.customer.name).
 * שם השירות: תיאור הפריט הראשון (quoteItems לפי rowOrder), עם נפילה-חזרה
 * ל-lineItemsJson ואז ל-quote.service.
 *
 * ללא סיומת קובץ וללא מזהה ייחודי — הקוראים מוסיפים .docx/.pdf בעצמם.
 * נחתך ל-120 תווים (uploadEditable חותך בכל מקרה); מונע שמות ענק אם התיאור ארוך.
 */
export function buildQuoteDocName(quote: any): string {
  const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const customer = clean(quote?.customerName) || clean(quote?.customer?.name) || 'לקוח';
  const firstItem =
    clean(quote?.quoteItems?.[0]?.productDescription) ||
    clean(
      Array.isArray(quote?.lineItemsJson)
        ? (quote.lineItemsJson[0]?.productDescription ??
            quote.lineItemsJson[0]?.description ??
            quote.lineItemsJson[0]?.name)
        : '',
    ) ||
    clean(quote?.service) ||
    'שירות';
  const name = `${customer} - הצעת מחיר ל: ${firstItem}`;
  return name.slice(0, 120).trim();
}
