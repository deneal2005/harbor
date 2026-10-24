import { useState } from 'react';
import { useParams } from 'react-router';
import { BusinessMark } from '../components/BusinessMark.jsx';
import { Qr } from '../components/Qr.jsx';
import { Button, Card, Field, Money, Notice, inputCls } from '../components/ui.jsx';
import { useErrorText } from '../hooks/useErrorText.js';
import { customerClaim, customerMessage, raiseDispute } from '../services/actions.js';
import { adjustedOn, balanceOf, paidOn } from '../services/invoices.js';
import { useStore } from '../store-context.js';
import { rupeesToPaise } from '../utils/money.js';
import { upiUri } from '../utils/upi.js';

// Customer-facing view. Same-browser simulation only: there is no shared backend.
export default function CustomerPay() {
  const { token } = useParams();
  const { t, state, today, run, date, customer, lang } = useStore();
  const errText = useErrorText();
  const inv = state.invoices.find((i) => i.token === token && i.status !== 'draft');
  const [mode, setMode] = useState(null);
  const [f, setF] = useState({ reference: '', date: today, amount: '', reason: '', message: '' });
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const b = state.business;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (!inv) return <main className="mx-auto max-w-lg p-6"><Notice tone="danger">{t('cpay.invalid')}</Notice></main>;
  const c = customer(inv.customerId);
  const bal = balanceOf(state, inv);
  const submit = () => {
    const r = mode === 'paid' ? run(customerClaim, inv.id, { reference: f.reference, date: f.date, amountPaise: rupeesToPaise(f.amount) })
      : mode === 'wrong' ? run(raiseDispute, inv.id, f.reason, 'customer') : run(customerMessage, inv.id, f.message);
    const m = errText(r);
    setError(m);
    if (!m) { setDone(mode); setMode(null); }
  };

  return (
    <main className="min-h-screen bg-paper" lang={lang}>
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <p className="rounded-lg border border-warn/40 bg-warn-soft p-2 text-sm text-warn">{t('cpay.demo')}</p>
        <header className="flex items-center gap-3">
          <BusinessMark business={b} className="h-12 w-12 rounded-lg text-lg" />
          <div className="min-w-0"><h1 className="text-xl font-semibold">{t('cpay.title', { business: b.name })}</h1><p className="text-sm text-muted">{c.name}</p></div>
        </header>
        <Card>
          <div className="text-sm text-muted">{inv.number} · {date(inv.date)}</div>
          <dl className="mt-2 grid grid-cols-2 gap-y-1">
            <dt>{t('cpay.original')}</dt><dd className="text-right"><Money paise={inv.totalPaise} /></dd>
            <dt>{t('cpay.received')}</dt><dd className="text-right"><Money paise={paidOn(state, inv.id) + adjustedOn(state, inv.id)} /></dd>
            <dt className="text-lg font-semibold">{t('cpay.remaining')}</dt><dd className="text-right text-lg font-semibold"><Money paise={bal} /></dd>
            <dt>{t('cpay.due')}</dt><dd className="text-right">{date(inv.dueDate)}</dd>
          </dl>
        </Card>
        {bal <= 0 ? <Notice tone="ok">✓ {t('cpay.fullyPaid')}</Notice> : (
          <>
            <Card title={t('cpay.how')}>
              <p className="text-sm">{t('letter.bank', { bank: b.bank.name, account: b.bank.account, ifsc: b.bank.ifsc })}</p>
              <p className="text-sm">{t('letter.upi', { upi: b.upiId })}</p>
              {/* Hidden during an open dispute: the amount itself is in question. */}
              {!inv.dispute && (
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <a href={upiUri(b, bal, inv.number)} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-brand px-5 font-medium text-white"><span>{t('cpay.upiPay')}</span><span aria-hidden="true">·</span><Money paise={bal} /></a>
                  <Qr text={upiUri(b, bal, inv.number)} label={t('print.scan')} />
                </div>
              )}
              <p className="mt-2 text-sm font-semibold text-warn">{t('letter.sampleWarn')}</p>
              {!inv.dispute && <p className="text-xs text-muted">{t('cpay.upiNote', { business: b.name })}</p>}
            </Card>
            {inv.dispute && <Notice tone="scenario">{t('cpay.underDispute', { business: b.name })}</Notice>}
            {done === 'paid' && <Notice tone="ok">{t('cpay.thanksPaid', { business: b.name })}</Notice>}
            {done === 'wrong' && <Notice tone="ok">{t('cpay.thanksDispute', { business: b.name })}</Notice>}
            {done === 'msg' && <Notice tone="ok">{t('cpay.thanksMsg')}</Notice>}
            <div className="grid gap-2">
              <Button variant="primary" onClick={() => setMode('paid')} aria-expanded={mode === 'paid'}>{t('cpay.paid')}</Button>
              {!inv.dispute && <Button onClick={() => setMode('wrong')} aria-expanded={mode === 'wrong'}>{t('cpay.wrong')}</Button>}
              <Button variant="ghost" onClick={() => setMode('msg')} aria-expanded={mode === 'msg'}>{t('cpay.message')}</Button>
            </div>
            {mode && (
              <Card>
                <div className="grid gap-3">
                  {mode === 'paid' && <>
                    <Field label={t('cpay.ref')}>{(p) => <input {...p} className={inputCls} value={f.reference} onChange={set('reference')} />}</Field>
                    <Field label={t('cpay.paidDate')}>{(p) => <input {...p} type="date" max={today} className={inputCls} value={f.date} onChange={set('date')} />}</Field>
                    <Field label={t('cpay.amount')}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={f.amount} onChange={set('amount')} placeholder={(bal / 100).toFixed(2)} />}</Field>
                  </>}
                  {mode === 'wrong' && <Field label={t('cpay.whatsWrong')}>{(p) => <textarea {...p} rows={3} className={inputCls} value={f.reason} onChange={set('reason')} />}</Field>}
                  {mode === 'msg' && <Field label={t('cpay.message')}>{(p) => <textarea {...p} rows={3} className={inputCls} value={f.message} onChange={set('message')} />}</Field>}
                  {error && <Notice tone="danger">{error}</Notice>}
                  <Button variant="primary" onClick={submit}>{t('cpay.submit', { business: b.name })}</Button>
                </div>
              </Card>
            )}
          </>
        )}
        <p className="text-sm text-muted">{t('cpay.contact', { owner: b.owner, phone: b.phone, email: b.email })}</p>
      </div>
    </main>
  );
}
