// Cash-flow integrity audit. Shared by the browser (to build the payload), the API server (to
// minimise and validate it) and the Render Workflow tasks (to run the checks). The audit is
// read-only: it recomputes with the same engine the app uses and never changes any record.
import { isValidDate } from '../utils/dates.js';
import { calculateInvoice } from './gst.js';
import { buildForecast } from './forecasting.js';

const int = (v) => Number.isSafeInteger(v);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));

/**
 * Only what the checks need. No names, contacts, GSTINs, addresses, bank details, message text or
 * invoice numbers leave the browser; customers become C1, C2, ...
 */
export function buildAuditPayload(state, clientForecast) {
  const alias = new Map(state.customers.map((c, i) => [c.id, `C${i + 1}`]));
  return minimizePayload({
    version: 1,
    demoDate: state.settings.demoDate,
    business: state.business,
    invoices: state.invoices.map((i) => ({ ...i, customerId: alias.get(i.customerId), disputed: !!i.dispute, promiseDate: i.promise?.date ?? null, claim: !!i.claim })),
    payments: state.payments,
    adjustments: state.adjustments,
    credits: state.credits,
    expenses: state.expenses,
    history: state.history.map((h) => ({ ...h, customerId: alias.get(h.customerId) })),
    bankTxnIds: state.bankTxns.map((t) => t.id),
    clientSummary: clientForecast && {
      startCash: clientForecast.startCash,
      weeks: clientForecast.weeks.map((w) => pick(w, ['opening', 'closing', 'collections', 'assumedSales', 'outflows'])),
      firstBreach: clientForecast.firstBreach ? { date: clientForecast.firstBreach.date, gapPaise: clientForecast.firstBreach.gapPaise } : null,
    },
  });
}

// Whitelist every field. Used on the server too, so nothing extra reaches the workflow even if a
// client sends more.
export function minimizePayload(p) {
  return {
    version: 1,
    demoDate: p?.demoDate,
    business: pick(p?.business, ['stateCode', 'registrationType', 'balanceDate', 'openingBalancePaise', 'bufferPaise', 'assumedWeeklySalesPaise', 'assumedSalesStartDays']),
    invoices: (p?.invoices ?? []).map((i) => ({
      ...pick(i, ['id', 'customerId', 'date', 'dueDate', 'placeOfSupply', 'status', 'taxablePaise', 'totalPaise', 'disputed', 'promiseDate', 'claim', 'stopped']),
      lines: (i.lines ?? []).map((l) => pick(l, ['qty', 'ratePaise', 'discountPct', 'taxRate'])),
    })),
    payments: (p?.payments ?? []).map((x) => pick(x, ['invoiceId', 'amountPaise', 'date'])),
    adjustments: (p?.adjustments ?? []).map((x) => pick(x, ['invoiceId', 'amountPaise', 'date', 'type'])),
    credits: (p?.credits ?? []).map((x) => pick(x, ['amountPaise', 'date'])),
    expenses: (p?.expenses ?? []).map((x) => ({ ...pick(x, ['id', 'category', 'amountPaise']), schedule: pick(x.schedule, ['type', 'day', 'date']) })),
    history: (p?.history ?? []).map((x) => pick(x, ['customerId', 'dueDate', 'paidDate'])),
    bankTxnIds: (p?.bankTxnIds ?? []).filter((x) => typeof x === 'string').slice(0, 5000),
    clientSummary: p?.clientSummary ? {
      startCash: p.clientSummary.startCash,
      weeks: (p.clientSummary.weeks ?? []).slice(0, 13).map((w) => pick(w, ['opening', 'closing', 'collections', 'assumedSales', 'outflows'])),
      firstBreach: p.clientSummary.firstBreach ? pick(p.clientSummary.firstBreach, ['date', 'gapPaise']) : null,
    } : null,
  };
}

// Shape check at the trust boundary. Returns a list of problems (empty = acceptable to run).
export function shapeErrors(p) {
  const errs = [];
  if (!isValidDate(p.demoDate)) errs.push('demoDate');
  const b = p.business;
  if (!int(b.openingBalancePaise) || !int(b.bufferPaise) || !isValidDate(b.balanceDate)) errs.push('business');
  if (!Array.isArray(p.invoices) || p.invoices.length === 0) errs.push('invoices');
  if (p.invoices.length > 2000) errs.push('tooManyInvoices');
  return errs;
}

// Rebuild just enough state for the shared engine.
export function toEngineState(p) {
  const customerIds = [...new Set([...p.invoices.map((i) => i.customerId), ...p.history.map((h) => h.customerId)])];
  return {
    business: { ...p.business },
    customers: customerIds.map((id) => ({ id, name: id })),
    invoices: p.invoices.map((i) => ({ ...i, dispute: i.disputed ? { reason: 'disputed' } : null, promise: i.promiseDate ? { date: i.promiseDate } : null, claim: i.claim ? {} : null })),
    payments: p.payments, adjustments: p.adjustments, credits: p.credits, expenses: p.expenses, history: p.history,
  };
}

const check = (id, passed, detail, items = []) => ({ id, passed, detail, items: items.slice(0, 10) });

// Task 1: record validation.
export function validateRecords(p) {
  const checks = [];
  const bad = [];
  for (const i of p.invoices) {
    if (!i.id || !isValidDate(i.date) || !isValidDate(i.dueDate)) bad.push(i.id || '(no id)');
    else if (i.status !== 'draft' && (!int(i.totalPaise) || !int(i.taxablePaise))) bad.push(i.id);
  }
  for (const x of [...p.payments, ...p.adjustments, ...p.credits]) if (!int(x.amountPaise) || (x.date && !isValidDate(x.date))) bad.push(x.invoiceId || 'credit');
  for (const e of p.expenses) if (!int(e.amountPaise)) bad.push(e.id);
  checks.push(check('fieldsPresent', bad.length === 0, bad.length ? `${bad.length} record(s) have missing or non-integer fields` : 'All records have valid dates and integer paise amounts', bad));

  const negatives = [...p.payments, ...p.adjustments, ...p.credits, ...p.expenses].filter((x) => int(x.amountPaise) && x.amountPaise <= 0);
  const negInv = p.invoices.filter((i) => int(i.totalPaise) && i.totalPaise < 0);
  checks.push(check('noNegativeAmounts', negatives.length + negInv.length === 0, negatives.length + negInv.length ? 'Negative or zero amounts found' : 'No negative or zero amounts', [...negInv.map((i) => i.id), ...negatives.map((x) => x.invoiceId || x.id || 'record')]));

  const ids = new Set();
  const dupIds = p.invoices.filter((i) => (ids.has(i.id) ? true : (ids.add(i.id), false))).map((i) => i.id);
  checks.push(check('uniqueInvoices', dupIds.length === 0, dupIds.length ? 'Duplicate invoice ids' : 'Every invoice id is unique', dupIds));

  const issued = new Map(p.invoices.filter((i) => i.status !== 'draft').map((i) => [i.id, i]));
  const orphan = [...p.payments, ...p.adjustments].filter((x) => !issued.has(x.invoiceId)).map((x) => x.invoiceId);
  checks.push(check('paymentsLinked', orphan.length === 0, orphan.length ? 'Payments point to unknown or draft invoices' : 'Every payment and adjustment belongs to an issued invoice', orphan));

  const mismatched = [];
  for (const i of issued.values()) {
    const calc = calculateInvoice({ lines: i.lines, business: p.business, placeOfSupply: i.placeOfSupply });
    if (!calc.ok || calc.totalPaise !== i.totalPaise || calc.taxablePaise !== i.taxablePaise) mismatched.push(i.id);
  }
  checks.push(check('totalsRecompute', mismatched.length === 0, mismatched.length ? 'Stored totals differ from a fresh GST calculation' : 'Every stored invoice total matches a fresh GST calculation', mismatched));

  const over = [];
  for (const i of issued.values()) {
    const settled = [...p.payments, ...p.adjustments].filter((x) => x.invoiceId === i.id).reduce((a, x) => a + (int(x.amountPaise) ? x.amountPaise : 0), 0);
    if (settled > i.totalPaise) over.push(i.id);
  }
  checks.push(check('noNegativeBalances', over.length === 0, over.length ? 'Payments exceed the invoice total (negative balance)' : 'No invoice is paid beyond its total', over));

  const seen = new Set();
  const dupTx = p.bankTxnIds.filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
  checks.push(check('noDuplicateImports', dupTx.length === 0, dupTx.length ? 'The same bank transaction was imported twice' : 'No bank transaction is recorded twice', dupTx));
  return { checks, blocking: checks.some((c) => !c.passed && ['fieldsPresent', 'uniqueInvoices'].includes(c.id)) };
}

// Task 2: recompute the forecast with the app's own engine.
export function recomputeForecast(p) {
  const f = buildForecast(toEngineState(p), p.demoDate);
  const scheduledIds = f.collections.map((c) => c.invoiceId);
  return {
    startCash: f.startCash,
    weeks: f.weeks.map((w) => pick(w, ['index', 'start', 'end', 'opening', 'closing', 'collections', 'assumedSales', 'outflows', 'low', 'breach'])),
    firstBreach: f.firstBreach ? { week: f.firstBreach.week, date: f.firstBreach.date, gapPaise: f.firstBreach.gapPaise, lowDate: f.firstBreach.lowDate } : null,
    lowest: f.lowest, buffer: f.buffer, scheduledIds, heldIds: f.held.map((h) => h.invoiceId),
    hypotheticalCount: f.collections.filter((c) => c.hypothetical).length,
  };
}

// Task 3: invariants and comparison with what the browser showed.
export function checkInvariants(p, r) {
  const checks = [];
  const carry = r.weeks.slice(1).filter((w, i) => w.opening !== r.weeks[i].closing).map((w) => `W${w.index}`);
  checks.push(check('carryForward', carry.length === 0, carry.length ? 'A week does not open with the previous closing balance' : 'Every week opens with the previous week\'s closing balance', carry));
  const recon = r.weeks.filter((w) => w.opening + w.collections + w.assumedSales - w.outflows !== w.closing).map((w) => `W${w.index}`);
  checks.push(check('weeklyReconcile', recon.length === 0, recon.length ? 'Opening + receipts - payments does not equal closing' : 'Opening + receipts - payments = closing for all 13 weeks', recon));

  const engine = toEngineState(p);
  const settled = (id) => [...p.payments, ...p.adjustments].filter((x) => x.invoiceId === id).reduce((a, x) => a + x.amountPaise, 0);
  const paidScheduled = r.scheduledIds.filter((id) => { const i = engine.invoices.find((x) => x.id === id); return !i || settled(id) >= i.totalPaise; });
  checks.push(check('noPaidInForecast', paidScheduled.length === 0, paidScheduled.length ? 'Paid invoices appear as future collections' : 'No paid invoice is counted as a future collection', paidScheduled));
  const disputedScheduled = r.scheduledIds.filter((id) => engine.invoices.find((x) => x.id === id)?.disputed);
  checks.push(check('disputesHeld', disputedScheduled.length === 0, disputedScheduled.length ? 'Disputed invoices are scheduled as collections' : 'Disputed invoices are held out of the forecast', disputedScheduled));
  checks.push(check('noHypotheticals', r.hypotheticalCount === 0, r.hypotheticalCount ? 'Scenario amounts leaked into the baseline' : 'The baseline contains no scenario (hypothetical) amounts'));

  const firstIdx = r.weeks.findIndex((w) => w.low < r.buffer);
  const breachOk = firstIdx < 0 ? r.firstBreach === null : r.firstBreach?.week === r.weeks[firstIdx].index;
  checks.push(check('firstBreachEarliest', breachOk, breachOk ? (r.firstBreach ? `First buffer breach is week ${r.firstBreach.week} (${r.firstBreach.date})` : 'No week falls below the safety buffer') : 'The reported first breach is not the earliest week below the buffer'));

  const c = p.clientSummary;
  if (c) {
    const diffs = [];
    if (c.startCash !== r.startCash) diffs.push('start cash');
    r.weeks.forEach((w, i) => { if (c.weeks[i]?.closing !== w.closing) diffs.push(`W${w.index} closing`); });
    if ((c.firstBreach?.date ?? null) !== (r.firstBreach?.date ?? null) || (c.firstBreach?.gapPaise ?? null) !== (r.firstBreach?.gapPaise ?? null)) diffs.push('first breach');
    checks.push(check('matchesScreen', diffs.length === 0, diffs.length ? 'The independent recomputation differs from what the screen shows' : 'Independent recomputation matches the forecast on screen exactly', diffs));
  }
  return { checks };
}

export function composeReport({ validation, recomputed, invariants, runMeta = {} }) {
  const checks = [...validation.checks, ...(invariants?.checks ?? [])];
  return {
    passed: checks.every((c) => c.passed) && !validation.blocking,
    checkedAt: new Date().toISOString(),
    counts: { passed: checks.filter((c) => c.passed).length, failed: checks.filter((c) => !c.passed).length },
    checks,
    summary: recomputed ? { startCash: recomputed.startCash, firstBreach: recomputed.firstBreach, lowest: recomputed.lowest, buffer: recomputed.buffer } : null,
    skippedForecast: !recomputed,
    ...runMeta,
  };
}

// Same chain the workflow runs, in-process. Used by tests; the app always calls the real workflow.
export function runAuditLocally(payload) {
  const p = minimizePayload(payload);
  const validation = validateRecords(p);
  if (validation.blocking) return composeReport({ validation });
  const recomputed = recomputeForecast(p);
  return composeReport({ validation, recomputed, invariants: checkInvariants(p, recomputed) });
}
