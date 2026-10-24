import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Card, Disclosure, Empty, Field, Money, Notice, Page, inputCls } from '../components/ui.jsx';
import { useErrorText } from '../hooks/useErrorText.js';
import sampleCsv from '../data/bank-statement.csv?raw';
import { confirmTransaction, importTransactions, linkTransaction, recordPayment, refreshSuggestions, setTransactionStatus } from '../services/actions.js';
import { balanceOf, isOpen } from '../services/invoices.js';
import { parseStatement } from '../services/reconciliation.js';
import { useStore } from '../store-context.js';
import { paiseToRupeeInput, rupeesToPaise } from '../utils/money.js';

function Txn({ x }) {
  const { t, state, run, notify, money, date, invoice, customer } = useStore();
  const errText = useErrorText();
  const s = x.suggestion;
  const openInv = state.invoices.filter((i) => isOpen(state, i));
  const [alloc, setAlloc] = useState(() => (s.allocations.length ? s.allocations : [{ invoiceId: '', amountPaise: 0 }]).map((a) => ({ invoiceId: a.invoiceId, amount: a.amountPaise ? paiseToRupeeInput(a.amountPaise) : '' })));
  const [customerId, setCustomerId] = useState(s.customerId || '');
  const [error, setError] = useState(null);
  const allocations = alloc.filter((a) => a.invoiceId).map((a) => ({ invoiceId: a.invoiceId, amountPaise: rupeesToPaise(a.amount) ?? NaN }));
  const allocated = allocations.reduce((sum, a) => sum + (Number.isNaN(a.amountPaise) ? 0 : a.amountPaise), 0);
  const excess = x.amountPaise - allocated;
  const first = s.allocations[0] && invoice(s.allocations[0].invoiceId);
  const refs = s.refs?.join(', ');
  const why = {
    exact: s.refs?.length ? t('pay.why.exact', { refs }) : t('pay.why.exactName', { company: customer(s.customerId)?.name }),
    partial: s.basis === 'oldestFirst' ? t('pay.why.oldest', { company: customer(s.customerId)?.name }) : t('pay.why.partial', { refs, short: money(s.remainingPaise ?? 0) }),
    multi: s.basis === 'oldestFirst' ? t('pay.why.oldest', { company: customer(s.customerId)?.name }) : t('pay.why.multi', { refs }),
    tds: s.tds && t('pay.why.tds', { short: money(s.tds.shortfallPaise), rate: s.tds.rate, taxable: first ? money(first.taxablePaise) : '' }),
    overpayment: t('pay.why.over', { refs: refs || '—', excess: money(s.excessPaise) }),
    unmatched: t('pay.why.unmatched'),
    alreadyRecorded: s.kind === 'alreadyRecorded' && (() => {
      const p = state.payments.find((y) => y.id === s.paymentId);
      return t('pay.why.recorded', { amount: money(x.amountPaise), invoice: invoice(s.invoiceId)?.number, paidOn: p ? date(p.date) : '—' });
    })(),
  }[s.kind];
  const link = () => {
    const m = errText(run(linkTransaction, x.id, s.paymentId));
    setError(m);
    if (!m) notify(t('pay.linked'));
  };
  const confirm = () => {
    const r = run(confirmTransaction, x.id, { allocations, customerId: excess > 0 ? customerId || null : null });
    const m = errText(r);
    setError(m);
    if (!m) { notify(t('pay.applied', { amount: money(x.amountPaise) })); run(refreshSuggestions); }
  };
  const tone = { high: 'ok', medium: 'warn', low: 'warn', none: 'danger' }[s.confidence];

  return (
    <article className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-medium">{x.description}</div><div className="text-sm text-muted">{date(x.date)} · {x.reference || '—'}</div></div>
        <Money paise={x.amountPaise} className="text-lg font-semibold" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1"><Badge tone="muted">{t('label.unconfirmed')}</Badge><Badge tone={s.kind === 'unmatched' ? 'danger' : s.kind === 'tds' || s.kind === 'overpayment' ? 'warn' : 'brand'}>{t(`pay.kind.${s.kind}`)}</Badge><Badge tone={tone}>{t(`confidence.${s.confidence}`)}</Badge></div>
      <p className="mt-2 text-sm">{why}</p>
      {s.kind === 'tds' && <p className="mt-1 text-sm text-warn">{t('pay.tdsAction')}</p>}
      {x.reviewDuplicate && <Notice tone="warn" className="mt-2">{t('pay.dupWarn')}</Notice>}

      {s.kind === 'alreadyRecorded' ? (
        <>
          {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={link}>{t('pay.linkBtn')}</Button>
            <Button onClick={() => run(setTransactionStatus, x.id, 'held', '')}>{t('pay.hold')}</Button>
          </div>
        </>
      ) : (<>
      <div className="mt-3 space-y-2">
        <div className="text-sm font-medium">{t('pay.allocate')}</div>
        {alloc.map((a, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <Field label={`${t('common.invoice')} ${i + 1}`}>{(p) => (
              <select {...p} className={inputCls} value={a.invoiceId} onChange={(e) => setAlloc(alloc.map((y, j) => (j === i ? { ...y, invoiceId: e.target.value } : y)))}>
                <option value="">{t('pay.chooseInvoice')}</option>
                {openInv.map((inv) => <option key={inv.id} value={inv.id}>{inv.number} · {customer(inv.customerId).name} · {money(balanceOf(state, inv))}</option>)}
              </select>)}</Field>
            <Field label={t('common.amount')}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={a.amount} onChange={(e) => setAlloc(alloc.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />}</Field>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setAlloc([...alloc, { invoiceId: '', amount: '' }])}>+ {t('common.invoice')}</Button>
        {excess !== 0 && (
          <div className="grid gap-2 rounded-lg bg-paper p-3 sm:grid-cols-2">
            <p className="text-sm">{t('pay.excess')}: <Money paise={excess} tone={excess < 0 ? 'danger' : undefined} /></p>
            {excess > 0 && <Field label={t('common.customer')}>{(p) => (
              <select {...p} className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">{t('pay.noCustomer')}</option>{state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>)}</Field>}
          </div>
        )}
      </div>
      {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={confirm} disabled={allocations.length === 0 && excess <= 0}>{t('pay.confirmBtn')}</Button>
        <Button onClick={() => run(setTransactionStatus, x.id, 'held', '')}>{t('pay.hold')}</Button>
        <Button variant="danger" onClick={() => run(setTransactionStatus, x.id, 'ignored', 'Not a customer payment')}>{t('pay.ignore')}</Button>
      </div>
      </>)}
    </article>
  );
}

export default function Payments() {
  const { t, state, today, run, notify, money, date, invoice, customer } = useStore();
  const errText = useErrorText();
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState({ invoiceId: '', amount: '', date: today, method: 'bank' });
  const [manualErr, setManualErr] = useState(null);

  const doImport = (text, name) => {
    const parsed = parseStatement(text, { today });
    if (!parsed.ok) return setResult({ tone: 'danger', msg: t(`pay.importFail.${parsed.error}`, { missing: parsed.missing?.join(', ') }) });
    const r = run(importTransactions, parsed, name);
    setResult({ tone: 'ok', msg: t('pay.imported', { added: r.added, skipped: r.skipped }), errors: parsed.errors });
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) return setResult({ tone: 'danger', msg: t('pay.importFail.size') });
    doImport(await file.text(), file.name);
    e.target.value = '';
  };
  const pending = state.bankTxns.filter((x) => x.status === 'pending');
  const confirmed = state.bankTxns.filter((x) => x.status === 'confirmed');
  const other = state.bankTxns.filter((x) => x.status === 'ignored' || x.status === 'held');
  const openInv = state.invoices.filter((i) => isOpen(state, i));

  return (
    <Page title={t('pay.title')} subtitle={t('pay.subtitle')}>
      <Card title={t('pay.import')} hint={t('pay.format')}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-lg border border-brand bg-brand px-4 font-medium text-white">
            {t('pay.import')}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
          </label>
          <Button onClick={() => doImport(sampleCsv, 'bank-statement.csv')}>{t('pay.useSample')}</Button>
          <a href={`${import.meta.env.BASE_URL}bank-statement.csv`} download className="inline-flex min-h-12 items-center px-2 text-brand underline">{t('pay.download')}</a>
        </div>
        {result && <Notice tone={result.tone} className="mt-3">{result.msg}{result.errors?.length ? ` ${t('pay.importErrors', { n: result.errors.length, rows: result.errors.map((e) => `#${e.line} (${e.error})`).join(', ') })}` : ''}</Notice>}
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('pay.review')} ({pending.length})</h2>
        {pending.length === 0 ? (
          <Empty>
            {t(state.imports.length === 0 ? 'pay.noneImport' : 'pay.none')}
            {state.imports.length === 0 && <Button className="mt-2" onClick={() => doImport(sampleCsv, 'bank-statement.csv')}>{t('pay.useSample')}</Button>}
          </Empty>
        ) : <div className="grid gap-3 lg:grid-cols-2">{pending.map((x) => <Txn key={x.id} x={x} />)}</div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`${t('pay.confirmed')} (${confirmed.length})`}>
          {confirmed.length === 0 ? <Empty>{t('pay.confirmedNone')}</Empty> : (
            <ul className="divide-y divide-line text-sm">{confirmed.map((x) => (
              <li key={x.id} className="py-2">
                <div className="flex justify-between gap-2"><span>{x.description}</span><Money paise={x.amountPaise} /></div>
                <div className="text-muted">{x.confirmed.allocations.map((a) => <Link key={a.invoiceId} to={`/invoices/${a.invoiceId}`} className="mr-2 font-medium text-brand hover:underline">{invoice(a.invoiceId)?.number} {money(a.amountPaise)}</Link>)}
                  {x.confirmed.excessPaise > 0 && `${t('pay.excess')} ${money(x.confirmed.excessPaise)} (${customer(x.confirmed.customerId)?.name})`}</div>
              </li>))}</ul>
          )}
        </Card>
        <Card title={t('pay.ignored')}>
          {other.length === 0 ? <Empty>{t('pay.otherNone')}</Empty> : (
            <ul className="divide-y divide-line text-sm">{other.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{x.description} · <Money paise={x.amountPaise} /> <Badge tone="muted">{x.status}</Badge></span>
                <Button onClick={() => run(setTransactionStatus, x.id, 'pending', '')}>{t('pay.reopen')}</Button>
              </li>))}</ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Disclosure summary={t('pay.manual')}>
          <div className="grid gap-2">
            <Field label={t('common.invoice')}>{(p) => (
              <select {...p} className={inputCls} value={manual.invoiceId} onChange={(e) => setManual({ ...manual, invoiceId: e.target.value })}>
                <option value="">{t('pay.chooseInvoice')}</option>{openInv.map((i) => <option key={i.id} value={i.id}>{i.number} · {customer(i.customerId).name} · {money(balanceOf(state, i))}</option>)}
              </select>)}</Field>
            <Field label={t('common.amount')} error={manualErr}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} />}</Field>
            <Field label={t('inv.paidOn')}>{(p) => <input {...p} type="date" max={today} className={inputCls} value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />}</Field>
            <Field label={t('inv.method')}>{(p) => <select {...p} className={inputCls} value={manual.method} onChange={(e) => setManual({ ...manual, method: e.target.value })}>{['bank', 'upi', 'cash', 'cheque'].map((m) => <option key={m} value={m}>{t(`pay.method.${m}`)}</option>)}</select>}</Field>
            <Button variant="primary" onClick={() => {
              const r = run(recordPayment, manual.invoiceId, { amountPaise: rupeesToPaise(manual.amount), date: manual.date, method: manual.method });
              const m = errText(r); setManualErr(m);
              if (!m) { notify(t('pay.applied', { amount: manual.amount })); setManual({ ...manual, amount: '' }); }
            }}>{t('common.confirm')}</Button>
          </div>
        </Disclosure>
        <Card title={t('pay.history')}>
          {state.imports.length === 0 ? <Empty>{t('pay.historyNone')}</Empty> : (
            <ul className="text-sm">{state.imports.map((i) => <li key={i.id}>{date(i.date)} · {i.fileName} · +{i.added} / {i.skipped} skipped / {i.errors} errors</li>)}</ul>
          )}
          {state.credits.length > 0 && (
            <div className="mt-3"><h3 className="text-sm font-semibold">{t('pay.credits')}</h3>
              <ul className="text-sm">{state.credits.map((c) => <li key={c.id}>{customer(c.customerId)?.name}: {money(c.amountPaise)} ({date(c.date)})</li>)}</ul></div>
          )}
        </Card>
      </div>
    </Page>
  );
}
