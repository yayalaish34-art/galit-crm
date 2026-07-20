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
 * שם מלא של מאשר ההצעה · ת.ז · חתימה · חותמת.
 *
 * חשוב (תיקון סדר-עמודות הפוך): כותבים את התאים בסדר הטבעי (שם·ת.ז·חתימה·חותמת)
 * *בלי* <w:bidiVisual/>. bidiVisual מהפך את כיוון פריסת העמודות, ו-Word מכבד אותו
 * אך מנוע ההמרה ל-PDF *לא* — ולכן קודם, כשהתאים נכתבו הפוך והסתמכנו על bidiVisual,
 * ה-PDF יצא הפוך (חותמת·חתימה·ת.ז·שם). בלי bidiVisual שני המנועים מרנדרים את התאים
 * בסדר ה-OOXML כמות-שהוא → תמיד שם·ת.ז·חתימה·חותמת. הטבלה נשארת RTL ברמת הטקסט
 * (לכל run יש <w:rtl/> וה-jc ממורכז), רק כיוון פריסת העמודות מפסיק להתהפך.
 */
function signatureTableXml(): string {
  // רוחב עמודות (dxa): שם רחב יותר, ת.ז צר, חתימה/חותמת בינוני. סה"כ ~10322.
  const wName = 3400, wId = 1400, wSign = 2760, wStamp = 2760;
  // סדר טבעי בכיוון קריאה: שם · ת.ז · חתימה · חותמת.
  const grid =
    `<w:tblGrid><w:gridCol w:w="${wName}"/><w:gridCol w:w="${wId}"/><w:gridCol w:w="${wSign}"/><w:gridCol w:w="${wStamp}"/></w:tblGrid>`;
  const borders =
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>';
  // ללא <w:bidiVisual/> — מונע היפוך עמודות שלא נתמך אחיד בין Word למנוע ה-PDF.
  const tblPr =
    '<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>' +
    borders +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>';
  // שורת כותרות — בסדר הטבעי (שם ראשון). cantSplit כדי שלא תישבר.
  const headerRow =
    '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' +
    headerCell('שם מלא של מאשר ההצעה', wName) +
    headerCell('ת.ז', wId) +
    headerCell('חתימה', wSign) +
    headerCell('חותמת', wStamp) +
    '</w:tr>';
  // שורת מילוי ריקה בגובה ~1.6 ס"מ — באותו סדר עמודות.
  const fillRow =
    '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="900"/></w:trPr>' +
    emptyCell(wName) + emptyCell(wId) + emptyCell(wSign) + emptyCell(wStamp) +
    '</w:tr>';
  return `<w:tbl>${tblPr}${grid}${headerRow}${fillRow}</w:tbl>`;
}

/**
 * פסקת האישור — מודגשת, David 12pt, RTL. שלושת המשפטים הם *פסקאות נפרדות* (לא שורה
 * אחת עם <w:br/>). קריטי: מעבר-שורה ידני (<w:br/>) בשילוב justify גורם ל-Word למתוח
 * את השורה שלפני ה-break לרוחב מלא → "רווחים ענקיים בין המילים". פסקאות נפרדות פותרות
 * זאת כי Word לא מותח את השורה האחרונה של פסקה. כל פסקה מיושרת justify כמו במקור.
 */
function approvalParagraph(): string {
  const sentences = [
    'בחתימתי מטה אני מאשר כי קראתי את ההצעה, הבנתי את תוכנה ואני מסכים לכל תנאיה.',
    'ככל שההצעה מאושרת בשם חברה או תאגיד, אני מצהיר כי אני מוסמך לחייב את החברה בהתקשרות זו. בנוסף, אני ערב באופן אישי, מלא ובלתי חוזר, לקיום כל התחייבויות החברה ולתשלום מלוא הסכומים המגיעים לגלית החברה לאיכות הסביבה בע"מ בהתאם להצעה זו.',
    'במקרה של חברה, יש לצרף חותמת החברה לצד חתימת מורשה החתימה.',
  ];
  const rpr = '<w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl/></w:rPr>';
  // כל משפט = פסקה, ממורכזת (jc=center). keepNext בכולן כדי שהבלוק כולו
  // (פסקאות + טבלה) יישאר יחד באותו עמוד.
  const para = (t: string) =>
    '<w:p><w:pPr><w:keepNext/><w:bidi/><w:jc w:val="center"/>' +
    `${rpr}</w:pPr><w:r>${rpr}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  return sentences.map(para).join('');
}

/**
 * סימן-גבול לבלוק החתימה — bookmark ריק, לא פסקת טקסט.
 * קריטי: פסקת טקסט "מוסתר" (vanish/לבן) *נצרבת כטקסט גלוי* בהמרת ה-DOCX ל-PDF, כי
 * מנוע ההמרה לא מכבד vanish → הלקוח ראה "GALITSIGTABLE" גלוי. bookmark נושא את המזהה
 * בתוך תכונה (w:name), אינו מרונדר כלל, ולעולם אינו דולף לשכבת הטקסט של ה-PDF.
 * מזהה ה-bookmark ניתן לאיתור בחיפוש-מחרוזת ב-XML (לזרימת ההסרה בחתימה הדיגיטלית).
 * ה-id חייב להיות ייחודי; משתמשים ב-index כדי לתת שני id-ים שונים לפתיחה ולסגירה.
 */
function markerBookmark(index: number): string {
  const id = 987650 + index; // מרחב id גבוה כדי לא להתנגש ב-bookmarks של התבנית
  return `<w:bookmarkStart w:id="${id}" w:name="${SIGNATURE_TABLE_MARKER}${index}"/><w:bookmarkEnd w:id="${id}"/>`;
}

/** פסקת רווח קטנה (כדי שהבלוק לא יידבק לשורת "תוקף ההצעה"). */
const SPACER_PARAGRAPH = '<w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr></w:p>';

/**
 * רווח בין פסקת האישור לטבלה — פסקה *אחת* קטנה (8pt), לא שלוש שורות בגודל מלא.
 *
 * למה לא 3 שורות: כל הבלוק (פסקאות אישור + רווח + טבלה) נושא keepNext, כלומר Word אסור
 * לו לפצל אותו בין עמודים. שלוש שורות ריקות בגודל מלא הגדילו את הבלוק בכ-⅓ עמוד, ובהצעות
 * שהיו על הגבול הבלוק כבר לא נכנס בעמוד האחרון — keepNext דחף את *כולו* לעמוד הבא והפריסה
 * "נשברה". פסקה אחת בגודל 8pt נותנת הפרדה ויזואלית דומה בעלות אנכית זניחה.
 *
 * הרווח נמדד ב-half-points (w:sz w:val="16" = 8pt), כמו SPACER_PARAGRAPH שמעליו.
 * keepNext נשאר — כדי שהרווח לא יישאר לבדו בתחתית עמוד בלי הטבלה שאחריו.
 */
const GAP_BEFORE_TABLE =
  '<w:p><w:pPr><w:keepNext/><w:rPr><w:rtl/><w:sz w:val="16"/></w:rPr></w:pPr></w:p>';

/**
 * הבלוק המלא: bookmark-פתיחה → רווח → פסקת אישור → רווח קטן → טבלה → bookmark-סגירה.
 * ה-bookmarks הם גבולות בלתי-נראים (לא דולפים ל-PDF). פסקת הרווח שלפני הטבלה נושאת
 * keepNext, ולכן הבלוק כולו (פסקאות + רווח + טבלה) נשאר יחד באותו עמוד.
 * הרווח מכוון להישאר קטן — ראו ההערה על GAP_BEFORE_TABLE: בלוק גבוה מדי + keepNext
 * מקפיץ את כל בלוק החתימה לעמוד חדש.
 * שים לב: ה-bookmarkStart/End חייבים לשבת *בתוך* פסקה תקינה, ולכן עוטפים אותם בפסקה ריקה.
 */
function buildBlock(): string {
  const openMarker = `<w:p><w:pPr><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>${markerBookmark(0)}</w:p>`;
  const closeMarker = `<w:p><w:pPr><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>${markerBookmark(1)}</w:p>`;
  return (
    openMarker +
    SPACER_PARAGRAPH +
    approvalParagraph() +
    GAP_BEFORE_TABLE +
    signatureTableXml() +
    closeMarker
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
 * ייצרב כטקסט גלוי בהמרת ה-PDF. מטפל בשלושה מקרים:
 *   1) run שלם שמכיל SIGNATUREHERE רציף → מסירים את כל ה-run.
 *   2) המחרוזת הרציפה שרדה במקום אחר → מסירים אותה.
 *   3) **פיצול בין runs** (SIGNATURE ב-<w:t> אחד ו-HERE בשני, כפי שנצפה ב-PDF הדוגמה) →
 *      מסירים את רצף האותיות גם כשמפרידים ביניהן tags/גבולות-run. זה המקרה שגרם ל-
 *      "SIGNATUREHERE" גלוי בפלט.
 */
function stripSignatureMarkerText(documentXml: string): string {
  let out = documentXml;
  // (1) הסרת ה-run השלם שמכיל את הטקסט הרציף.
  const runRe = /<w:r\b[^>]*>(?:(?!<\/w:r>).)*?SIGNATUREHERE(?:(?!<\/w:r>).)*?<\/w:r>/gs;
  out = out.replace(runRe, '');
  // (2) המחרוזת הרציפה עדיין קיימת → מסירים אותה.
  if (out.includes('SIGNATUREHERE')) out = out.split('SIGNATUREHERE').join('');
  // (3) פיצול בין runs: כל אות עשויה להיות מופרדת ע"י XML tags (סגירת/פתיחת run/text).
  //     בונים regex שמאפשר רצף tags בין כל שתי אותיות ומסיר את כל ההתאמה (כולל ה-tags
  //     שביניהן — ה-runs עצמם היו ריקים מטקסט אחר כי הם רק סמן המיקום).
  const MARKER = 'SIGNATUREHERE';
  const between = '(?:\\s|<[^>]*>)*'; // רווחים או תגי-XML
  const splitRe = new RegExp(MARKER.split('').join(between), 'g');
  if (splitRe.test(out)) out = out.replace(splitRe, '');
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
