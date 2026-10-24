import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { UserPlus } from 'lucide-react';
import { CustomerDialog } from '../components/CustomerForm.jsx';
import { Button, ButtonLink, Card, Field, Money, Notice, Page, inputCls } from '../components/ui.jsx';
import { cx } from '../utils/cx.js';
import { useErrorText } from '../hooks/useErrorText.js';
import { GST, STATES } from '../data/config.js';
import { saveInvoice } from '../services/actions.js';
import { calculateInvoice } from '../services/gst.js';
import { STEPS, stepProblems } from '../services/formFlow.js';
import { balanceOf, daysOverdue, isOpen, nextInvoiceNumber } from '../services/invoices.js';
import { useStore } from '../store-context.js';
import { addDays, isValidDate } from '../utils/dates.js';
import { validateHsn } from '../utils/hsn.js';
import { amountInWords, paiseToRupeeInput, rupeesToPaise } from '../utils/money.js';

const NEW = '__new__';
// Prefill from a customer (picked in the form, created in the dialog, or passed as ?customer=).
const fromCustomer = (c) => (c ? { customerId: c.id, placeOfSupply: c.stateCode, billingAddress: c.address, creditDays: String(c.creditDays) } : { customerId: '', placeOfSupply: '', billingAddress: '' });
const blankLine = () => ({ description: '', hsn: '4819', qty: '1', unit: 'pcs', rate: '', discountPct: '0', taxRate: String(GST.defaultRate) });

export default function NewInvoice() {
  const { id } = useParams();
  const { t, state, today, run, notify, money } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errText = useErrorText();
  const foundInv = id ? state.invoices.find((i) => i.id === id) : null;
  const existing = foundInv && foundInv.status === 'draft' ? foundInv : null;
  const [form, setForm] = useState(() => existing ? {
    id: existing.id, customerId: existing.customerId, date: existing.date, creditDays: String(existing.creditDays), placeOfSupply: existing.placeOfSupply,
    billingAddress: existing.billingAddress, deliveryAddress: existing.deliveryAddress, reverseCharge: existing.reverseCharge,
    lines: existing.lines.map((l) => ({ ...l, qty: String(l.qty), rate: paiseToRupeeInput(l.ratePaise), discountPct: String(l.discountPct), taxRate: String(l.taxRate) })),
  } : { date: today, creditDays: String(state.business.paymentTermsDays), deliveryAddress: '', reverseCharge: false, lines: [blankLine()], ...fromCustomer(state.customers.find((c) => c.id === params.get('customer'))) });
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);
  const [stepErrors, setStepErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const stepRef = useRef(null);
  const customer = state.customers.find((c) => c.id === form.customerId);
  const dueDate = isValidDate(form.date) && /^\d+$/.test(form.creditDays) ? addDays(form.date, Number(form.creditDays)) : '';

  const lines = form.lines.map((l) => ({ description: l.description, hsn: l.hsn, unit: l.unit, qty: Number(l.qty), ratePaise: rupeesToPaise(l.rate) ?? NaN, discountPct: Number(l.discountPct || 0), taxRate: Number(l.taxRate) }));
  const calc = calculateInvoice({ lines, business: state.business, placeOfSupply: form.placeOfSupply });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setLine = (i, k) => (e) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)) }));
  const [adding, setAdding] = useState(false);
  const choose = (c) => setForm((f) => ({ ...f, ...fromCustomer(c) }));
  const pickCustomer = (e) => {
    if (e.target.value === NEW) return setAdding(true);
    choose(state.customers.find((x) => x.id === e.target.value));
  };
  const owed = customer ? state.invoices.filter((i) => i.customerId === customer.id && isOpen(state, i)) : [];
  const owedTotal = owed.reduce((a, i) => a + balanceOf(state, i), 0);
  const owedOverdue = owed.filter((i) => daysOverdue(i, today) > 0).reduce((a, i) => a + balanceOf(state, i), 0);

  // Mobile stepper: validate the current step before advancing; form state survives the navigation.
  const goto = (next) => {
    if (next > step) {
      const problems = stepProblems(form, step, calc.ok ? calc : null, state.business.aggregateTurnoverPaise);
      if (problems.length) {
        const errs = {};
        for (const p of problems) {
          if (typeof p === 'string') errs[p] = errText({ error: p });
          else errs[`${p.code}-${p.line}`] = errText({ error: p.code, line: p.line });
        }
        setStepErrors(errs);
        stepRef.current?.focus();
        return;
      }
    }
    setStepErrors({});
    setStep(next);
  };

  const submit = (issue) => {
    if (submitting) return;
    setSubmitting(true);
    const r = run(saveInvoice, { ...form, creditDays: Number(form.creditDays), dueDate, lines }, { issue });
    const m = errText(r);
    setError(m);
    if (m) { setSubmitting(false); return; }
    const inv = r.state.invoices.find((i) => i.id === r.invoiceId);
    notify(issue ? t('new.issued', { number: inv.number }) : t('new.draftSaved'));
    navigate(issue ? `/invoices/${inv.id}` : `/invoices/${inv.id}/edit`, { replace: true });
  };
  const einvoice = state.business.aggregateTurnoverPaise > GST.eInvoiceThresholdPaise;
  const docType = calc.ok ? calc.docType : { regular: 'tax-invoice', composition: 'bill-of-supply', unregistered: 'invoice' }[state.business.registrationType];

  if (foundInv && foundInv.status !== 'draft') {
    return (
      <Page title={t('new.title')}>
        <Card>
          <Notice tone="warn" className="mb-4">{t('new.alreadyIssued', { number: foundInv.number })}</Notice>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/invoices/${foundInv.id}`} variant="primary">{t('new.openInvoice')}</ButtonLink>
            <Button onClick={() => navigate('/invoices/new', { replace: true })}>{t('new.startNew')}</Button>
          </div>
        </Card>
      </Page>
    );
  }

  const stepErr = (code) => stepErrors[code];
  const hsnError = (code) => {
    const v = validateHsn(code, state.business.aggregateTurnoverPaise);
    return v.ok ? null : t(`new.hsnBad.${v.reason}`, { min: v.min });
  };

  return (
    <Page title={existing ? t('new.editDraft') : t('new.title')} subtitle={`${t(`new.doc.${docType}`)} · ${t('new.number', { number: isValidDate(form.date) ? nextInvoiceNumber(state.invoices, form.date, state.business.invoicePrefix) : '—' })}`}>
      {/* Mobile: progress + step navigation. Desktop (md+): all sections visible as before. */}
      <div className="mb-4 md:hidden" role="group" aria-label={t('new.stepPos', { n: step, total: STEPS.length })}>
        <div className="flex items-center gap-2" aria-hidden="true">
          {STEPS.map((s) => (
            <div key={s.id} className={cx('h-1.5 flex-1 rounded-full', s.id <= step ? 'bg-brand' : 'bg-ink/10')} />
          ))}
        </div>
        <p id="step-status" className="num mt-1.5 text-xs font-medium text-muted">{t('new.stepPos', { n: step, total: STEPS.length })} — {t(STEPS[step - 1].key)}</p>
      </div>

      <div ref={stepRef} tabIndex={-1} className="outline-none" />
      <section aria-hidden={step !== 1} className={cx('md:block', step === 1 ? 'block' : 'hidden')}>
        <Card>
          <h2 className="mb-3 text-base font-semibold md:hidden" tabIndex={-1}>{t('new.step1')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Field label={t('new.customer')} error={stepErr('customer')}>{(p) => (
                <select {...p} className={inputCls} value={form.customerId} onChange={pickCustomer}>
                  <option value="">{t('new.chooseCustomer')}</option>
                  {[...state.customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value={NEW}>+ {t('cust.add')}…</option>
                </select>)}</Field>
              <Button variant="ghost" icon={UserPlus} className="mt-1" onClick={() => setAdding(true)}>{t('cust.add')}</Button>
            </div>
            {customer ? (
              <div className="rounded-xl bg-paper p-3 text-sm ring-1 ring-inset ring-line">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={`/customers/${customer.id}`} className="font-semibold text-brand hover:underline">{customer.name}</Link>
                  <span>{t('new.owes')} <Money paise={owedTotal} className="font-semibold" />{owedOverdue > 0 && <span className="text-danger"> · <Money paise={owedOverdue} /> {t('dash.overdue').toLowerCase()}</span>}</span>
                </div>
                <div className="mt-1 text-muted">{[customer.contactName, customer.phone, customer.email].filter(Boolean).join(' · ') || '—'}</div>
                <div className="text-muted">{customer.gstin ? t('new.registered', { gstin: customer.gstin }) : t('new.unregistered')} · {t('common.days', { n: customer.creditDays })} {t('cust.credit').toLowerCase()}</div>
              </div>
            ) : <div className="flex items-end text-sm text-muted">{t('new.pickHint')}</div>}
            <Field label={t('new.billing')}>{(p) => <textarea {...p} rows={2} className={inputCls} value={form.billingAddress} onChange={set('billingAddress')} />}</Field>
            <Field label={t('new.delivery')}>{(p) => <textarea {...p} rows={2} className={inputCls} value={form.deliveryAddress} onChange={set('deliveryAddress')} />}</Field>
            <Field label={t('new.invoiceDate')} error={stepErr('date')}>{(p) => <input {...p} type="date" className={inputCls} value={form.date} onChange={set('date')} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('new.creditDays')}>{(p) => <input {...p} inputMode="numeric" className={inputCls} value={form.creditDays} onChange={set('creditDays')} />}</Field>
              <Field label={t('new.due')}>{(p) => <input {...p} readOnly className={`${inputCls} bg-paper`} value={dueDate} />}</Field>
            </div>
            <Field label={t('new.place')} hint={customer && customer.stateCode !== state.business.stateCode ? t('cust.otherState') : undefined} error={stepErr('placeOfSupply') || stepErr('supplierState') || stepErr('registration')}>{(p) => (
              <select {...p} className={inputCls} value={form.placeOfSupply} onChange={set('placeOfSupply')}>
                <option value="">—</option>
                {STATES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
              </select>)}</Field>
            <label className="flex min-h-12 items-center gap-2 self-end"><input type="checkbox" className="h-5 w-5" checked={form.reverseCharge} onChange={set('reverseCharge')} />{t('new.reverseCharge')}</label>
          </div>
        </Card>
        <div className="mt-4 flex flex-wrap justify-end gap-2 md:hidden">
          <Button variant="primary" onClick={() => goto(2)} aria-describedby="step-status">{t('common.continue')}</Button>
        </div>
      </section>

      <section aria-hidden={step !== 2} className={cx('md:block', step === 2 ? 'block' : 'hidden')}>
        <Card title={t('new.items')}>
          <div className="space-y-4">
            {form.lines.map((l, i) => {
              const cl = calc.ok ? calc.lines[i] : null;
              return (
                <fieldset key={i} className="rounded-lg border border-line p-3">
                  <legend className="px-1 text-sm font-medium">#{i + 1}</legend>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                    <Field label={t('new.desc')} className="col-span-2 md:col-span-4" error={stepErr(`descRequired-${i}`)}>{(p) => <input {...p} className={inputCls} value={l.description} onChange={setLine(i, 'description')} />}</Field>
                    <Field label={t('new.hsn')} className="md:col-span-2" error={hsnError(l.hsn)}>{(p) => <input {...p} inputMode="numeric" className={inputCls} value={l.hsn} onChange={setLine(i, 'hsn')} />}</Field>
                    <Field label={t('new.qty')} className="md:col-span-1">{(p) => <input {...p} inputMode="decimal" className={inputCls} value={l.qty} onChange={setLine(i, 'qty')} />}</Field>
                    <Field label={t('new.unit')} className="md:col-span-1">{(p) => <input {...p} className={inputCls} value={l.unit} onChange={setLine(i, 'unit')} />}</Field>
                    <Field label={t('new.rate')} className="md:col-span-2" error={stepErr(`rateRequired-${i}`)}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={l.rate} onChange={setLine(i, 'rate')} />}</Field>
                    <Field label={t('new.discount')} className="md:col-span-1">{(p) => <input {...p} inputMode="decimal" className={inputCls} value={l.discountPct} onChange={setLine(i, 'discountPct')} />}</Field>
                    <Field label={t('new.tax')} className="md:col-span-1">{(p) => (
                      <select {...p} className={inputCls} value={l.taxRate} onChange={setLine(i, 'taxRate')} disabled={state.business.registrationType !== 'regular'}>
                        {GST.allowedRates.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </select>)}</Field>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted">{cl ? <>{t('new.taxable')} <Money paise={cl.taxablePaise} exact /> · GST <Money paise={cl.cgstPaise + cl.sgstPaise + cl.igstPaise} exact /></> : '—'}</span>
                    {form.lines.length > 1 && <Button variant="danger" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>{t('new.removeLine')}</Button>}
                  </div>
                </fieldset>
              );
            })}
            <Button onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }))}>+ {t('new.addLine')}</Button>
          </div>
        </Card>
        <div className="mt-4 flex flex-wrap justify-between gap-2 md:hidden">
          <Button onClick={() => goto(1)} aria-describedby="step-status">{t('common.back')}</Button>
          <Button variant="primary" onClick={() => goto(3)} aria-describedby="step-status">{t('common.continue')}</Button>
        </div>
      </section>

      <section aria-hidden={step !== 3} className={cx('md:block', step === 3 ? 'block' : 'hidden')}>
        <Card title={t('new.reviewTitle')}>
          {/* Mobile step 3 recap: who, when and what is being charged. */}
          <div className="rounded-xl bg-paper p-3 text-sm ring-1 ring-inset ring-line md:hidden">
            <p className="text-xs text-muted">{t('new.reviewHint')}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted">{t('common.customer')}</dt><dd className="text-right">{customer?.name || '—'}</dd>
              <dt className="text-muted">{t('new.invoiceDate')}</dt><dd className="text-right num">{form.date}</dd>
              <dt className="text-muted">{t('new.due')}</dt><dd className="text-right num">{dueDate || '—'}</dd>
              <dt className="text-muted">{t('new.items')}</dt><dd className="text-right">{t('new.reviewItems', { n: form.lines.length })}</dd>
            </dl>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => goto(1)}>{t('new.backToEdit')}</Button>
              <Button onClick={() => goto(2)}>{t('new.step2')}</Button>
            </div>
          </div>

          {calc.ok ? (
            <dl className="ml-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-1">
              <dt>{t('new.taxable')}</dt><dd className="text-right"><Money paise={calc.taxablePaise} exact /></dd>
              {calc.interState ? <><dt>{t('new.igst')}</dt><dd className="text-right"><Money paise={calc.igstPaise} exact /></dd></>
                : calc.collectsGst && <><dt>{t('new.cgst')}</dt><dd className="text-right"><Money paise={calc.cgstPaise} exact /></dd><dt>{t('new.sgst')}</dt><dd className="text-right"><Money paise={calc.sgstPaise} exact /></dd></>}
              <dt>{t('new.roundOff')}</dt><dd className="text-right"><Money paise={calc.roundOffPaise} exact /></dd>
              <dt className="text-lg font-semibold">{t('new.grand')}</dt><dd className="text-right text-lg font-semibold"><Money paise={calc.totalPaise} /></dd>
              <dt className="col-span-2 mt-1 text-sm text-muted">{t('new.words')}: {amountInWords(calc.totalPaise)}</dt>
            </dl>
          ) : <Notice tone="warn">{errText(calc)}</Notice>}
          <Notice tone="info" className="mt-3">{einvoice ? t('new.einvoice', { turnover: money(state.business.aggregateTurnoverPaise) }) : t('new.noEinvoice')}</Notice>
          {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button onClick={() => submit(false)} disabled={submitting}>{t('new.saveDraft')}</Button>
            <Button variant="primary" onClick={() => submit(true)} disabled={submitting}>{t('new.issue')}</Button>
          </div>
        </Card>
      </section>
      <CustomerDialog open={adding} onClose={() => setAdding(false)} onCreated={choose} />
    </Page>
  );
}
