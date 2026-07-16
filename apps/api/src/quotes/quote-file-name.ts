/**
 * בונה את השם הקנוני של מסמך/קובץ הצעת מחיר, בפורמט אחיד בכל המערכת:
 *   "{שם לקוח/חברה} - הצעת מחיר ל: {שם השירות} - {כתובת}"
 * השם *תמיד* מכיל "ל: {שירות}" (לבקשת המשתמש — לעולם לא להציג שם בלי
 * שם השירות). אם אין שם שירות כלל — נופל חזרה למילה "שירות".
 * הכתובת נוספת בסוף רק אם היא קיימת; בלעדיה השם מסתיים בשירות כמו קודם.
 *
 * שם הלקוח/חברה: quote.customerName, ואם ריק — שם הלקוח מהיחס (quote.customer.name).
 * שם השירות: תיאור הפריט הראשון (quoteItems לפי rowOrder), עם נפילה-חזרה
 * ל-lineItemsJson ואז ל-quote.service.
 * הכתובת: quote.addressSummary, ואם ריק — הכתובת מהיחס (quote.customer.address).
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
  const address = clean(quote?.addressSummary) || clean(quote?.customer?.address);
  const name = `${customer} - הצעת מחיר ל: ${firstItem}${address ? ` - ${address}` : ''}`;
  return name.slice(0, 120).trim();
}
