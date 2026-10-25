import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BusinessMark } from '../components/BusinessMark.jsx';
import { Qr } from '../components/Qr.jsx';
import { LETTER, stateLabel, stateName } from '../data/config.js';
import { calculateInvoice } from '../services/gst.js';
import { isMse, msmedInterest } from '../services/msmed.js';
import { adjustedOn, balanceOf, daysOverdue, isOpen, paidOn } from '../services/invoices.js';
import { useStore } from '../store-context.js';
import { HarborLockup } from '../components/HarborLockup.jsx';
import { upiUri } from '../utils/upi.js';
import { addDays } from '../utils/dates.js';
import { amountInWords } from '../utils/money.js';
import { makeT } from '../i18n/translate.js';

function Sheet({ children }) {
  const { t } = useStore();
  return (
    <div className="min-h-screen bg-paper py-4 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap gap-2 px-4">
        <Link to={-1} onClick={(e) => { e.preventDefault(); window.history.back(); }} className="inline-flex min-h-12 items-center rounded-lg border border-line bg-white px-4">← {t('doc.backToApp')}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center rounded-lg bg-brand px-4 font-medium text-white">{t('common.print')}</button>
      </div>
      <article className="print-sheet mx-auto max-w-[210mm] bg-white p-6 text-[13px] leading-snug text-ink shadow sm:p-10">
        {children}
        {/* Small Harbor lockup at the foot of every printed document (paper only). */}
        <footer className="print-only mt-6 flex items-center border-t border-line pt-2">
          <HarborLockup flat markClass="h-3 w-3" wordClass="text-[9px]" gapClass="gap-1.5" />
        </footer>
      </article>
    </div>
  );
}

// Documents print in English by default; optional Hindi headings next to the English ones.
function useDocT() {
  const { state } = useStore();
  const en = makeT('en');
  const hi = makeT('hi');
  return (k, v) => (state.settings.bilingualDocs ? `${en(k, v)} / ${hi(k, v)}` : en(k, v));
}

const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const inr = (p) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(p / 100);

function SampleBanner() {
  return <p className="mb-3 border border-dashed border-warn p-1.5 text-center text-[11px] font-semibold text-warn">{makeT('en')('letter.sampleWarn')}</p>;
}

export function PrintInvoice() {
  const { id } = useParams();
  const { state, invoice, customer } = useStore();
  const d = useDocT();
  const inv = invoice(id);
  if (!inv) return <Sheet>Not found.</Sheet>;
  const c = customer(inv.customerId);
  const b = state.business;
  const calc = calculateInvoice({ lines: inv.lines, business: b, placeOfSupply: inv.placeOfSupply });
  const bal = balanceOf(state, inv);
  return (
    <Sheet>
      <SampleBanner />
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-3">
        <div>
          <BusinessMark business={b} className="h-10 w-10 text-lg" />
          <div className="mt-1 text-lg font-bold">{b.name}</div>
          <div>{b.address}, {stateLabel(b.stateCode)}</div>
          {b.registrationType !== 'unregistered' && <div>GSTIN: {b.gstin}</div>}
          <div>{b.phone} · {b.email}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold uppercase tracking-wide">{d(`new.doc.${inv.docType}`)}</div>
          <div className="text-muted">{d('print.original')}</div>
          <div className="mt-2">No. <strong>{inv.number || 'DRAFT'}</strong></div>
          <div>Date: {fmtDate(inv.date)}</div>
          <div>Due: {fmtDate(inv.dueDate)}</div>
        </div>
      </header>
      <section className="grid gap-4 border-b border-line py-3 sm:grid-cols-2">
        <div><div className="font-semibold">{d('print.billTo')}</div><div>{c.name}</div><div>{inv.billingAddress}</div>{c.gstin && <div>GSTIN: {c.gstin}</div>}</div>
        <div>
          {inv.deliveryAddress && <><div className="font-semibold">{d('print.shipTo')}</div><div>{inv.deliveryAddress}</div></>}
          <div>{d('print.place')}: {stateLabel(inv.placeOfSupply)}</div>
          <div>{d('print.reverse')}: {inv.reverseCharge ? 'Yes' : 'No'}</div>
        </div>
      </section>
      <table className="mt-3 w-full border-collapse text-[12px]">
        <thead><tr className="border-b border-ink text-left">
          <th className="py-1">#</th><th>Description</th><th>HSN/SAC</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Disc</th><th className="text-right">Taxable</th>
          {calc.collectsGst && (calc.interState ? <th className="text-right">IGST</th> : <><th className="text-right">CGST</th><th className="text-right">SGST</th></>)}
          <th className="text-right">Amount</th>
        </tr></thead>
        <tbody>
          {calc.ok && calc.lines.map((l, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-1">{i + 1}</td><td>{l.description}</td><td>{l.hsn}</td><td className="text-right">{l.qty} {l.unit}</td><td className="text-right">{inr(l.ratePaise)}</td><td className="text-right">{l.discountPct}%</td>
              <td className="text-right">{inr(l.taxablePaise)}</td>
              {calc.collectsGst && (calc.interState ? <td className="text-right">{l.taxRate}%<br />{inr(l.igstPaise)}</td> : <><td className="text-right">{l.taxRate / 2}%<br />{inr(l.cgstPaise)}</td><td className="text-right">{l.taxRate / 2}%<br />{inr(l.sgstPaise)}</td></>)}
              <td className="text-right">{inr(l.lineTotalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {calc.ok && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-sm">
            <div className="font-semibold">Amount in words</div><div>{amountInWords(calc.totalPaise)}</div>
            {b.registrationType === 'composition' && <p className="mt-2 italic">{makeT('en')('print.compositionNote')}</p>}
            <p className="mt-2">{makeT('en')('print.terms', { date: fmtDate(inv.dueDate) })}</p>
            <p className="mt-1">Bank: {b.bank.name}, A/c {b.bank.account}, IFSC {b.bank.ifsc} · UPI: {b.upiId}</p>
            <p className="mt-1 text-[11px] text-muted">{makeT('en')('new.noEinvoice')}</p>
          </div>
          <table className="text-[12px]"><tbody>
            <tr><td className="pr-4">Taxable value</td><td className="text-right">{inr(calc.taxablePaise)}</td></tr>
            {calc.interState ? <tr><td>IGST</td><td className="text-right">{inr(calc.igstPaise)}</td></tr> : calc.collectsGst && <><tr><td>CGST</td><td className="text-right">{inr(calc.cgstPaise)}</td></tr><tr><td>SGST</td><td className="text-right">{inr(calc.sgstPaise)}</td></tr></>}
            <tr><td>Round-off</td><td className="text-right">{inr(calc.roundOffPaise)}</td></tr>
            <tr className="border-t-2 border-ink text-base font-bold"><td>Total</td><td className="text-right">{inr(calc.totalPaise)}</td></tr>
            {bal !== calc.totalPaise && inv.status !== 'draft' && <tr><td>Balance due</td><td className="text-right font-semibold">{inr(bal)}</td></tr>}
          </tbody></table>
        </div>
      )}
      <footer className="mt-6 flex flex-wrap items-end justify-between gap-4">
        {inv.status !== 'draft' && bal > 0 && <Qr text={upiUri(b, bal, inv.number)} label={makeT('en')('print.scan')} />}
        <div className="text-right"><div>For {b.name}</div><div className="mt-10 border-t border-ink pt-1">{d('print.signature')}</div></div>
      </footer>
    </Sheet>
  );
}

export function PrintLetter() {
  const { customerId } = useParams();
  const { state, today, customer, t } = useStore();
  const [addInterest, setAddInterest] = useState(false);
  const en = makeT('en');
  const d = useDocT();
  const c = customer(customerId);
  if (!c) return <Sheet>Not found.</Sheet>;
  const b = state.business;
  const rows = state.invoices.filter((i) => i.customerId === c.id && isOpen(state, i) && daysOverdue(i, today) > 0).sort((a, x) => a.dueDate.localeCompare(x.dueDate));
  const owed = rows.reduce((a, i) => a + balanceOf(state, i), 0);
  const mse = isMse(b);
  const interestRows = mse ? rows.map((i) => ({ inv: i, ...msmedInterest({ principalPaise: balanceOf(state, i), invoiceDate: i.date, dueDate: i.dueDate, today }) })).filter((r) => r.interestPaise > 0) : [];
  const interest = interestRows.reduce((a, r) => a + r.interestPaise, 0);
  // Interest is never part of the demand unless the owner ticks the box.
  const total = owed + (addInterest ? interest : 0);
  const deadline = addDays(today, LETTER.deadlineDays);
  return (
    <Sheet>
      <SampleBanner />
      <header className="border-b border-line pb-3">
        <BusinessMark business={b} className="h-10 w-10 text-lg" />
        <div className="mt-1 text-lg font-bold">{b.name}</div>
        <div>{b.address}, {stateName(b.stateCode)} · GSTIN {b.gstin}</div>
        <div>{b.phone} · {b.email}</div>
      </header>
      <h1 className="mt-4 text-xl font-bold">{d('letter.title')}</h1>
      <p className="mt-2 rounded border-2 border-ink p-2 font-semibold">{en('letter.disclaimer', { business: b.name })}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><div className="font-semibold">{d('letter.to')}</div><div>{c.contactName}</div><div>{c.name}</div><div>{c.address}</div>{c.gstin && <div>GSTIN {c.gstin}</div>}</div>
        <div className="sm:text-right">{d('letter.date')}: {fmtDate(today)}</div>
      </div>
      <p className="mt-3 font-semibold">{en('letter.subject')}</p>
      <p className="mt-2">{en('letter.body1', { name: c.contactName })}</p>
      <p className="mt-2">{en('letter.body2', { company: c.name, total: inr(total), deadline: fmtDate(deadline) })}</p>
      {rows.length === 0 ? <p className="mt-3 italic">{en('doc.noOverdue')}</p> : (
        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead><tr className="border-b border-ink text-left"><th className="py-1">Invoice</th><th>Date</th><th>Due</th><th className="text-right">{en('letter.original')}</th><th className="text-right">{en('letter.paid')}</th><th className="text-right">{en('letter.remaining')}</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-line"><td className="py-1">{i.number}</td><td>{fmtDate(i.date)}</td><td>{fmtDate(i.dueDate)}</td><td className="text-right">{inr(i.totalPaise)}</td><td className="text-right">{inr(paidOn(state, i.id) + adjustedOn(state, i.id))}</td><td className="text-right">{inr(balanceOf(state, i))}</td></tr>
            ))}
            <tr className="font-bold"><td colSpan={5} className="py-1 text-right">{en('letter.totalOut')}</td><td className="text-right">{inr(owed)}</td></tr>
          </tbody>
        </table>
      )}
      <p className="mt-3">{en('letter.body3', { phone: b.phone, email: b.email })}</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-semibold">{d('letter.howToPay')}</div>
          <div>{en('letter.bank', { bank: b.bank.name, account: b.bank.account, ifsc: b.bank.ifsc })}</div>
          <div>{en('letter.upi', { upi: b.upiId })}</div>
        </div>
        {total > 0 && <Qr text={upiUri(b, total, `Outstanding ${c.name}`.slice(0, 40))} label={en('print.scan')} />}
      </div>
      {mse && <p className="mt-3 text-[12px]">{en('letter.msme', { business: b.name, category: b.udyam.category })}</p>}
      {interestRows.length > 0 && (
        <section className="mt-3">
          <div className="font-semibold">{d('letter.interestTitle')}</div>
          <p className="text-[12px]">{en('letter.interestBasis', { rate: interestRows[0].annualPct.toFixed(2) })}</p>
          <table className="mt-2 w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-ink text-left"><th className="py-1">Invoice</th><th>{en('letter.dueUnderAct')}</th><th className="text-right">{en('letter.daysLate')}</th><th className="text-right">{en('letter.remaining')}</th><th className="text-right">{en('letter.interest')}</th></tr></thead>
            <tbody>
              {interestRows.map((r) => (
                <tr key={r.inv.id} className="border-b border-line"><td className="py-1">{r.inv.number}</td><td>{fmtDate(r.appointed)}</td><td className="text-right">{r.daysLate}</td><td className="text-right">{inr(balanceOf(state, r.inv))}</td><td className="text-right">{inr(r.interestPaise)}</td></tr>
              ))}
              <tr className="font-bold"><td colSpan={4} className="py-1 text-right">{en('letter.totalInterest')}</td><td className="text-right">{inr(interest)}</td></tr>
            </tbody>
          </table>
          <p className="mt-1 text-[12px]">{en(addInterest ? 'letter.interestIncluded' : 'letter.interestExcluded')}</p>
          <label className="no-print mt-2 flex min-h-12 items-center gap-3 rounded-lg border border-line px-3">
            <input type="checkbox" className="h-5 w-5" checked={addInterest} onChange={(e) => setAddInterest(e.target.checked)} />
            <span>{t('letter.addInterest')}</span>
          </label>
        </section>
      )}
      <p className="mt-4">{en('letter.sign')}</p>
      <p className="mt-8">{b.owner}<br />{b.name}</p>
      <p className="mt-3 text-[12px]">{en('letter.disputes', { owner: b.owner, phone: b.phone })}</p>
    </Sheet>
  );
}

// Evidence section of the record pack. Declared top-level so its identity is
// stable across renders instead of being re-created inside PrintPack.
function DocSection({ title, items, line, label }) {
  return (
    <section className="mt-4">
      <h2 className="border-b border-ink font-semibold">{title}</h2>
      {items.length === 0 ? <p className="py-1 italic text-muted">None recorded.</p> : (
        <ul className="divide-y divide-line">{items.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-1"><span>{fmtDate(e.date)} · {label(e)} {line(e)}</span><span className="text-muted">{e.amountPaise != null ? inr(e.amountPaise) : ''} · {e.id}</span></li>)}</ul>
      )}
    </section>
  );
}

export function PrintPack() {
  const { id } = useParams();
  const { state, today, invoice, customer } = useStore();
  const en = makeT('en');
  const inv = invoice(id);
  if (!inv) return <Sheet>Not found.</Sheet>;
  const c = customer(inv.customerId);
  const ev = state.trail.filter((e) => e.invoiceId === inv.id || e.detail?.allocations?.some((a) => a.invoiceId === inv.id));
  const label = (e) => (e.actor === 'customer' ? '[Customer]' : e.actor === 'system' ? '[System]' : '[Owner-confirmed]');
  const line = (e) => {
    const dd = { ...e.detail };
    if (dd.stage) dd.stage = en(`stage.${dd.stage}`);
    for (const k of ['promiseDate', 'until', 'paidOn']) if (dd[k]) dd[k] = fmtDate(dd[k]);
    return en(`ev.${e.type}`, dd);
  };
  const group = (types) => ev.filter((e) => types.includes(e.type));
  return (
    <Sheet>
      <SampleBanner />
      <h1 className="text-xl font-bold">{en('pack.title', { number: inv.number })}</h1>
      <p className="text-muted">{en('pack.generated', { date: fmtDate(today) })} · {en('pack.note')}</p>
      <p className="mt-1 text-[11px] text-muted">{en('pack.labels')}</p>
      <section className="mt-4 grid gap-2 sm:grid-cols-2">
        <div><strong>{state.business.name}</strong> → <strong>{c.name}</strong>{c.gstin && ` (GSTIN ${c.gstin})`}</div>
        <div>Invoice date {fmtDate(inv.date)} · Due {fmtDate(inv.dueDate)} · Total {inr(inv.totalPaise)} · <strong>Balance {inr(balanceOf(state, inv))}</strong></div>
      </section>
      <section className="mt-4">
        <h2 className="border-b border-ink font-semibold">Original invoice</h2>
        <ul>{inv.lines.map((l, i) => <li key={i}>{l.description} · HSN {l.hsn} · {l.qty} {l.unit} × {inr(l.ratePaise)} · GST {l.taxRate}%</li>)}</ul>
        <p className="text-[11px] text-muted">Revisions: issued invoices in Harbor cannot be edited; corrections appear below as credit notes or adjustments.</p>
      </section>
      <section className="mt-4">
        <h2 className="border-b border-ink font-semibold">{en('pack.payments')}</h2>
        <ul className="divide-y divide-line">
          {state.payments.filter((p) => p.invoiceId === inv.id).map((p) => <li key={p.id} className="flex justify-between gap-2 py-1"><span>{fmtDate(p.date)} · [Owner-confirmed] {p.method} {p.note && `· ${p.note}`}</span><span>{inr(p.amountPaise)} · {p.id}</span></li>)}
          {state.adjustments.filter((a) => a.invoiceId === inv.id).map((a) => <li key={a.id} className="flex justify-between gap-2 py-1"><span>{fmtDate(a.date)} · [Owner-confirmed] {en(`inv.adj.${a.type}`)} · {a.note}</span><span>{inr(a.amountPaise)} · {a.id}</span></li>)}
        </ul>
      </section>
      <DocSection title={en('pack.recon')} line={line} label={label} items={group(['bank-confirmed', 'bank-linked', 'claim-confirmed', 'claim-rejected'])} />
      <DocSection title={en('pack.reminders')} line={line} label={label} items={group(['reminder-prepared', 'reminder-sent', 'stage-reset', 'snoozed'])} />
      <DocSection title={en('pack.responses')} line={line} label={label} items={group(['promise', 'dispute-raised', 'dispute-resolved', 'payment-reported', 'customer-reply'])} />
      {daysOverdue(inv, today) > 0 && balanceOf(state, inv) > 0 && <p className="mt-4">Payment Demand Letter: available at /print/letter/{c.id} (generated on request; not sent by Harbor).</p>}
    </Sheet>
  );
}
