import { useState } from 'react';
import { addDays } from '../utils/dates.js';
import { paiseToRupeeInput, rupeesToPaise } from '../utils/money.js';
import { raiseDispute, recordPayment, recordPromise } from '../services/actions.js';
import { balanceOf } from '../services/invoices.js';
import { useErrorText } from '../hooks/useErrorText.js';
import { useStore } from '../store-context.js';
import { Button, Dialog, Field, Notice, Segmented, inputCls } from './ui.jsx';

// Record the customer's answer (payment, promise or dispute) without leaving the dashboard.
// The same audited actions as the invoice page; the outlook notice then shows the effect.
export function QuickRecord({ inv, open, onClose }) {
  const { t, state, today, run, money, customer } = useStore();
  const errText = useErrorText();
  const balance = balanceOf(state, inv);
  const [kind, setKind] = useState('pay');
  const [f, setF] = useState({ amount: paiseToRupeeInput(balance), date: today, method: 'bank', promise: addDays(today, 7), reason: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = () => {
    const r = kind === 'pay' ? run(recordPayment, inv.id, { amountPaise: rupeesToPaise(f.amount) ?? NaN, date: f.date, method: f.method })
      : kind === 'promise' ? run(recordPromise, inv.id, f.promise, '')
        : run(raiseDispute, inv.id, f.reason, 'owner');
    const m = errText(r);
    setError(m);
    if (m) return;
    setDone(kind === 'pay' ? t('qr.donePay', { amount: money(rupeesToPaise(f.amount)) }) : kind === 'promise' ? t('qr.donePromise') : t('qr.doneDispute'));
    setTimeout(onClose, 1300); // close once the success tick has played; closing earlier is harmless
  };
  const close = () => { setError(null); setDone(null); onClose(); };

  return (
    <Dialog open={open} onClose={close} title={t('qr.title', { company: customer(inv.customerId).name })}
      footer={done ? null : <><Button onClick={close}>{t('common.cancel')}</Button><Button variant={kind === 'dispute' ? 'danger' : 'primary'} onClick={save}>{t('common.save')}</Button></>}>
      {done ? (
        <div className="flex flex-col items-center py-6 text-center" role="status">
          <svg viewBox="0 0 52 52" className="h-16 w-16" aria-hidden="true">
            <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3" className="draw-stroke text-ok" pathLength="1" />
            <path d="M15 27l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="draw-stroke draw-late text-ok" pathLength="1" />
          </svg>
          <p className="mt-3 font-semibold">{done}</p>
          <p className="text-sm text-muted">{t('qr.doneHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">{inv.number} · {t('common.balance')} {money(balance)}</p>
          <Segmented label={t('qr.what')} value={kind} onChange={(v) => { setKind(v); setError(null); }}
            options={[{ value: 'pay', label: t('qr.pay') }, { value: 'promise', label: t('qr.promise') }, { value: 'dispute', label: t('qr.dispute') }]} />
          {kind === 'pay' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('common.amount') + ' (₹)'} className="sm:col-span-2">{(p) => <input {...p} inputMode="decimal" className={inputCls} value={f.amount} onChange={set('amount')} />}</Field>
              <Field label={t('inv.paidOn')}>{(p) => <input {...p} type="date" max={today} className={inputCls} value={f.date} onChange={set('date')} />}</Field>
              <Field label={t('inv.method')}>{(p) => <select {...p} className={inputCls} value={f.method} onChange={set('method')}>{['bank', 'upi', 'cash', 'cheque'].map((m) => <option key={m} value={m}>{t(`pay.method.${m}`)}</option>)}</select>}</Field>
            </div>
          )}
          {kind === 'promise' && <Field label={t('fu.promiseDate')} hint={t('qr.promiseHint')}>{(p) => <input {...p} type="date" min={today} className={inputCls} value={f.promise} onChange={set('promise')} />}</Field>}
          {kind === 'dispute' && <Field label={t('fu.disputeReason')} hint={t('qr.disputeHint')}>{(p) => <textarea {...p} rows={3} className={inputCls} value={f.reason} onChange={set('reason')} />}</Field>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </Dialog>
  );
}
