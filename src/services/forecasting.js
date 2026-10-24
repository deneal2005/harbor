import { FORECAST } from '../data/config.js';
import { addDays, compareDates, dateInMonth, daysBetween } from '../utils/dates.js';
import { sum } from '../utils/money.js';
import { customerMetrics } from './customerMetrics.js';
import { balanceOf, isOpen, isPromiseActive } from './invoices.js';

export const CATEGORIES = ['payroll', 'rent', 'supplier', 'operating', 'tax', 'other'];

/**
 * Cash in the bank on `today`, from confirmed records only:
 * the balance snapshot + confirmed receipts dated on/after the snapshot (earlier receipts are
 * already inside the snapshot) + confirmed unallocated customer credit - scheduled expenses
 * that fell due between the snapshot and yesterday.
 */
export function cashOnHand(state, today) {
  const { balanceDate, openingBalancePaise } = state.business;
  const inWindow = (d) => compareDates(d, balanceDate) >= 0 && compareDates(d, today) <= 0;
  const receipts = sum(state.payments.filter((p) => inWindow(p.date)).map((p) => p.amountPaise));
  const credits = sum(state.credits.filter((c) => inWindow(c.date)).map((c) => c.amountPaise));
  const spent = sum(expenseOccurrences(state.expenses, balanceDate, addDays(today, -1)).map((e) => e.amountPaise));
  return openingBalancePaise + receipts + credits - spent;
}

// Expand expense rules into dated occurrences within [from, to].
export function expenseOccurrences(expenses, from, to) {
  if (compareDates(to, from) < 0) return [];
  const out = [];
  for (const e of expenses) {
    if (e.schedule.type === 'once') {
      if (compareDates(e.schedule.date, from) >= 0 && compareDates(e.schedule.date, to) <= 0) {
        out.push({ id: `${e.id}@${e.schedule.date}`, expenseId: e.id, label: e.label, category: e.category, date: e.schedule.date, amountPaise: e.amountPaise });
      }
      continue;
    }
    let [y, m] = from.split('-').map(Number);
    for (let guard = 0; guard < 36; guard++) {
      const date = dateInMonth(y, m, e.schedule.day);
      if (compareDates(date, to) > 0) break;
      if (compareDates(date, from) >= 0) out.push({ id: `${e.id}@${date}`, expenseId: e.id, label: e.label, category: e.category, date, amountPaise: e.amountPaise });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  }
  return out.sort((a, b) => compareDates(a.date, b.date));
}

/**
 * When is an unpaid invoice expected to be collected?
 * - disputed: not scheduled (held out of the forecast, listed separately)
 * - active payment promise: the promised date
 * - otherwise due date + the customer's average historical delay (needs FORECAST.minHistory
 *   settlements; else FORECAST.defaultDelayDays at low confidence)
 * - if that estimate is already in the past: today + FORECAST.overdueAssumptionDays, low confidence
 */
export function expectedDate(state, inv, today, metricsCache = new Map()) {
  if (inv.dispute) return null;
  if (isPromiseActive(inv, today)) return { date: inv.promise.date, basis: 'promise', confidence: 'medium' };
  if (!metricsCache.has(inv.customerId)) metricsCache.set(inv.customerId, customerMetrics(state, inv.customerId));
  const m = metricsCache.get(inv.customerId);
  const delay = m.enoughHistory ? m.avgDelay : FORECAST.defaultDelayDays;
  const estimate = addDays(inv.dueDate, Math.max(0, delay));
  if (compareDates(estimate, today) < 0) {
    return { date: addDays(today, FORECAST.overdueAssumptionDays), basis: 'overdueAssumed', confidence: 'low', delay, estimate };
  }
  return { date: estimate, basis: m.enoughHistory ? 'history' : 'default', confidence: m.enoughHistory ? (m.count >= 5 ? 'high' : 'medium') : 'low', delay };
}

// Baseline expected receipts. Only the remaining confirmed balance is projected, so a partial
// payment is never counted twice and paid invoices never appear.
export function expectedCollections(state, today) {
  const cache = new Map();
  const scheduled = [];
  const held = [];
  for (const inv of state.invoices) {
    if (!isOpen(state, inv)) continue;
    const amountPaise = balanceOf(state, inv);
    const e = expectedDate(state, inv, today, cache);
    if (!e) held.push({ invoiceId: inv.id, amountPaise, reason: 'disputed' });
    else scheduled.push({ invoiceId: inv.id, customerId: inv.customerId, amountPaise, ...e, hypothetical: false });
  }
  return { scheduled, held };
}

/**
 * Apply hypothetical changes to a copy of the baseline flows. Each change is labelled; nothing
 * here touches the stored ledger.
 * Supported: collect {invoiceId,date,amountPaise}, delayCustomer {customerId,days},
 * promise {invoiceId,date}, newOrder {amountPaise,collectDate,expensePaise,expenseDate},
 * postponeExpense {occurrenceId,toDate}
 */
export function applyScenario(collections, expenses, changes = [], today = null) {
  // A scenario date before today would drop the money from the forecast; treat it as today.
  const day = (d) => (today && compareDates(d, today) < 0 ? today : d);
  let col = collections.map((c) => ({ ...c }));
  let exp = expenses.map((e) => ({ ...e }));
  for (const ch of changes) {
    if (ch.type === 'collect') {
      const i = col.findIndex((c) => c.invoiceId === ch.invoiceId);
      if (i < 0) continue;
      const orig = col[i];
      const amount = Math.min(ch.amountPaise ?? orig.amountPaise, orig.amountPaise);
      const rest = orig.amountPaise - amount;
      col.splice(i, 1, { ...orig, date: day(ch.date), amountPaise: amount, hypothetical: true, basis: 'scenario' },
        ...(rest > 0 ? [{ ...orig, amountPaise: rest }] : []));
    } else if (ch.type === 'delayCustomer') {
      col = col.map((c) => (c.customerId === ch.customerId ? { ...c, date: addDays(c.date, ch.days), hypothetical: true, basis: 'scenario' } : c));
    } else if (ch.type === 'promise') {
      col = col.map((c) => (c.invoiceId === ch.invoiceId ? { ...c, date: day(ch.date), hypothetical: true, basis: 'scenario' } : c));
    } else if (ch.type === 'newOrder') {
      col.push({ invoiceId: 'scenario-order', amountPaise: ch.amountPaise, date: day(ch.collectDate), hypothetical: true, basis: 'scenario', confidence: 'low' });
      if (ch.expensePaise) exp.push({ id: 'scenario-order-cost', label: 'New order materials', category: 'supplier', date: day(ch.expenseDate), amountPaise: ch.expensePaise, hypothetical: true });
    } else if (ch.type === 'postponeExpense') {
      exp = exp.map((e) => (e.id === ch.occurrenceId ? { ...e, date: day(ch.toDate), hypothetical: true } : e));
    }
  }
  return { collections: col, expenses: exp };
}

/**
 * 13-week forecast from `today`. Week i covers [today + 7i, today + 7i + 6].
 * Within a day, payments are applied before receipts (conservative). A week breaches the buffer
 * when its lowest running balance drops below the buffer; "negative" is tracked separately.
 * Invariant: week[i].closing === week[i+1].opening and opening + collections - outflows === closing.
 */
export function buildForecast(state, today, changes = []) {
  const horizonEnd = addDays(today, FORECAST.weeks * 7 - 1);
  const buffer = state.business.bufferPaise;
  const base = expectedCollections(state, today);
  const baseExp = expenseOccurrences(state.expenses, today, horizonEnd);
  const { collections, expenses } = applyScenario(base.scheduled, baseExp, changes, today);
  const assumed = assumedSales(state.business, today);

  const events = [
    ...assumed,
    ...expenses.map((e) => ({ ...e, kind: 'out' })),
    ...collections.map((c) => ({ ...c, kind: 'in' })),
  ].filter((e) => compareDates(e.date, today) >= 0)
    .sort((a, b) => compareDates(a.date, b.date) || (a.kind === b.kind ? 0 : a.kind === 'out' ? -1 : 1));

  const startCash = cashOnHand(state, today);
  let running = startCash;
  const weeks = [];
  for (let w = 0; w < FORECAST.weeks; w++) {
    const start = addDays(today, w * 7);
    const end = addDays(start, 6);
    const inWeek = events.filter((e) => compareDates(e.date, start) >= 0 && compareDates(e.date, end) <= 0);
    const opening = running;
    let low = opening;
    let lowDate = start;
    const ledger = [];
    for (const e of inWeek) {
      running += e.kind === 'in' ? e.amountPaise : -e.amountPaise;
      ledger.push({ ...e, balanceAfter: running });
      if (running < low) { low = running; lowDate = e.date; }
    }
    const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, sum(inWeek.filter((e) => e.kind === 'out' && e.category === c).map((e) => e.amountPaise))]));
    const collectionsPaise = sum(inWeek.filter((e) => e.kind === 'in' && !e.assumed).map((e) => e.amountPaise));
    const assumedPaise = sum(inWeek.filter((e) => e.assumed).map((e) => e.amountPaise));
    const hypotheticalPaise = sum(inWeek.filter((e) => e.kind === 'in' && e.hypothetical).map((e) => e.amountPaise));
    const outflows = sum(Object.values(byCat));
    weeks.push({ index: w + 1, start, end, opening, collections: collectionsPaise, assumedSales: assumedPaise, hypotheticalCollections: hypotheticalPaise,
      ...byCat, outflows, closing: running, low, lowDate, bufferDiff: running - buffer, breach: low < buffer, negative: low < 0, ledger });
  }

  const firstBreachWeek = weeks.find((w) => w.breach);
  const lowest = weeks.reduce((acc, w) => (w.low < acc.amount ? { amount: w.low, date: w.lowDate } : acc), { amount: startCash, date: today });
  let firstBreach = null;
  if (firstBreachWeek) {
    const breachEvent = firstBreachWeek.ledger.find((e) => e.balanceAfter < buffer);
    const date = breachEvent ? breachEvent.date : firstBreachWeek.start;
    firstBreach = {
      week: firstBreachWeek.index, weekStart: firstBreachWeek.start, weekEnd: firstBreachWeek.end, date,
      low: firstBreachWeek.low, lowDate: firstBreachWeek.lowDate,
      gapPaise: buffer - firstBreachWeek.low,
      // Payments in the breach week up to the low point that pushed cash under the buffer.
      contributors: firstBreachWeek.ledger.filter((e) => e.kind === 'out' && compareDates(e.date, firstBreachWeek.lowDate) <= 0),
      // Receipts the forecast expects only after the low point: too late for this gap as things stand.
      lateReceipts: collections.filter((c) => compareDates(c.date, firstBreachWeek.lowDate) > 0),
    };
  }
  const firstNegativeWeek = weeks.find((w) => w.negative);
  return { today, horizonEnd, buffer, startCash, weeks, collections, expenses, assumed, held: base.held, changes,
    firstBreach, firstNegative: firstNegativeWeek ? { week: firstNegativeWeek.index, date: firstNegativeWeek.lowDate, low: firstNegativeWeek.low } : null,
    lowest, endCash: running };
}

// Labelled assumption for sales not yet invoiced: a flat weekly receipt from
// business.assumedSalesStartDays onward. Kept separate from invoice collections everywhere.
export function assumedSales(business, today) {
  const amount = business.assumedWeeklySalesPaise || 0;
  if (amount <= 0) return [];
  const out = [];
  for (let w = 0; w < FORECAST.weeks; w++) {
    const date = addDays(today, w * 7);
    if (daysBetween(today, date) >= (business.assumedSalesStartDays ?? 42)) {
      out.push({ id: `assumed@${date}`, kind: 'in', invoiceId: null, date, amountPaise: amount, assumed: true, hypothetical: false, basis: 'assumed', confidence: 'low' });
    }
  }
  return out;
}

// Totals for the dashboard tiles, from the same flows the forecast uses.
export function collectionWindows(forecast, today) {
  const within = (days) => sum(forecast.collections.filter((c) => !c.hypothetical && daysBetween(today, c.date) < days).map((c) => c.amountPaise));
  const obligations30 = sum(forecast.expenses.filter((e) => daysBetween(today, e.date) < 30).map((e) => e.amountPaise));
  return { thisWeek: within(7), thisMonth: within(30), obligations30 };
}
