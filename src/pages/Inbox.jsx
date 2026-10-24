import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, ButtonLink, Card, Empty, Field, Notice, Page, inputCls } from '../components/ui.jsx';
import { useErrorText } from '../hooks/useErrorText.js';
import { confirmClaim, rejectClaim } from '../services/actions.js';
import { balanceOf } from '../services/invoices.js';
import { useStore } from '../store-context.js';
import { paiseToRupeeInput, rupeesToPaise } from '../utils/money.js';

function Item({ item }) {
  const { t, state, run, notify, date, money, invoice, customer } = useStore();
  const errText = useErrorText();
  const inv = invoice(item.invoiceId);
  const [amount, setAmount] = useState(item.data.amountPaise ? paiseToRupeeInput(Math.min(item.data.amountPaise, balanceOf(state, inv))) : '');
  const [evidence, setEvidence] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const act = (r) => { const m = errText(r); setError(m); if (!m) notify(t('common.saved')); };
  return (
    <article className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{t(`inbox.type.${item.type}`)}</div>
          <div className="text-sm text-muted"><Link to={`/invoices/${inv.id}`} className="font-medium text-brand hover:underline">{inv.number}</Link> · {customer(inv.customerId).name} · {date(item.date)}</div>
        </div>
        <Badge tone={item.status === 'pending' ? 'warn' : item.status === 'confirmed' ? 'ok' : 'muted'}>{t(`inbox.status.${item.status}`)}</Badge>
      </div>
      {item.type === 'payment-report' && <p className="mt-2 text-sm">{t('inv.claim', { amount: money(item.data.amountPaise), date: date(item.data.date), ref: item.data.reference })}</p>}
      {item.type === 'dispute' && <p className="mt-2 text-sm">“{item.data.reason}”</p>}
      {item.type === 'reply' && <p className="mt-2 text-sm">“{item.data.message}”</p>}
      {item.resolution && <p className="mt-2 text-sm text-muted">→ {item.resolution.evidence || item.resolution.reason || item.resolution.note} ({date(item.resolution.date)})</p>}
      {item.status === 'pending' && item.type === 'payment-report' && (
        <div className="mt-3 space-y-2">
          <Notice tone="info">{t('inbox.claimNote')}</Notice>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('common.amount')}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
            <Field label={t('inbox.evidence')}>{(p) => <input {...p} className={inputCls} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Bank statement 22 Oct, UTR …" />}</Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => act(run(confirmClaim, item.id, { amountPaise: rupeesToPaise(amount), date: item.data.date, evidence }))}>{t('inbox.confirm')}</Button>
          </div>
          <Field label={t('inbox.rejectReason')}>{(p) => <input {...p} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <Button variant="danger" onClick={() => act(run(rejectClaim, item.id, reason))}>{t('inbox.reject')}</Button>
        </div>
      )}
      {item.status === 'pending' && item.type === 'dispute' && (
        <div className="mt-3"><p className="mb-2 text-sm text-scenario">⏸ {t('inbox.paused')}</p><ButtonLink to={`/invoices/${inv.id}`} variant="primary">{t('inv.resolve')}</ButtonLink></div>
      )}
      {item.status === 'pending' && item.type === 'reply' && (
        <div className="mt-3 grid gap-2">
          <Field label={t('common.note')}>{(p) => <input {...p} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <Button onClick={() => act(run(rejectClaim, item.id, reason))}>{t('common.confirm')}</Button>
        </div>
      )}
      {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
    </article>
  );
}

export default function Inbox() {
  const { t, state } = useStore();
  const pending = state.inbox.filter((i) => i.status === 'pending').reverse();
  const done = state.inbox.filter((i) => i.status !== 'pending').reverse();
  return (
    <Page title={t('inbox.title')} subtitle={t('inbox.subtitle')}>
      <section className="space-y-3"><h2 className="text-xl font-semibold">{t('inbox.pending')} ({pending.length})</h2>
        {pending.length === 0 ? <Empty>{t('inbox.none')}</Empty> : pending.map((i) => <Item key={i.id} item={i} />)}</section>
      {done.length > 0 && <Card title={t('inbox.done')}><div className="space-y-3">{done.map((i) => <Item key={i.id} item={i} />)}</div></Card>}    </Page>
  );
}
