/**
 * בלוק אישור החתימה שנצרב בכל הצעת מחיר ממוזגת — ממוקם מיד אחרי שורת "תוקף ההצעה":
 *
 *   1) פסקת אישור (3 משפטים):
 *      "בחתימתי מטה אני מאשר כי קראתי את ההצעה, הבנתי את תוכנה ואני מסכים לכל תנאיה. …"
 *   2) טבלת חתימה בת 4 עמודות (RTL):
 *      ┌──────────────────────┬──────┬────────┬────────┐
 *      │ שם מלא של מאשר ההצעה  │ ת.ז  │ חתימה  │ חותמת  │
 *      ├──────────────────────┼──────┼────────┼────────┤
 *      │                      │      │        │        │  ← שורה ריקה למילוי ידני
 *      └──────────────────────┴──────┴────────┴────────┘
 *
 * הפורמט (נוסח + מבנה הטבלה) הועתק מקובץ הדוגמה של המשתמש (הצעת מחיר לדוגמא.pdf).
 * הבלוק עטוף בפסקאות-סימון בלתי-נראות (GALITSIGTABLE) כדי לזהות ולהסיר אותו במדויק
 * בזרימת החתימה הדיגיטלית (שם נצרב כפתור "לחץ כאן לחתימה" במקום הטבלה הפיזית).
 */

/** מזהה ייחודי לבלוק טבלת החתימה — מאפשר איתור והסרה מדויקים. */
export const SIGNATURE_TABLE_MARKER = 'GALITSIGTABLE';

/** run של כותרת עמודה (David מודגש, 16pt, RTL). keepNext בפסקה כדי שלא תיפרד מהשורה הבאה. */
function headerCell(text: string, width: number): string {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>` +
    '<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/><w:rtl/></w:rPr></w:pPr>' +
    `<w:r><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/><w:rtl/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`
  );
}

/** תא ריק (שורת המילוי) בגובה נדיב. */
function emptyCell(width: number): string {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>` +
    '<w:p><w:pPr><w:jc w:val="both"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:rtl/></w:rPr></w:pPr></w:p></w:tc>'
  );
}

/**
 * טבלת החתימה בת 4 עמודות (RTL). סדר העמודות בכיוון קריאה (ימין→שמאל):
 * שם מלא של מאשר ההצעה · ת.ז · חתימה · חותמת. ב-OOXML הסדר הוא שמאל→ימין,
 * ולכן בגלל bidiVisual הסדר הפיזי מתהפך — כותבים חותמת·חתימה·ת.ז·שם כדי שיוצג נכון.
 */
function signatureTableXml(): string {
  // רוחב עמודות (dxa): שם רחב יותר, ת.ז צר, חתימה/חותמת בינוני. סה"כ ~10322.
  const wName = 3400, wId = 1400, wSign = 2760, wStamp = 2760;
  const grid =
    `<w:tblGrid><w:gridCol w:w="${wStamp}"/><w:gridCol w:w="${wSign}"/><w:gridCol w:w="${wId}"/><w:gridCol w:w="${wName}"/></w:tblGrid>`;
  const borders =
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>';
  const tblPr =
    '<w:tblPr><w:bidiVisual/><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>' +
    borders +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>';
  // שורת כותרות — סדר ה-OOXML הפוך (חותמת ראשון) בגלל bidiVisual. cantSplit כדי שלא תישבר.
  const headerRow =
    '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' +
    headerCell('חותמת', wStamp) +
    headerCell('חתימה', wSign) +
    headerCell('ת.ז', wId) +
    headerCell('שם מלא של מאשר ההצעה', wName) +
    '</w:tr>';
  // שורת מילוי ריקה בגובה ~1.6 ס"מ.
  const fillRow =
    '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="900"/></w:trPr>' +
    emptyCell(wStamp) + emptyCell(wSign) + emptyCell(wId) + emptyCell(wName) +
    '</w:tr>';
  return `<w:tbl>${tblPr}${grid}${headerRow}${fillRow}</w:tbl>`;
}

/** פסקת האישור (3 משפטים) — מודגשת, מיושרת לשני הצדדים, David 12pt, RTL. */
function approvalParagraph(): string {
  const l1 = 'בחתימתי מטה אני מאשר כי קראתי את ההצעה, הבנתי את תוכנה ואני מסכים לכל תנאיה.';
  const l2 =
    'ככל שההצעה מאושרת בשם חברה או תאגיד, אני מצהיר כי אני מוסמך לחייב את החברה בהתקשרות זו. בנוסף, אני ערב באופן אישי, מלא ובלתי חוזר, לקיום כל התחייבויות החברה ולתשלום מלוא הסכומים המגיעים לגלית החברה לאיכות הסביבה בע"מ בהתאם להצעה זו.';
  const l3 = 'במקרה של חברה, יש לצרף חותמת החברה לצד חתימת מורשה החתימה.';
  const rpr = '<w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl/></w:rPr>';
  const run = (t: string) =>
    `<w:r>${rpr}<w:t xml:space="preserve">${t}</w:t></w:r>` + `<w:r>${rpr}<w:br/></w:r>`;
  // keepNext — הפסקה נשארת צמודה לטבלה שאחריה (לא נפרדות בין עמודים).
  return (
    '<w:p><w:pPr><w:keepNext/><w:bidi/><w:jc w:val="both"/>' +
    '<w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl/></w:rPr></w:pPr>' +
    run(l1) + run(l2) +
    `<w:r>${rpr}<w:t xml:space="preserve">${l3}</w:t></w:r>` +
    '</w:p>'
  );
}

/**
 * פסקת-סימון בלתי-נראית (טקסט לבן, גודל 2) שמסמנת את גבולות בלוק החתימה.
 * מכילה את SIGNATURE_TABLE_MARKER כדי שאפשר יהיה לאתר ולהסיר את הבלוק כולו.
 */
function markerParagraph(): string {
  return (
    '<w:p><w:pPr><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="2"/><w:szCs w:val="2"/><w:vanish/></w:rPr></w:pPr>' +
    `<w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="2"/><w:szCs w:val="2"/><w:vanish/></w:rPr><w:t>${SIGNATURE_TABLE_MARKER}</w:t></w:r></w:p>`
  );
}

/** פסקת רווח קטנה (כדי שהבלוק לא יידבק לשורת "תוקף ההצעה"). */
const SPACER_PARAGRAPH = '<w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr></w:p>';

/**
 * הבלוק המלא: סימון → רווח → פסקת אישור → טבלה → סימון.
 * אין פסקת-רווח בין פסקת האישור לטבלה — כדי ש-keepNext יחבר ביניהן ישירות וישמור אותן
 * יחד באותו עמוד. אם אין מקום, Word דוחף את שתיהן יחד לעמוד הבא.
 */
function buildBlock(): string {
  return (
    markerParagraph() +
    SPACER_PARAGRAPH +
    approvalParagraph() +
    signatureTableXml() +
    markerParagraph()
  );
}

/**
 * מוצא את סוף פסקת ה-"תוקף ההצעה" (ה-</w:p> הראשון אחרי הטקסט). מחזיר את המיקום שאחרי
 * ה-</w:p>, או -1 אם אין. זהו נקודת ההזרקה המועדפת — הבלוק נכנס מיד אחרי שורת התוקף.
 */
function afterValidityParagraph(documentXml: string): number {
  const idx = documentXml.indexOf('תוקף ההצעה');
  if (idx === -1) return -1;
  const close = documentXml.indexOf('</w:p>', idx);
  if (close === -1) return -1;
  return close + '</w:p>'.length;
}

/**
 * מוסיף את בלוק אישור החתימה מיד אחרי שורת "תוקף ההצעה". אם השורה לא נמצאת — נופל חזרה
 * להזרקה לפני ה-<w:sectPr> האחרון (סוף גוף המסמך). אידמפוטנטי (לא מוסיף פעמיים).
 */
export function appendSignatureTable(documentXml: string): string {
  if (documentXml.includes(SIGNATURE_TABLE_MARKER)) return documentXml;

  // מסתירים את הסמן הפנימי "SIGNATUREHERE" מהפלט הרגיל — הוא נועד רק לזרימת החתימה
  // הדיגיטלית אך נצרב כטקסט גלוי בהמרת ה-PDF. הטבלה הפיזית מחליפה את תפקידו בהצעה רגילה.
  let xml = stripSignatureMarkerText(documentXml);

  const block = buildBlock();

  const afterValidity = afterValidityParagraph(xml);
  if (afterValidity !== -1) {
    return xml.slice(0, afterValidity) + block + xml.slice(afterValidity);
  }

  // נפילה-חזרה: לפני ה-<w:sectPr> האחרון (הגדרות העמוד), אחרת לפני </w:body>.
  const bodySectPr = xml.lastIndexOf('<w:sectPr');
  const bodyEnd = xml.lastIndexOf('</w:body>');
  if (bodySectPr !== -1 && (bodyEnd === -1 || bodySectPr < bodyEnd)) {
    return xml.slice(0, bodySectPr) + block + xml.slice(bodySectPr);
  }
  if (bodyEnd !== -1) {
    return xml.slice(0, bodyEnd) + block + xml.slice(bodyEnd);
  }
  return xml; // מבנה לא צפוי — לא נוגעים
}

/**
 * מסתיר את הטקסט "SIGNATUREHERE" (סמן מיקום החתימה הדיגיטלית) מ-document.xml, כדי שלא
 * ייצרב כטקסט גלוי בהמרת ה-PDF. מסיר את ה-<w:r> שמכיל את הטקסט (הפסקה נשארת, ריקה).
 * תומך גם בפיצול-runs (SIGNATURE...HERE בכמה tags) ע"י הסרת הטקסט בלבד כנפילה-חזרה.
 */
function stripSignatureMarkerText(documentXml: string): string {
  let out = documentXml;
  // הסרת ה-run השלם שמכיל את הטקסט הרציף.
  const runRe = /<w:r\b[^>]*>(?:(?!<\/w:r>).)*?SIGNATUREHERE(?:(?!<\/w:r>).)*?<\/w:r>/gs;
  out = out.replace(runRe, '');
  // נפילה-חזרה: אם הטקסט שרד (פוצל בין tags) — מסירים את התו הרציף עצמו.
  if (out.includes('SIGNATUREHERE')) out = out.split('SIGNATUREHERE').join('');
  return out;
}

/**
 * מסיר את בלוק אישור החתימה (פסקאות-סימון + הרווח + פסקת האישור + הטבלה) מ-document.xml.
 * משמש בזרימת החתימה הדיגיטלית — שם נצרב כפתור "לחץ כאן לחתימה" במקום הבלוק הפיזי.
 * מזהה את הבלוק לפי שתי פסקאות-הסימון; אם לא נמצא — מחזיר את המסמך כמות-שהוא.
 */
export function stripSignatureTable(documentXml: string): string {
  if (!documentXml.includes(SIGNATURE_TABLE_MARKER)) return documentXml;

  const first = documentXml.indexOf(SIGNATURE_TABLE_MARKER);
  const second = documentXml.indexOf(SIGNATURE_TABLE_MARKER, first + SIGNATURE_TABLE_MARKER.length);
  if (first === -1 || second === -1) return documentXml;

  // תחילת הפסקה הפותחת: "<w:p>"/"<w:p " בלבד (לא "<w:pPr" שהוא קידומת) — אחרת ההסרה
  // מתחילה מאוחר מדי ומשאירה תג פתיחה תלוי.
  const pOpenBare = documentXml.lastIndexOf('<w:p>', first);
  const pOpenAttr = documentXml.lastIndexOf('<w:p ', first);
  const blockStart = Math.max(pOpenBare, pOpenAttr);
  const closeAfterSecond = documentXml.indexOf('</w:p>', second);
  if (blockStart === -1 || closeAfterSecond === -1) return documentXml;
  const blockEnd = closeAfterSecond + '</w:p>'.length;

  return documentXml.slice(0, blockStart) + documentXml.slice(blockEnd);
}

/**
 * מסיר את בלוק החתימה מ-buffer של קובץ DOCX שלם (פותח ZIP, מנקה את document.xml, סוגר).
 * משמש בזרימת החתימה הדיגיטלית לפני ההמרה ל-PDF. best-effort — אם הקובץ אינו DOCX תקין
 * או שאין בלוק, מחזיר את ה-buffer המקורי בלי לזרוק.
 */
export function stripSignatureTableFromDocx(docx: Buffer): Buffer {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PizZip = require('pizzip');
    const zip = new PizZip(docx);
    const file = zip.file('word/document.xml');
    if (!file) return docx;
    const xml = file.asText();
    if (!xml.includes(SIGNATURE_TABLE_MARKER)) return docx;
    zip.file('word/document.xml', stripSignatureTable(xml));
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch {
    return docx;
  }
}
