/**
 * טבלת החתימה הפיזית שנצרבת בתחתית כל הצעת מחיר ממוזגת:
 *
 *   ┌─────────────────────────────┬─────────┬─────────┐
 *   │ שם מלא של מאשר ההצעה         │ חתימה   │ חותמת   │
 *   ├─────────────────────────────┼─────────┼─────────┤
 *   │                             │         │         │  ← שורה ריקה למילוי ידני
 *   └─────────────────────────────┴─────────┴─────────┘
 *
 * ה-OOXML הועתק אות-באות מקובץ הדוגמה של המשתמש (new table.doc) — טבלת RTL (bidiVisual),
 * 3 עמודות, פונט David מודגש, כותרות בגודל 20pt. סביבו עוטפים פסקאות-סימון (marker) כדי
 * שאפשר יהיה לזהות ולהסיר את הבלוק במדויק בזרימת החתימה הדיגיטלית (שם נצרב כפתור במקום).
 */

/** מזהה ייחודי לבלוק טבלת החתימה — מאפשר איתור והסרה מדויקים. */
export const SIGNATURE_TABLE_MARKER = 'GALITSIGTABLE';

/** טבלת החתימה עצמה (OOXML גולמי מקובץ הדוגמה). */
const SIGNATURE_TABLE_XML =
  '<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="0" w:type="auto"/><w:tblInd w:w="360" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="3441"/><w:gridCol w:w="3441"/><w:gridCol w:w="3440"/></w:tblGrid><w:tr w:rsidTr="00CF334D"><w:tc><w:tcPr><w:tcW w:w="3560" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:rtl/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:rtl/></w:rPr><w:t>שם מלא של מאשר ההצעה</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="3561" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:rtl/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:rtl/></w:rPr><w:t>חתימה</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="3561" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:rtl/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:rtl/></w:rPr><w:t>חותמת</w:t></w:r></w:p></w:tc></w:tr><w:tr w:rsidTr="00CF334D"><w:trPr><w:trHeight w:val="907"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="3560" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="both"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:u w:val="single"/><w:rtl/></w:rPr></w:pPr></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="3561" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="both"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:u w:val="single"/><w:rtl/></w:rPr></w:pPr></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="3561" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="both"/><w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:u w:val="single"/><w:rtl/></w:rPr></w:pPr></w:p></w:tc></w:tr></w:tbl>';

/**
 * פסקת-סימון בלתי-נראית (טקסט לבן, גודל 2) שמסמנת את גבולות בלוק טבלת החתימה.
 * מכילה את SIGNATURE_TABLE_MARKER כדי שאפשר יהיה לאתר ולהסיר את הבלוק כולו.
 */
function markerParagraph(): string {
  return (
    '<w:p><w:pPr><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr>' +
    `<w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:t>${SIGNATURE_TABLE_MARKER}</w:t></w:r></w:p>`
  );
}

/** פסקת רווח לפני הטבלה (כדי שלא תידבק לתוכן שמעליה). */
const SPACER_PARAGRAPH = '<w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr></w:p>';

/**
 * מוסיף את טבלת החתימה בסוף גוף המסמך — מיד לפני ה-<w:sectPr> האחרון (הגדרות העמוד),
 * או לפני </w:body> אם אין sectPr. הבלוק עטוף בפסקאות-סימון להסרה מדויקת בהמשך.
 * אידמפוטנטי: אם הטבלה כבר קיימת (המסמך עבר מיזוג פעמיים) — לא מוסיפים שוב.
 */
export function appendSignatureTable(documentXml: string): string {
  if (documentXml.includes(SIGNATURE_TABLE_MARKER)) return documentXml;

  const block = markerParagraph() + SPACER_PARAGRAPH + SIGNATURE_TABLE_XML + markerParagraph();

  // ה-<w:sectPr> האחרון בגוף המסמך הוא הגדרות-העמוד; יש לשמור אותו בסוף. מזריקים לפניו.
  const bodySectPr = documentXml.lastIndexOf('<w:sectPr');
  const bodyEnd = documentXml.lastIndexOf('</w:body>');
  if (bodySectPr !== -1 && (bodyEnd === -1 || bodySectPr < bodyEnd)) {
    return documentXml.slice(0, bodySectPr) + block + documentXml.slice(bodySectPr);
  }
  if (bodyEnd !== -1) {
    return documentXml.slice(0, bodyEnd) + block + documentXml.slice(bodyEnd);
  }
  return documentXml; // מבנה לא צפוי — לא נוגעים
}

/**
 * מסיר את בלוק טבלת החתימה (כולל פסקאות-הסימון והרווח) מ-document.xml. משמש בזרימת
 * החתימה הדיגיטלית — שם נצרב כפתור "לחץ כאן לחתימה" במקום הטבלה הפיזית.
 * מזהה את הבלוק לפי שתי פסקאות-הסימון שעוטפות אותו; אם לא נמצא — מחזיר את המסמך כמות-שהוא.
 */
export function stripSignatureTable(documentXml: string): string {
  if (!documentXml.includes(SIGNATURE_TABLE_MARKER)) return documentXml;

  // כל פסקת-סימון היא <w:p>…SIGNATURE_TABLE_MARKER…</w:p>. יש שתיים — לפני ואחרי הטבלה.
  // מוצאים את הפסקה הפותחת (הראשונה) ואת סוף הפסקה הסוגרת (השנייה), ומוחקים את הכל ביניהן.
  const first = documentXml.indexOf(SIGNATURE_TABLE_MARKER);
  const second = documentXml.indexOf(SIGNATURE_TABLE_MARKER, first + SIGNATURE_TABLE_MARKER.length);
  if (first === -1 || second === -1) return documentXml;

  // תחילת הפסקה הפותחת: הימנעות מ-"<w:pPr" (קידומת של "<w:p") — מחפשים פתיחת-פסקה ממשית
  // "<w:p>" או "<w:p " בלבד. אחרת ההסרה מתחילה מאוחר מדי ומשאירה "<w:p>" תלוי לפני ה-sectPr.
  const pOpenBare = documentXml.lastIndexOf('<w:p>', first);
  const pOpenAttr = documentXml.lastIndexOf('<w:p ', first);
  const blockStart = Math.max(pOpenBare, pOpenAttr);
  const closeAfterSecond = documentXml.indexOf('</w:p>', second);
  if (blockStart === -1 || closeAfterSecond === -1) return documentXml;
  const blockEnd = closeAfterSecond + '</w:p>'.length;

  return documentXml.slice(0, blockStart) + documentXml.slice(blockEnd);
}

/**
 * מסיר את טבלת החתימה מ-buffer של קובץ DOCX שלם (פותח ZIP, מנקה את document.xml, סוגר).
 * משמש בזרימת החתימה הדיגיטלית לפני ההמרה ל-PDF. best-effort — אם הקובץ אינו DOCX תקין
 * או שאין טבלה, מחזיר את ה-buffer המקורי בלי לזרוק.
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
