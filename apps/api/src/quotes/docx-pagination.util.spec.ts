import { keepHeadingsWithNext, headingStyleIds } from './docx-pagination.util';

const doc = (body: string) =>
  `<w:document xmlns:w="w"><w:body>${body}<w:sectPr><w:pgSz w:w="11906"/></w:sectPr></w:body></w:document>`;
const run = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const bold = (text: string) => `<w:p>${run(text, '<w:b/><w:bCs/><w:u w:val="single"/>')}</w:p>`;
const plain = (text: string) => `<w:p>${run(text)}</w:p>`;
const empty = '<w:p><w:pPr><w:jc w:val="both"/></w:pPr></w:p>';
/** הטקסט של כל פסקה שסומנה keepNext, בסדר המסמך ('' לפסקה ריקה). */
const kept = (xml: string) =>
  (xml.match(/<w:p(?:\s[^>]*)?>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g) ?? [])
    .filter((p) => p.includes('<w:keepNext/>'))
    .map((p) => p.replace(/<[^>]+>/g, ''));

describe('keepHeadingsWithNext', () => {
  it('נועל כותרת מודגשת לתוכן שאחריה, ולא נוגע בטקסט רגיל', () => {
    const { xml, changed } = keepHeadingsWithNext(doc(bold('4. מדידות הרעש') + plain('לצורך הערכת מפלסי הרעש')));
    expect(kept(xml)).toEqual(['4. מדידות הרעש']);
    expect(changed).toBe(1);
  });

  it('20 שורות ריקות לפני הכותרת נשארות; הריקה שאחריה נכנסת לשרשרת', () => {
    const before = empty.repeat(20);
    const { xml } = keepHeadingsWithNext(doc(plain('ובו מספר מבנים.') + before + bold('4. מדידות הרעש') + empty + plain('תוכן')));
    expect(kept(xml)).toEqual(['4. מדידות הרעש', '']);
  });

  it('כותרת משנה צמודה לכותרת — שתיהן ננעלות, עד התוכן', () => {
    const { xml } = keepHeadingsWithNext(doc(bold('4. מדידות הרעש') + empty + bold('4.1 כללי') + empty + plain('תוכן')));
    expect(kept(xml)).toEqual(['4. מדידות הרעש', '', '4.1 כללי', '']);
  });

  it('משפט שמסתיים בנקודה אינו כותרת גם אם הוא מודגש', () => {
    const { changed } = keepHeadingsWithNext(doc(bold('המדידה בוצעה ללא תיאום.') + plain('תוכן')));
    expect(changed).toBe(0);
  });

  it('bold מסוג complex-script בלבד (bCs) נחשב — כך מודגש טקסט עברי', () => {
    const { changed } = keepHeadingsWithNext(doc(`<w:p>${run('סיכום', '<w:bCs/>')}</w:p>` + plain('תוכן')));
    expect(changed).toBe(1);
  });

  it('לא נוגע בפסקאות בתוך טבלה', () => {
    const table = `<w:tbl><w:tr><w:tc>${bold('מקור הרעש')}${plain('רעש רקע')}</w:tc></w:tr></w:tbl>`;
    const { changed } = keepHeadingsWithNext(doc(table + plain('אחרי')));
    expect(changed).toBe(0);
  });

  it('כותרת לפני טבלה ננעלת (נשארת עם השורה הראשונה)', () => {
    const table = `<w:tbl><w:tr><w:tc>${plain('תא')}</w:tc></w:tr></w:tbl>`;
    const { xml } = keepHeadingsWithNext(doc(bold("לוח מס' 1: רעש המקור") + table));
    expect(kept(xml)).toEqual(["לוח מס' 1: רעש המקור"]);
  });

  it('לא נועל כותרת למעבר עמוד — היא הייתה נגררת לעמוד משלה', () => {
    const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const { changed } = keepHeadingsWithNext(doc(bold('נספחים') + pageBreak + plain('תוכן')));
    expect(changed).toBe(0);
  });

  it('רשימה מודגשת ארוכה (יותר מ-3 שורות צמודות) אינה כותרות', () => {
    const list = ['פריט א', 'פריט ב', 'פריט ג', 'פריט ד'].map(bold).join('');
    const { changed } = keepHeadingsWithNext(doc(list + plain('תוכן')));
    expect(changed).toBe(0);
  });

  it('keepNext שהכותב קבע (גם w:val="0") נשמר כמות שהוא', () => {
    const decided = `<w:p><w:pPr><w:keepNext w:val="0"/></w:pPr>${run('כותרת', '<w:b/>')}</w:p>`;
    const { xml, changed } = keepHeadingsWithNext(doc(decided + plain('תוכן')));
    expect(changed).toBe(0);
    expect(xml).toContain('<w:keepNext w:val="0"/>');
  });

  it('keepNext נכנס אחרי pStyle — סדר CT_PPr מחייב', () => {
    const styled = `<w:p><w:pPr><w:pStyle w:val="a0"/><w:jc w:val="both"/></w:pPr>${run('כותרת', '<w:b/>')}</w:p>`;
    const { xml } = keepHeadingsWithNext(doc(styled + plain('תוכן')));
    expect(xml).toContain('<w:pPr><w:pStyle w:val="a0"/><w:keepNext/><w:jc w:val="both"/></w:pPr>');
  });

  it('פסקה ריקה סוגרת-עצמית אחרי כותרת נפתחת ומקבלת pPr', () => {
    const { xml } = keepHeadingsWithNext(doc(bold('כותרת') + '<w:p/>' + plain('תוכן')));
    expect(xml).toContain('<w:p><w:pPr><w:keepNext/></w:pPr></w:p>');
  });

  it('כותרת לפי סגנון (outlineLvl) ננעלת גם בלי הדגשה', () => {
    const styles = '<w:styles><w:style w:type="paragraph" w:styleId="1"><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>';
    expect([...headingStyleIds(styles)]).toEqual(['1']);
    const heading = `<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr>${run('מבוא')}</w:p>`;
    const { changed } = keepHeadingsWithNext(doc(heading + plain('תוכן')), styles);
    expect(changed).toBe(1);
  });

  it('מסמך בלי כותרות חוזר זהה', () => {
    const input = doc(plain('שורה א') + plain('שורה ב'));
    expect(keepHeadingsWithNext(input)).toEqual({ xml: input, changed: 0 });
  });
});
