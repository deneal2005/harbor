import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { TrailList } from '../components/Trail.jsx';
import { CalendarClock, Flag, FolderOpen, HandCoins, Printer, Receipt, Undo2 } from 'lucide-react';
import { Badge, Button, ButtonLink, Card, Dialog, Field, Money, Notice, Page, StatusBadge, inputCls } from '../components/ui.jsx';
import { useErrorText } from '../hooks/useErrorText.js';
import { appUrl } from '../utils/appUrl.js';
import { raiseDispute, recordAdjustment, recordPayment, recordPromise, resetStage, resolveDispute, setStopped } from '../services/actions.js';
import { adjustedOn, balanceOf, paidOn, statusOf } from '../services/invoices.js';
import { expectedDate } from '../services/forecasting.js';
import { ladderState } from '../services/reminders.js';
import { useStore } from '../store-context.js';
import { addDays } from '../utils/dates.js';
import { formatINR, rupeesToPaise } from '../utils/money.js';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { t, state, today, run, notify, money, date, customer, invoice } = useStore();
  const errText = useErrorText();
  const inv = invoice(id);
  const [pay, setPay] = useState({ amount: '', date: today, method: 'bank', note: '' });
  const [res, setRes] = useState({ resolution: 'resume', credit: '', note: '' });
  const [adj, setAdj] = useState({ type: 'tds', amount: '', note: '' });
  const [reset, setReset] = useState({ stage: '', reason: '' });
  const [promiseDate, setPromiseDate] = useState(addDays(today, 7));
  const [disputeReason, setDisputeReason] = useState('');
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const close = () => { setDialog(null); setError(null); };
  if (!inv) return <Page title={t('common.notFound')}><ButtonLink to="/invoices">{t('common.back')}</ButtonLink></Page>;
  const c = customer(inv.customerId);
  const status = statusOf(state, inv, today);
  const balance = balanceOf(state, inv);
  const ladder = ladderState(state, inv, today);
  const exp = balance > 0 ? expectedDate(state, inv, today) : null;
  const act = (r, ok) => { const m = errText(r); setError(m); if (!m) notify(ok); return !m; };
  const items = [...state.payments.filter((p) => p.invoiceId === inv.id).map((p) => ({ ...p, kind: 'pay' })), ...state.adjustments.filter((a) => a.invoiceId === inv.id).map((a) => ({ ...a, kind: 'adj' }))]
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Page title={t('inv.detail', { number: inv.number || t('status.draft') })} subtitle={c.name}
      actions={<><ButtonLink icon={Printer} to={`/print/invoice/${inv.id}`}>{t('inv.printInvoice')}</ButtonLink><ButtonLink icon={FolderOpen} to={`/print/pack/${inv.id}`}>{t('inv.evidence')}</ButtonLink></>}>
      {inv.status === 'draft' && <Notice tone="info"><Link to={`/invoices/${inv.id}/edit`} className="font-medium text-brand hover:underline">{t('inv.draftEdit')}</Link></Notice>}
      {inv.dispute && <Notice tone="scenario">⚑ {t('inv.disputeNote', { reason: inv.dispute.reason })} — {t('inbox.paused')}</Notice>}
      {inv.claim && <Notice tone="warn">{t('inv.claim', { amount: money(inv.claim.amountPaise), date: date(inv.claim.date), ref: inv.claim.reference })} — <Link to="/inbox" className="font-medium text-brand hover:underline">{t('nav.inbox')}</Link></Notice>}
      {error && !dialog && <Notice tone="danger">{error}</Notice>}

      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('common.status')}</div><div className="mt-1"><StatusBadge status={status} /></div></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('common.total')}</div><Money paise={inv.totalPaise} className="text-xl font-semibold" /></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('label.confirmed')}</div><Money paise={paidOn(state, inv.id) + adjustedOn(state, inv.id)} className="text-xl font-semibold text-ok" /></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('common.balance')}</div><Money paise={balance} className="text-xl font-semibold" />
          {exp && <div className="text-sm text-muted">{t('radar.expectedOn', { date: date(exp.date), basis: t(`basis.${exp.basis}`) })}</div>}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card title={t('inv.payments')}>
            {items.length === 0 ? <p className="text-muted">{t('inv.noPayments')}</p> : (
              <ul className="divide-y divide-line text-sm">
                {items.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{date(p.date)} · {p.kind === 'pay' ? t(`pay.method.${p.method}`) !== `pay.method.${p.method}` ? t(`pay.method.${p.method}`) : p.method : t(`inv.adj.${p.type}`)} {p.note && <span className="text-muted">· {p.note}</span>}</span>
                    <span><Badge tone="ok">{t('label.confirmed')}</Badge> <Money paise={p.amountPaise} /></span>
                  </li>
                ))}
              </ul>
            )}
            {balance > 0 && inv.status !== 'draft' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" icon={HandCoins} onClick={() => setDialog('pay')}>{t('inv.recordPayment')}</Button>
                <Button icon={Receipt} onClick={() => setDialog('adj')}>{t('inv.adjust')}</Button>
                <Button icon={CalendarClock} onClick={() => setDialog('promise')}>{t('fu.promise')}</Button>
                {!inv.dispute && <Button icon={Flag} onClick={() => setDialog('dispute')}>{t('fu.dispute')}</Button>}
              </div>
            )}
            <p className="mt-3 text-sm text-muted">{t('inv.noDelete')}</p>
          </Card>

          {inv.dispute && (
            <Card title={t('inv.resolve')} tone="scenario">
              <div className="grid gap-2">
                <fieldset className="space-y-1">
                  <legend className="text-sm font-medium">{t('inv.resolution')}</legend>
                  {['resume', 'credit', 'stop'].map((r) => (
                    <label key={r} className="flex min-h-12 items-center gap-2"><input type="radio" name="res" checked={res.resolution === r} onChange={() => setRes({ ...res, resolution: r })} className="h-5 w-5" />{t(`inv.res.${r}`)}</label>
                  ))}
                </fieldset>
                {res.resolution === 'credit' && <Field label={t('inv.creditAmount')}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={res.credit} onChange={(e) => setRes({ ...res, credit: e.target.value })} />}</Field>}
                <Field label={t('common.note')}>{(p) => <textarea {...p} rows={2} className={inputCls} value={res.note} onChange={(e) => setRes({ ...res, note: e.target.value })} />}</Field>
                <Button variant="primary" onClick={() => act(run(resolveDispute, inv.id, { resolution: res.resolution, creditPaise: rupeesToPaise(res.credit) ?? 0, note: res.note }), t('common.saved'))}>{t('inv.resolve')}</Button>
              </div>
            </Card>
          )}

          <Card title={t('inv.timeline')}>
            <TrailList events={[...state.trail.filter((e) => e.invoiceId === inv.id || e.detail?.allocations?.some((a) => a.invoiceId === inv.id))].reverse()} />
            <p className="mt-2 text-sm text-muted">{date(inv.date)} · {t('ev.invoice-issued')} · {money(inv.totalPaise)}</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t('common.details')}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">{t('inv.date')}</dt><dd>{date(inv.date)}</dd>
              <dt className="text-muted">{t('common.dueDate')}</dt><dd>{date(inv.dueDate)}</dd>
              <dt className="text-muted">{t('cust.credit')}</dt><dd>{t('common.days', { n: inv.creditDays })}</dd>
              <dt className="text-muted">{t('new.place')}</dt><dd>{inv.placeOfSupply}</dd>
              <dt className="text-muted">{t('new.taxable')}</dt><dd><Money paise={inv.taxablePaise} /></dd>
              <dt className="text-muted">{t('common.customer')}</dt><dd><Link to={`/customers/${c.id}`} className="font-medium text-brand hover:underline">{c.name}</Link></dd>
            </dl>
          </Card>
          {inv.status !== 'draft' && (
            <Card title={t('inv.ladder')}>
              <ol className="space-y-1 text-sm">
                {state.settings.ladder.map((s) => {
                  const sent = inv.reminders[s.id];
                  return (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2">
                      <span>{t(`stage.${s.id}`)} <span className="text-muted">({date(addDays(inv.dueDate, s.offset))})</span></span>
                      {sent ? <Badge tone="ok">✓ {date(sent.date)}</Badge> : ladder.dueStage?.id === s.id ? <Badge tone="warn">{t('fu.due')}</Badge> : <span className="text-muted">—</span>}
                    </li>
                  );
                })}
              </ol>
              {ladder.paused && <p className="mt-2 text-sm text-scenario">⏸ {t(`fu.pausedReason.${ladder.paused}`, { date: date(inv.promise?.date || inv.snoozedUntil) })}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {balance > 0 && <Button onClick={() => act(run(setStopped, inv.id, !inv.stopped, ''), t('common.saved'))}>{inv.stopped ? t('inv.resume') : t('inv.stop')}</Button>}
              </div>
              {Object.keys(inv.reminders).length > 0 && <Button variant="ghost" icon={Undo2} className="mt-2" onClick={() => setDialog('reset')}>{t('inv.resetStage')}</Button>}
            </Card>
          )}
          {inv.token && (
            <Card title={t('inv.customerLink')}>
              <p className="break-all text-sm text-muted">{appUrl()}/pay/{inv.token}</p>
              <ButtonLink to={`/pay/${inv.token}`} className="mt-2">{t('inv.openAsCustomer')}</ButtonLink>
            </Card>
          )}
          <Card title={t('inv.documents')}>
            <div className="flex flex-wrap gap-2">
              <ButtonLink to={`/print/invoice/${inv.id}`}>{t('inv.printInvoice')}</ButtonLink>
              {status === 'overdue' && <ButtonLink to={`/print/letter/${c.id}`}>{t('inv.letter')}</ButtonLink>}
              <ButtonLink to={`/print/pack/${inv.id}`}>{t('inv.evidence')}</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
      <Dialog open={dialog === 'pay'} onClose={close} title={t('inv.recordPayment')}
        footer={<><Button onClick={close}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => act(run(recordPayment, inv.id, { amountPaise: rupeesToPaise(pay.amount), date: pay.date, method: pay.method }), t('pay.applied', { amount: pay.amount })) && (setPay({ ...pay, amount: '' }), close())}>{t('common.confirm')}</Button></>}>
        <p className="text-sm text-muted">{t('common.balance')}: {formatINR(balance)}</p>
        <Field label={t('common.amount') + ' (₹)'}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={(balance / 100).toFixed(2)} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inv.paidOn')}>{(p) => <input {...p} type="date" max={today} className={inputCls} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />}</Field>
          <Field label={t('inv.method')}>{(p) => <select {...p} className={inputCls} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{['bank', 'upi', 'cash', 'cheque'].map((m) => <option key={m} value={m}>{t(`pay.method.${m}`)}</option>)}</select>}</Field>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </Dialog>
      <Dialog open={dialog === 'promise'} onClose={close} title={t('fu.promise')}
        footer={<><Button onClick={close}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => act(run(recordPromise, inv.id, promiseDate, ''), t('common.saved')) && close()}>{t('common.save')}</Button></>}>
        <Field label={t('fu.promiseDate')}>{(p) => <input {...p} type="date" min={today} className={inputCls} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />}</Field>
        {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
      </Dialog>
      <Dialog open={dialog === 'dispute'} onClose={close} title={t('fu.dispute')}
        footer={<><Button onClick={close}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => act(run(raiseDispute, inv.id, disputeReason, 'owner'), t('common.saved')) && (setDisputeReason(''), close())}>{t('common.save')}</Button></>}>
        <Field label={t('fu.disputeReason')}>{(p) => <textarea {...p} rows={3} className={inputCls} value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />}</Field>
        {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
      </Dialog>
      <Dialog open={dialog === 'adj'} onClose={close} title={t('inv.adjust')}
        footer={<><Button onClick={close}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => act(run(recordAdjustment, inv.id, { type: adj.type, amountPaise: rupeesToPaise(adj.amount), note: adj.note }), t('common.saved')) && close()}>{t('common.confirm')}</Button></>}>
        <Field label={t('inv.adjType')}>{(p) => <select {...p} className={inputCls} value={adj.type} onChange={(e) => setAdj({ ...adj, type: e.target.value })}>{['tds', 'credit-note', 'write-off'].map((m) => <option key={m} value={m}>{t(`inv.adj.${m}`)}</option>)}</select>}</Field>
        <Field label={t('common.amount') + ' (₹)'}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />}</Field>
        <Field label={t('common.reason')}>{(p) => <input {...p} className={inputCls} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </Dialog>
      <Dialog open={dialog === 'reset'} onClose={close} title={t('inv.resetStage')}
        footer={<><Button onClick={close}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => act(run(resetStage, inv.id, reset.stage, reset.reason), t('common.saved')) && close()}>{t('common.confirm')}</Button></>}>
        <Field label={t('fu.stage')}>{(p) => <select {...p} className={inputCls} value={reset.stage} onChange={(e) => setReset({ ...reset, stage: e.target.value })}><option value="">—</option>{Object.keys(inv.reminders).map((k) => <option key={k} value={k}>{t(`stage.${k}`)}</option>)}</select>}</Field>
        <Field label={t('inv.resetReason')}>{(p) => <input {...p} className={inputCls} value={reset.reason} onChange={(e) => setReset({ ...reset, reason: e.target.value })} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </Dialog>
    </Page>
  );
}
