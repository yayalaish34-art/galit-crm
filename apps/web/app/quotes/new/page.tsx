'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { QuoteNewScreen } from './quote-new-screen';

function NewQuoteWithQuery() {
  const sp = useSearchParams();
  const qid = sp.get('quoteId');
  return <QuoteNewScreen embedded={false} initialQuoteId={qid} />;
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#ededed] text-sm text-slate-600">טוען...</div>}>
      <NewQuoteWithQuery />
    </Suspense>
  );
}
