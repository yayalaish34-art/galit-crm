#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== שלב 1: בדיקת DB ==="
node -e "
const {Pool}=require('pg');
const p=new Pool({connectionString:'postgresql://galit:galit@localhost:5432/galit_crm'});
(async()=>{
  // Check Quote columns
  const cols=await p.query(\`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='Quote'
    AND column_name IN ('customerName','quoteDate','followupDate','salesRepresentativeName','executorName','linkedEntityId','orderReferenceNumber','copiedFromOrder','priceList','exchangeRate','accountingNumber','companyRegNumber','addressSummary','phoneSummary','faxSummary','validityDays','paymentsCount','paymentAmount','paymentFactor','paymentTotal','paymentReference','paymentDueDate','paymentStatus')
    ORDER BY column_name
  \`);
  console.log('Quote columns found:', cols.rows.length, '/23');
  console.log(cols.rows.map(c=>c.column_name).join(', '));

  // Check CustomerQuoteItem table
  const tbl=await p.query(\`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='CustomerQuoteItem')\`);
  console.log('CustomerQuoteItem table exists:', tbl.rows[0].exists);

  // Check indexes
  const idx=await p.query(\`SELECT indexname FROM pg_indexes WHERE tablename='CustomerQuoteItem' ORDER BY indexname\`);
  console.log('Indexes:', idx.rows.map(i=>i.indexname).join(', '));

  // Check FK
  const fk=await p.query(\`SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='CustomerQuoteItem' AND constraint_type='FOREIGN KEY'\`);
  console.log('FK:', fk.rows.map(f=>f.constraint_name).join(', '));

  // Check SalesOrder->Quote FK
  const soFk=await p.query(\`SELECT conname, CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END as on_delete FROM pg_constraint WHERE conrelid='public.\"SalesOrder\"'::regclass AND conname LIKE '%quoteId%'\`);
  console.log('SalesOrder->Quote FK:', JSON.stringify(soFk.rows));

  await p.end();
})().catch(e=>{console.error('DB ERROR:',e.message);process.exit(1)});
"

echo ""
echo "=== שלב 2: resolve migration ==="
npx prisma migrate resolve --applied 20260325181000_extend_quotes_new_quote_screen
echo "resolve OK"

echo ""
echo "=== שלב 3: deploy ==="
npx prisma migrate deploy
echo "deploy OK"

echo ""
echo "=== סיום ==="
echo "הכול עבר! עכשיו הרץ: npm run start:dev"
