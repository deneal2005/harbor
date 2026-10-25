import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { BusinessMark } from '../components/BusinessMark.jsx';
import { HarborLockup } from '../components/HarborLockup.jsx';
import { Qr } from '../components/Qr.jsx';
import { Button, Card, Field, Money, Notice, inputCls } from '../components/ui.jsx';
import { useErrorText } from '../hooks/useErrorText.js';
import { api } from '../services/session.js';
import { useStore } from '../store-context.js';
import { rupeesToPaise } from '../utils/money.js';
import { upiUri } from '../utils/upi.js';

// Customer-facing view, read from the server by the link's token. The server sends only this one
// invoice's figures and runs the customer's report through the same rules as the owner's app.
export default function CustomerPay() {
  const { token } = useParams();
  const { t, date, lang } = useStore();
  const errText = useErrorText();
  const [view, setView] = useState(undefined); // undefined: loading, null: not a valid link
  const [mode, setMode] = useState(null);
  const [f, setF] = useState({ reference: '', date: '', amount: '', reason: '', message: '' });
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    api(`/api/pay/${encodeURIComponent(token)}`).then((r) => {
      setView(r.status === 200 ? r.body : null);
      if (r.status === 200) setF((x) => ({ ...x, date: r.body.today }));
    });
  }, [token]);

  if (view === undefined) return <main className="mx-auto max-w-lg p-6" role="status">{t('common.loading')}</main>;
  if (!view) return <main className="mx-auto max-w-lg p-6"><Notice tone="danger">{t('cpay.invalid')}</Notice></main>;
  const { business: b, invoice: inv, today } = view;
  const bal = view.balancePaise;
  const submit = async () => {
    const kind = mode === 'paid' ? 'claim' : mode === 'wrong' ? 'dispute' : 'message';
    const body = mode === 'paid' ? { reference: f.reference, date: f.date, amountPaise: rupeesToPaise(f.amount) }
      : mode === 'wrong' ? { reason: f.reason } : { message: f.message };
    setBusy(true);
    const r = await api(`/api/pay/${encodeURIComponent(token)}/${kind}`, body);
    setBusy(false);
    const m = r.status === 200 ? null : r.status === 0 ? t('app.offline') : errText({ error: r.body.error || 'notFound' });
    setError(m);
    if (r.body.view) setView(r.body.view);
    if (!m) { setDone(mode); setMode(null); }
  };

  return (
    <main className="min-h-screen bg-paper" lang={lang}>
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        {b.sample && <p className="rounded-lg border border-warn/40 bg-warn-soft p-2 text-sm text-warn">{t('cpay.demo')}</p>}
        <header className="flex items-center gap-3">
          <BusinessMark business={b} className="h-12 w-12 rounded-lg text-lg" />
          <div className="min-w-0"><h1 className="text-xl font-semibold">{t('cpay.title', { business: b.name })}</h1><p className="text-sm text-muted">{view.customerName}</p></div>
        </header>
        <Card>
          <div className="text-sm text-muted">{inv.number} · {date(inv.date)}</div>
          <dl className="mt-2 grid grid-cols-2 gap-y-1">
            <dt>{t('cpay.original')}</dt><dd className="text-right"><Money paise={inv.totalPaise} /></dd>
            <dt>{t('cpay.received')}</dt><dd className="text-right"><Money paise={view.receivedPaise} /></dd>
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
              {!inv.disputed && (
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <a href={upiUri(b, bal, inv.number)} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-brand px-5 font-medium text-white"><span>{t('cpay.upiPay')}</span><span aria-hidden="true">·</span><Money paise={bal} /></a>
                  <Qr text={upiUri(b, bal, inv.number)} label={t('print.scan')} />
                </div>
              )}
              {b.sample && <p className="mt-2 text-sm font-semibold text-warn">{t('letter.sampleWarn')}</p>}
              {!inv.disputed && <p className="text-xs text-muted">{t('cpay.upiNote', { business: b.name })}</p>}
            </Card>
            {inv.disputed && <Notice tone="scenario">{t('cpay.underDispute', { business: b.name })}</Notice>}
            {done === 'paid' && <Notice tone="ok">{t('cpay.thanksPaid', { business: b.name })}</Notice>}
            {done === 'wrong' && <Notice tone="ok">{t('cpay.thanksDispute', { business: b.name })}</Notice>}
            {done === 'msg' && <Notice tone="ok">{t('cpay.thanksMsg')}</Notice>}
            <div className="grid gap-2">
              <Button variant="primary" onClick={() => setMode('paid')} aria-expanded={mode === 'paid'}>{t('cpay.paid')}</Button>
              {!inv.disputed && <Button onClick={() => setMode('wrong')} aria-expanded={mode === 'wrong'}>{t('cpay.wrong')}</Button>}
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
                  <Button variant="primary" onClick={submit} disabled={busy}>{t('cpay.submit', { business: b.name })}</Button>
                </div>
              </Card>
            )}
          </>
        )}
        <p className="text-sm text-muted">{t('cpay.contact', { owner: b.owner, phone: b.phone, email: b.email })}</p>
        <div className="flex justify-center pt-2">
          <HarborLockup flat markClass="h-4 w-4" wordClass="text-[11px]" gapClass="gap-1.5" />
        </div>
      </div>
    </main>
  );
}
