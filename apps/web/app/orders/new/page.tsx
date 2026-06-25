'use client';

import React, { useMemo, useState } from 'react';

type OrderItemRow = {
  id: string;
  code: string;
  sku: string;
  productDescription: string;
  distributionChannel: string;
  quantity: string;
  price: string;
  discountPercent: string;
};

type OrderDocumentRow = {
  id: string;
  documentDescription: string;
  documentType: string;
  fileName: string;
  documentDate: string;
  uploadedBy: string;
};

type ChargeTxRow = {
  id: string;
  periodNumber: string;
  approvalNumber: string;
  chargeDate: string;
  billingMethod: string;
  transactionType: string;
  chargeAmount: string;
};

type OrderTabKey =
  | 'נתוני אספקה'
  | 'שונות'
  | 'הערות'
  | 'מסמכים מקושרים'
  | 'תנועות חיוב'
  | 'הגדרות חיוב'
  | 'הנה"ח';

const ORDER_TABS: OrderTabKey[] = [
  'נתוני אספקה',
  'שונות',
  'הערות',
  'מסמכים מקושרים',
  'תנועות חיוב',
  'הגדרות חיוב',
  'הנה"ח',
];

function toNumber(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function NewOrderPage() {
  const [items, setItems] = useState<OrderItemRow[]>([
    {
      id: crypto.randomUUID(),
      code: '',
      sku: '',
      productDescription: '',
      distributionChannel: '',
      quantity: '',
      price: '',
      discountPercent: '',
    },
  ]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(items[0]?.id ?? null);

  const [orderNo, setOrderNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [status, setStatus] = useState('');

  const [salesRep, setSalesRep] = useState('');
  const [contactName, setContactName] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [linkedEntity, setLinkedEntity] = useState('');
  const [parentOrder, setParentOrder] = useState('');
  const [priceList, setPriceList] = useState('');
  const [readyStatus, setReadyStatus] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [quoteRef, setQuoteRef] = useState('');

  const [addressSummary, setAddressSummary] = useState('');
  const [phoneSummary, setPhoneSummary] = useState('');
  const [faxSummary, setFaxSummary] = useState('');
  const [customerTypeSummary, setCustomerTypeSummary] = useState('');
  const [accountingNumber, setAccountingNumber] = useState('');
  const [companyRegNumber, setCompanyRegNumber] = useState('');

  const [supplyAddressUntil, setSupplyAddressUntil] = useState('');
  const [supplyPhone, setSupplyPhone] = useState('');
  const [supplyDate, setSupplyDate] = useState('');
  const [firstDate, setFirstDate] = useState('');

  const [tab, setTab] = useState<OrderTabKey>('נתוני אספקה');
  const [editMode] = useState(true);

  const [extraCost, setExtraCost] = useState('');
  const [orderSource, setOrderSource] = useState('');
  const [lastUpdatedBy, setLastUpdatedBy] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [lastUpdatedAtLegacy, setLastUpdatedAtLegacy] = useState('');
  const [lastUpdatedTime, setLastUpdatedTime] = useState('');

  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const [documents, setDocuments] = useState<OrderDocumentRow[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const [chargeTxRows, setChargeTxRows] = useState<ChargeTxRow[]>([]);
  const [selectedChargeTxId, setSelectedChargeTxId] = useState<string | null>(null);

  const [billingSettings, setBillingSettings] = useState('');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [billingStatus, setBillingStatus] = useState('');
  const [billingFromDate, setBillingFromDate] = useState('');
  const [recurringChargesCount, setRecurringChargesCount] = useState('');
  const [billingEndMode, setBillingEndMode] = useState<'בתאריך' | 'לאחר' | 'ללא הגבלה'>('ללא הגבלה');
  const [billingAfterValue, setBillingAfterValue] = useState('');

  const [accountingReceiptNumber, setAccountingReceiptNumber] = useState('');
  const [accountingInvoiceNumber, setAccountingInvoiceNumber] = useState('');
  const [accountingTransferDate, setAccountingTransferDate] = useState('');
  const [accountingStatus, setAccountingStatus] = useState('');
  const [nextAccountingTransferDate, setNextAccountingTransferDate] = useState('');
  const [accountingCategory, setAccountingCategory] = useState('');
  const [accountingReferenceText, setAccountingReferenceText] = useState('');

  const [discountPercent, setDiscountPercent] = useState('');
  const [vatPercent, setVatPercent] = useState('18');
  const [cashTotalOverride, setCashTotalOverride] = useState('');

  const rowComputed = useMemo(() => {
    return items.map((r) => {
      const q = toNumber(r.quantity);
      const p = toNumber(r.price);
      const d = toNumber(r.discountPercent);
      const pre = q * p;
      const post = pre * (1 - d / 100);
      return { id: r.id, total: post };
    });
  }, [items]);

  const subtotalBeforeVat = useMemo(
    () => rowComputed.reduce((s, x) => s + x.total, 0),
    [rowComputed],
  );
  const afterHeaderDiscount = useMemo(
    () => subtotalBeforeVat * (1 - toNumber(discountPercent) / 100),
    [subtotalBeforeVat, discountPercent],
  );
  const withVat = useMemo(
    () => afterHeaderDiscount * (1 + toNumber(vatPercent) / 100),
    [afterHeaderDiscount, vatPercent],
  );
  const cashTotal = cashTotalOverride ? toNumber(cashTotalOverride) : withVat;

  const selectedRowIndex = items.findIndex((x) => x.id === selectedRowId);

  const addRow = () => {
    const next: OrderItemRow = {
      id: crypto.randomUUID(),
      code: '',
      sku: '',
      productDescription: '',
      distributionChannel: '',
      quantity: '',
      price: '',
      discountPercent: '',
    };
    setItems((prev) => [...prev, next]);
    setSelectedRowId(next.id);
  };

  const removeSelectedRow = () => {
    if (!selectedRowId) return;
    setItems((prev) => {
      const filtered = prev.filter((x) => x.id !== selectedRowId);
      if (filtered.length === 0) {
        const fallback = { ...prev[0], id: crypto.randomUUID() };
        setSelectedRowId(fallback.id);
        return [fallback];
      }
      setSelectedRowId(filtered[Math.min(selectedRowIndex, filtered.length - 1)]?.id ?? filtered[0].id);
      return filtered;
    });
  };

  const patchRow = (id: string, patch: Partial<OrderItemRow>) =>
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addDocumentRow = () => {
    const row: OrderDocumentRow = {
      id: crypto.randomUUID(),
      documentDescription: '',
      documentType: '',
      fileName: '',
      documentDate: '',
      uploadedBy: '',
    };
    setDocuments((p) => [...p, row]);
    setSelectedDocumentId(row.id);
  };

  const removeDocumentRow = () => {
    if (!selectedDocumentId) return;
    setDocuments((p) => p.filter((x) => x.id !== selectedDocumentId));
    setSelectedDocumentId(null);
  };

  const patchDocumentRow = (id: string, patch: Partial<OrderDocumentRow>) =>
    setDocuments((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addChargeTxRow = () => {
    const row: ChargeTxRow = {
      id: crypto.randomUUID(),
      periodNumber: '',
      approvalNumber: '',
      chargeDate: '',
      billingMethod: '',
      transactionType: '',
      chargeAmount: '',
    };
    setChargeTxRows((p) => [...p, row]);
    setSelectedChargeTxId(row.id);
  };

  const removeChargeTxRow = () => {
    if (!selectedChargeTxId) return;
    setChargeTxRows((p) => p.filter((x) => x.id !== selectedChargeTxId));
    setSelectedChargeTxId(null);
  };

  const patchChargeTxRow = (id: string, patch: Partial<ChargeTxRow>) =>
    setChargeTxRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <main className="min-h-screen bg-[#ececec] p-2 text-slate-800" dir="rtl">
      <div className="mx-auto max-w-[1700px] rounded border border-slate-300 bg-[#f2f2f2]">
        <header className="border-b border-slate-300 bg-[#efefef] px-3 py-2 text-sm font-semibold">הזמנה חדשה</header>

        <section className="grid grid-cols-1 gap-2 border-b border-slate-300 p-2 lg:grid-cols-5">
          <Field label="הזמנה" value={orderNo} onChange={setOrderNo} />
          <Field label="לקוח" value={customerName} onChange={setCustomerName} />
          <DateField label="תאריך" value={orderDate} onChange={setOrderDate} />
          <DateField label="תאריך מעקב" value={followupDate} onChange={setFollowupDate} />
          <Field label="סטטוס" value={status} onChange={setStatus} />
        </section>

        <section className="grid grid-cols-1 gap-2 border-b border-slate-300 p-2 lg:grid-cols-[1fr_340px]">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
            <Field label="נציג מכירה" value={salesRep} onChange={setSalesRep} />
            <Field label="איש קשר" value={contactName} onChange={setContactName} />
            <Field label="מבצע" value={campaignName} onChange={setCampaignName} />
            <Field label="ל.מקושר" value={linkedEntity} onChange={setLinkedEntity} />
            <Field label="הזמנה אב" value={parentOrder} onChange={setParentOrder} />
            <Field label="מחירון" value={priceList} onChange={setPriceList} />
            <Field label="ס-מוכן" value={readyStatus} onChange={setReadyStatus} />
            <Field label="שער" value={exchangeRate} onChange={setExchangeRate} />
            <Field label="הצעה" value={quoteRef} onChange={setQuoteRef} />
          </div>

          <div className="rounded border border-slate-300 bg-white p-2 text-xs">
            <div className="mb-1 font-semibold">כתובת</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="כתובת" value={addressSummary} onChange={setAddressSummary} />
              <Field label="טל" value={phoneSummary} onChange={setPhoneSummary} />
              <Field label="פקס" value={faxSummary} onChange={setFaxSummary} />
              <Field label="סוג" value={customerTypeSummary} onChange={setCustomerTypeSummary} />
              <Field label='מספר בהנה"ח' value={accountingNumber} onChange={setAccountingNumber} />
              <Field label="מספר ח.פ" value={companyRegNumber} onChange={setCompanyRegNumber} />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-[1fr_28px] gap-1 border-b border-slate-300 p-1">
          <div className="overflow-auto border border-slate-300 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[#2563eb] text-white">
                <tr>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">קוד</th>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">מק"ט</th>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">תיאור המוצר</th>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">ערוץ הפצה</th>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">כמות</th>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">מחיר</th>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">הנחה %</th>
                  <th className="border border-[#93c5fd] px-2 py-1 text-right">סה"כ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const rowTotal =
                    (toNumber(r.quantity) * toNumber(r.price) * (1 - toNumber(r.discountPercent) / 100)).toFixed(2);
                  const selected = r.id === selectedRowId;
                  return (
                    <tr key={r.id} className={selected ? 'bg-blue-100' : 'hover:bg-slate-50'} onClick={() => setSelectedRowId(r.id)}>
                      <td className="border border-slate-200 p-0"><CellInput value={r.code} onChange={(v) => patchRow(r.id, { code: v })} /></td>
                      <td className="border border-slate-200 p-0"><CellInput value={r.sku} onChange={(v) => patchRow(r.id, { sku: v })} /></td>
                      <td className="border border-slate-200 p-0"><CellInput value={r.productDescription} onChange={(v) => patchRow(r.id, { productDescription: v })} /></td>
                      <td className="border border-slate-200 p-0"><CellInput value={r.distributionChannel} onChange={(v) => patchRow(r.id, { distributionChannel: v })} /></td>
                      <td className="border border-slate-200 p-0"><CellInput value={r.quantity} onChange={(v) => patchRow(r.id, { quantity: v })} /></td>
                      <td className="border border-slate-200 p-0"><CellInput value={r.price} onChange={(v) => patchRow(r.id, { price: v })} /></td>
                      <td className="border border-slate-200 p-0"><CellInput value={r.discountPercent} onChange={(v) => patchRow(r.id, { discountPercent: v })} /></td>
                      <td className="border border-slate-200 px-2 py-1 text-left">{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center gap-2 pt-6">
            <button type="button" onClick={addRow} className="h-6 w-6 rounded border border-slate-300 bg-white text-green-700">+</button>
            <button type="button" onClick={removeSelectedRow} className="h-6 w-6 rounded border border-slate-300 bg-white text-red-700">×</button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2 border-b border-slate-300 p-2 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2 rounded border border-slate-300 bg-white p-2 text-xs">
            <NumberField label='סה"כ ללא מע"מ' value={subtotalBeforeVat.toFixed(2)} onChange={() => {}} readOnly />
            <NumberField label="הנחה %" value={discountPercent} onChange={setDiscountPercent} />
            <NumberField label='סה"כ לאחר הנחה' value={afterHeaderDiscount.toFixed(2)} onChange={() => {}} readOnly />
            <NumberField label='מע"מ %' value={vatPercent} onChange={setVatPercent} />
            <NumberField label='סה"כ במזומן' value={cashTotalOverride || cashTotal.toFixed(2)} onChange={setCashTotalOverride} />
          </div>

          <div className="rounded border border-blue-700 bg-white">
            <div className="flex flex-wrap items-center border-b border-slate-300 bg-[#efefef] px-2 py-1 text-xs">
              {ORDER_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={['rounded px-3 py-1', tab === t ? 'bg-blue-700 text-white' : 'text-slate-600'].join(' ')}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === 'נתוני אספקה' && (
              <div className="grid grid-cols-1 gap-2 p-2 text-xs lg:grid-cols-3">
                <div className="font-semibold">נתוני אספקה</div>
                <DateField label="לכתובת עד" value={supplyAddressUntil} onChange={setSupplyAddressUntil} readOnly={!editMode} />
                <Field label="טלפון" value={supplyPhone} onChange={setSupplyPhone} readOnly={!editMode} />
                <DateField label="תאריך אספקה" value={supplyDate} onChange={setSupplyDate} readOnly={!editMode} />
                <DateField label="תאריך ראשון" value={firstDate} onChange={setFirstDate} readOnly={!editMode} />
              </div>
            )}

            {tab === 'שונות' && (
              <div className="grid grid-cols-1 gap-2 p-2 text-xs lg:grid-cols-4">
                <Field label="עלות" value={extraCost} onChange={setExtraCost} readOnly={!editMode} />
                <Field label="מקור הזמנה" value={orderSource} onChange={setOrderSource} readOnly={!editMode} />
                <Field label="משתמש אחרון" value={lastUpdatedBy} onChange={setLastUpdatedBy} readOnly={!editMode} />
                <label className="text-xs">
                  <div className="mb-1">נשלח אישור</div>
                  <input type="checkbox" checked={confirmationSent} onChange={(e) => setConfirmationSent(e.target.checked)} disabled={!editMode} />
                </label>
                <DateField label="ת. עדכון אחרון" value={lastUpdatedAtLegacy} onChange={setLastUpdatedAtLegacy} readOnly={!editMode} />
                <Field label="שעה" value={lastUpdatedTime} onChange={setLastUpdatedTime} readOnly={!editMode} />
              </div>
            )}

            {tab === 'הערות' && (
              <div className="grid grid-cols-1 gap-2 p-2 text-xs lg:grid-cols-2">
                <MemoField label="הערות" value={notes} onChange={setNotes} readOnly={!editMode} />
                <MemoField label="הערה פנימית" value={internalNotes} onChange={setInternalNotes} readOnly={!editMode} />
              </div>
            )}

            {tab === 'מסמכים מקושרים' && (
              <div className="grid grid-cols-[1fr_30px] gap-1 p-2 text-xs">
                <div className="overflow-auto border border-slate-300">
                  <table className="w-full border-collapse">
                    <thead className="bg-[#2563eb] text-white">
                      <tr>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">תאור המסמך</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">סוג המסמך</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">שם קובץ</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">תאריך</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">משתמש</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((r) => (
                        <tr key={r.id} className={selectedDocumentId === r.id ? 'bg-blue-100' : 'hover:bg-slate-50'} onClick={() => setSelectedDocumentId(r.id)}>
                          <td className="border border-slate-200 p-0"><CellInput value={r.documentDescription} onChange={(v) => patchDocumentRow(r.id, { documentDescription: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.documentType} onChange={(v) => patchDocumentRow(r.id, { documentType: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.fileName} onChange={(v) => patchDocumentRow(r.id, { fileName: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.documentDate} onChange={(v) => patchDocumentRow(r.id, { documentDate: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.uploadedBy} onChange={(v) => patchDocumentRow(r.id, { uploadedBy: v })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col items-center gap-1 pt-1">
                  <button type="button" onClick={addDocumentRow} className="h-6 w-6 rounded border border-slate-300 text-green-700">+</button>
                  <button type="button" onClick={removeDocumentRow} className="h-6 w-6 rounded border border-slate-300 text-red-700">×</button>
                  <button type="button" className="h-6 w-6 rounded border border-slate-300">✎</button>
                  <button type="button" className="h-6 w-6 rounded border border-slate-300">🔍</button>
                </div>
              </div>
            )}

            {tab === 'תנועות חיוב' && (
              <div className="grid grid-cols-[1fr_30px] gap-1 p-2 text-xs">
                <div className="overflow-auto border border-slate-300">
                  <table className="w-full border-collapse">
                    <thead className="bg-[#2563eb] text-white">
                      <tr>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">מספר תקופה</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">מספר אישור</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">תאריך חיוב</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">אמצעי חיוב</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">סוג עיסקה</th>
                        <th className="border border-[#93c5fd] px-2 py-1 text-right">סכום חיוב</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chargeTxRows.map((r) => (
                        <tr key={r.id} className={selectedChargeTxId === r.id ? 'bg-blue-100' : 'hover:bg-slate-50'} onClick={() => setSelectedChargeTxId(r.id)}>
                          <td className="border border-slate-200 p-0"><CellInput value={r.periodNumber} onChange={(v) => patchChargeTxRow(r.id, { periodNumber: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.approvalNumber} onChange={(v) => patchChargeTxRow(r.id, { approvalNumber: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.chargeDate} onChange={(v) => patchChargeTxRow(r.id, { chargeDate: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.billingMethod} onChange={(v) => patchChargeTxRow(r.id, { billingMethod: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.transactionType} onChange={(v) => patchChargeTxRow(r.id, { transactionType: v })} /></td>
                          <td className="border border-slate-200 p-0"><CellInput value={r.chargeAmount} onChange={(v) => patchChargeTxRow(r.id, { chargeAmount: v })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col items-center gap-1 pt-1">
                  <button type="button" onClick={addChargeTxRow} className="h-6 w-6 rounded border border-slate-300 text-green-700">+</button>
                  <button type="button" onClick={removeChargeTxRow} className="h-6 w-6 rounded border border-slate-300 text-red-700">×</button>
                </div>
              </div>
            )}

            {tab === 'הגדרות חיוב' && (
              <div className="grid grid-cols-1 gap-2 p-2 text-xs lg:grid-cols-4">
                <div className="font-semibold">הגדרות חיוב</div>
                <DateField label="תאריך יום הבא" value={nextBillingDate} onChange={setNextBillingDate} readOnly={!editMode} />
                <Field label="סטטוס חיוב" value={billingStatus} onChange={setBillingStatus} readOnly={!editMode} />
                <DateField label="החיוב במתאריך" value={billingFromDate} onChange={setBillingFromDate} readOnly={!editMode} />
                <Field label="חיובים" value={recurringChargesCount} onChange={setRecurringChargesCount} readOnly={!editMode} />
                <Field label="סיום חיוב" value={billingSettings} onChange={setBillingSettings} readOnly={!editMode} />
                <div className="col-span-2 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1"><input type="radio" checked={billingEndMode === 'בתאריך'} onChange={() => setBillingEndMode('בתאריך')} disabled={!editMode} />בתאריך</label>
                  <label className="flex items-center gap-1"><input type="radio" checked={billingEndMode === 'לאחר'} onChange={() => setBillingEndMode('לאחר')} disabled={!editMode} />לאחר</label>
                  <label className="flex items-center gap-1"><input type="radio" checked={billingEndMode === 'ללא הגבלה'} onChange={() => setBillingEndMode('ללא הגבלה')} disabled={!editMode} />ללא הגבלה</label>
                </div>
                <Field label="" value={billingAfterValue} onChange={setBillingAfterValue} readOnly={!editMode} />
              </div>
            )}

            {tab === 'הנה"ח' && (
              <div className="grid grid-cols-1 gap-2 p-2 text-xs lg:grid-cols-4">
                <div className="font-semibold">הנה"ח</div>
                <Field label="מס' קבלה" value={accountingReceiptNumber} onChange={setAccountingReceiptNumber} readOnly={!editMode} />
                <Field label="מס' חשבונית" value={accountingInvoiceNumber} onChange={setAccountingInvoiceNumber} readOnly={!editMode} />
                <DateField label="תאריך העברה" value={accountingTransferDate} onChange={setAccountingTransferDate} readOnly={!editMode} />
                <Field label="סטטוס" value={accountingStatus} onChange={setAccountingStatus} readOnly={!editMode} />
                <DateField label="תאריך העברה הבא" value={nextAccountingTransferDate} onChange={setNextAccountingTransferDate} readOnly={!editMode} />
                <Field label="" value={accountingCategory} onChange={setAccountingCategory} readOnly={!editMode} />
                <div className="lg:col-span-2">
                  <Field label="" value={accountingReferenceText} onChange={setAccountingReferenceText} readOnly={!editMode} />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function CellInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="w-full border-0 bg-transparent px-2 py-1 text-xs outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <input type="date" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <input
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-left"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
    </label>
  );
}

function MemoField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <textarea
        className="h-28 w-full resize-none rounded border border-slate-300 px-2 py-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
    </label>
  );
}
