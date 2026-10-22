/**
 * בדיקה מקצה-לקצה של זרימת "טיוטה → עריכה → הנפקה" מול כספית האמיתית,
 * דרך CaspitService עצמו (לא בקשות גולמיות).
 *
 * ההנפקה בפועל **מדולגת כברירת מחדל** — היא מכניסה מסמך לספרים ואי אפשר
 * לבטל אותה מכאן. הרץ עם --issue רק אם באמת רוצים לאמת גם את הסגירה.
 * בסוף הטיוטה מבוטלת (DELETE → סטטוס "מבוטל").
 *
 * הרצה: npx ts-node --transpile-only -r dotenv/config scripts/_test-caspit-edit-flow.ts
 */
import { CaspitService } from '../src/caspit/caspit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import * as crypto from 'crypto';

const ISSUE = process.argv.includes('--issue');

(async () => {
  const prisma = new PrismaService();
  await prisma.$connect();
  const caspit = new CaspitService(prisma);

  const documentId = 'crm-prof-' + crypto.randomUUID();
  console.log(`documentId: ${documentId} (${documentId.length}/50)`);

  // ── 1. יצירת טיוטה (חשבונית עסקה — אינה מסמך מס) ─────────────────────────
  const created = await caspit.createInvoice(
    {
      documentId,
      customer: { id: null, businessName: 'בדיקת עריכה (למחיקה)', email: null },
      lines: [{ name: 'שורה מקורית', details: '', unitPrice: 100, qty: 1, chargeVat: true }],
      comments: 'מסמך בדיקה',
      dueDate: null,
    } as any,
    'proforma',
    { finalize: false },
  );
  console.log(`\n1. createInvoice(finalize:false) -> number=${created.number} finalized=${created.finalized}`);

  // ── 2. קריאה לעריכה ──────────────────────────────────────────────────────
  let doc = await caspit.getDocument(documentId);
  console.log(`2. getDocument -> status=${doc.status} "${doc.statusLabel}" editable=${doc.editable}`);
  console.log(`   kind=${doc.kindLabel} lines=${doc.lines.length} total=${doc.total}`);

  // ── 3. עריכה: שינוי שורה, הוספת שורה, הערה, תאריך יעד ופרטי לקוח ─────────
  doc = await caspit.updateDocument(documentId, {
    comments: 'הערה אחרי עריכה',
    customerBusinessName: 'שם אחרי עריכה',
    customerContactName: 'איש קשר חדש',
    dueDate: '2026-09-30',
    lines: [
      { name: 'שורה ערוכה', details: 'עודכן', unitPrice: 250, qty: 2, chargeVat: true },
      { name: 'שורה שנוספה', details: '', unitPrice: 80, qty: 3, chargeVat: true },
      { name: 'שורה פטורה ממע"מ', details: '', unitPrice: 50, qty: 1, chargeVat: false },
    ],
  });
  console.log(`\n3. updateDocument ->`);
  console.log(`   comments   = ${doc.comments}`);
  console.log(`   customer   = ${doc.customerBusinessName} / ${doc.customerContactName}`);
  console.log(`   dueDate    = ${doc.dueDate}`);
  for (const l of doc.lines) console.log(`   line: ${l.name}  ${l.qty} x ${l.unitPrice}  vat=${l.chargeVat}`);
  console.log(`   beforeVat=${doc.totalBeforeVat} vat=${doc.vat} total=${doc.total}`);

  const expected = 250 * 2 + 80 * 3 + 50;
  console.log(`   expected before VAT = ${expected}  ->  ${doc.totalBeforeVat === expected ? 'MATCH' : 'MISMATCH'}`);

  // ── 4. עריכה חלקית: רק הערה — אסור שתמחק את השורות ───────────────────────
  doc = await caspit.updateDocument(documentId, { comments: 'עריכה חלקית בלבד' });
  console.log(`\n4. partial update (comments only) -> lines still ${doc.lines.length}, total ${doc.total}`);
  if (doc.lines.length !== 3) throw new Error('BUG: partial update dropped the lines');

  // ── 5. שורות ריקות נדחות ─────────────────────────────────────────────────
  try {
    await caspit.updateDocument(documentId, { lines: [] });
    console.log('\n5. empty lines -> ACCEPTED  <-- BUG');
  } catch (e: any) {
    console.log(`\n5. empty lines rejected -> "${e.message}"`);
  }

  // ── 6. הנפקה (רק עם --issue) ─────────────────────────────────────────────
  if (ISSUE) {
    doc = await caspit.issueDocument(documentId);
    console.log(`\n6. issueDocument -> status=${doc.status} "${doc.statusLabel}" number=${doc.number}`);
    try {
      await caspit.updateDocument(documentId, { comments: 'לא אמור לעבור' });
      console.log('   edit after issue -> ACCEPTED  <-- BUG');
    } catch (e: any) {
      console.log(`   edit after issue rejected -> "${e.message}"`);
    }
    try {
      await caspit.cancelDraft(documentId);
      console.log('   cancel after issue -> ACCEPTED  <-- BUG');
    } catch (e: any) {
      console.log(`   cancel after issue rejected -> "${e.message}"`);
    }
    console.log('\n   (המסמך נשאר מונפק בכספית — לא ניתן לבטלו מכאן)');
  } else {
    console.log('\n6. issueDocument -> דולג (הרץ עם --issue כדי לאמת גם סגירה)');
    const cancelled = await caspit.cancelDraft(documentId);
    console.log(`7. cancelDraft -> status=${cancelled.status} "${cancelled.statusLabel}"`);
    const after = await caspit.getDocument(documentId);
    console.log(`   re-read -> "${after.statusLabel}" editable=${after.editable}`);
  }

  // ── 8. הגנה: מסמך שאינו של ה-CRM נדחה ────────────────────────────────────
  for (const bad of ['some-other-doc', '']) {
    try {
      await caspit.getDocument(bad);
      console.log(`
8. foreign id "${bad}" -> ACCEPTED  <-- BUG`);
    } catch (e: any) {
      console.log(`
8. foreign id "${bad}" rejected -> "${e.message}"`);
    }
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
