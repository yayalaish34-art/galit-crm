'use client';

import React, { useState } from 'react';

type InquiryTab = 'תיאור תקלה' | 'הערות סטטוס אחרון' | 'פרטי פנייה';

const TABS: InquiryTab[] = ['תיאור תקלה', 'הערות סטטוס אחרון', 'פרטי פנייה'];

export function InquiryNewScreen({ embedded = true }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState<InquiryTab>('תיאור תקלה');
  const [statusNotes, setStatusNotes] = useState('');

  // Header form fields
  const [form, setForm] = useState({
    importLegacyId: '',
    date: '',
    time: '',
    customerCode: '',
    productCode: '',
    contactName: '',
    phone: '',
    hValue: '',
    productName: '',
    faultCode: '',
    eValue: '',
    dValue: '',
    treatmentCode: '',
    handlerName: '',
    followUp: false,
    description: '',
  });

  // פרטי פנייה tab fields
  const [inquiryType, setInquiryType] = useState('');
  const [priority, setPriority] = useState('');
  const [contactMethod, setContactMethod] = useState('');
  const [inquirySource, setInquirySource] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [treatmentHours, setTreatmentHours] = useState('');
  const [responsibleHandler, setResponsibleHandler] = useState('');
  const [resolutionCode, setResolutionCode] = useState('');

  return (
    <main
      className={embedded ? 'text-slate-800' : 'min-h-screen bg-[#efefef] p-3 text-slate-800'}
      dir="rtl"
    >
      <div
        className={
          embedded
            ? 'rounded border border-slate-300 bg-[#f5f5f5]'
            : 'mx-auto max-w-[1400px] rounded border border-slate-300 bg-[#f5f5f5]'
        }
      >
        <header className="border-b border-slate-300 bg-[#f0f0f0] px-3 py-2 text-sm font-semibold">
          פנייה חדשה
        </header>

        {/* ── Header form fields ── */}
        <section className="grid grid-cols-1 gap-2 border-b border-slate-300 p-3 md:grid-cols-6">
          <Field
            label="קוד פנייה"
            value={form.importLegacyId}
            onChange={(v) => setForm((p) => ({ ...p, importLegacyId: v }))}
          />
          <DateField
            label="תאריך"
            value={form.date}
            onChange={(v) => setForm((p) => ({ ...p, date: v }))}
          />
          <Field
            label="שעה"
            value={form.time}
            onChange={(v) => setForm((p) => ({ ...p, time: v }))}
          />
          <Field
            label="קוד לקוח"
            value={form.customerCode}
            onChange={(v) => setForm((p) => ({ ...p, customerCode: v }))}
          />
          <Field
            label="קוד מוצר"
            value={form.productCode}
            onChange={(v) => setForm((p) => ({ ...p, productCode: v }))}
          />
          <Field
            label="איש קשר"
            value={form.contactName}
            onChange={(v) => setForm((p) => ({ ...p, contactName: v }))}
          />
          <Field
            label="טלפון"
            value={form.phone}
            onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
          />
          <Field
            label="H"
            value={form.hValue}
            onChange={(v) => setForm((p) => ({ ...p, hValue: v }))}
          />
          <Field
            label="מוצר"
            value={form.productName}
            onChange={(v) => setForm((p) => ({ ...p, productName: v }))}
          />
          <Field
            label="קוד תקלה"
            value={form.faultCode}
            onChange={(v) => setForm((p) => ({ ...p, faultCode: v }))}
          />
          <Field
            label="E"
            value={form.eValue}
            onChange={(v) => setForm((p) => ({ ...p, eValue: v }))}
          />
          <Field
            label="D"
            value={form.dValue}
            onChange={(v) => setForm((p) => ({ ...p, dValue: v }))}
          />
          <Field
            label="קוד טיפול"
            value={form.treatmentCode}
            onChange={(v) => setForm((p) => ({ ...p, treatmentCode: v }))}
          />
          <Field
            label="שם מטפל"
            value={form.handlerName}
            onChange={(v) => setForm((p) => ({ ...p, handlerName: v }))}
          />
          <label className="flex items-center gap-2 pt-5 text-xs">
            <input
              type="checkbox"
              checked={form.followUp}
              onChange={(e) => setForm((p) => ({ ...p, followUp: e.target.checked }))}
            />
            למעקב
          </label>
        </section>

        {/* ── Tabs panel (RTL: first child → RIGHT column) ── */}
        {/*
          grid-cols-[520px_1fr] in RTL: col-1 (520px) = RIGHT, col-2 (1fr) = LEFT.
          Tab panel is first child → RIGHT side. ✓
        */}
        <section className="grid grid-cols-1 gap-2 border-t border-slate-300 p-2 lg:grid-cols-[520px_1fr]">
          {/* Tab panel — RIGHT side */}
          <div className="rounded border border-blue-700 bg-white">
            <div className="flex flex-wrap items-center border-b border-slate-300 bg-[#efefef] px-2 py-1 text-xs">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={[
                    'rounded px-3 py-1',
                    activeTab === t ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                  onClick={() => setActiveTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* תיאור תקלה */}
            {activeTab === 'תיאור תקלה' && (
              <div className="p-2">
                <textarea
                  className="h-28 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            )}

            {/* הערות סטטוס אחרון */}
            {activeTab === 'הערות סטטוס אחרון' && (
              <div className="p-2">
                <textarea
                  className="h-28 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs"
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                />
              </div>
            )}

            {/* פרטי פנייה */}
            {activeTab === 'פרטי פנייה' && (
              <div className="grid grid-cols-1 gap-2 p-2 text-xs lg:grid-cols-2">
                <Field label="סוג פנייה" value={inquiryType} onChange={setInquiryType} />
                <Field label="עדיפות" value={priority} onChange={setPriority} />
                <Field label="שיטת קשר" value={contactMethod} onChange={setContactMethod} />
                <Field label="מקור פנייה" value={inquirySource} onChange={setInquirySource} />
                <Field label="שעות טיפול" value={treatmentHours} onChange={setTreatmentHours} />
                <Field label="מטפל אחראי" value={responsibleHandler} onChange={setResponsibleHandler} />
                <Field label="קוד פתרון" value={resolutionCode} onChange={setResolutionCode} />
                <DateField
                  label="תאריך צפוי לסגירה"
                  value={expectedCloseDate}
                  onChange={setExpectedCloseDate}
                />
              </div>
            )}
          </div>

          {/* LEFT side — reserved for future content */}
          <div />
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <input
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <input
        type="date"
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
