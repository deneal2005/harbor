import { FORECAST } from '../data/config.js';
import { daysBetween } from '../utils/dates.js';
import { balanceOf, isOpen } from './invoices.js';

// Settled invoices for a customer: seeded history from earlier months plus invoices in the ledger
// that are now fully paid (settlement date = date of the last confirmed payment).
export function settlements(state, customerId) {
  const past = state.history.filter((h) => h.customerId === customerId)
    .map((h) => ({ number: h.number, dueDate: h.dueDate, paidDate: h.paidDate }));
  const current = state.invoices
    .filter((inv) => inv.customerId === customerId && inv.status !== 'draft' && balanceOf(state, inv) <= 0)
    .map((inv) => {
      const dates = state.payments.filter((p) => p.invoiceId === inv.id).map((p) => p.date).sort();
      return dates.length ? { number: inv.number, dueDate: inv.dueDate, paidDate: dates.at(-1) } : null;
    })
    .filter(Boolean);
  return [...past, ...current].map((s) => ({ ...s, delay: daysBetween(s.dueDate, s.paidDate) }));
}

/**
 * Descriptive payment behaviour, not a credit score.
 * avgDelay: mean of (paid date - due date) in whole days, rounded; negative = early.
 * grade A: >=80% on time and avg delay <=5 days; B: avg delay <=15; C: otherwise.
 */
export function customerMetrics(state, customerId) {
  const list = settlements(state, customerId);
  const outstandingPaise = state.invoices
    .filter((inv) => inv.customerId === customerId && isOpen(state, inv))
    .reduce((acc, inv) => acc + balanceOf(state, inv), 0);
  const base = { customerId, count: list.length, settlements: list, outstandingPaise };
  if (list.length < FORECAST.minHistory) return { ...base, enoughHistory: false, grade: null, avgDelay: null, onTimeRate: null };
  const avgDelay = Math.round(list.reduce((a, s) => a + s.delay, 0) / list.length);
  const onTime = list.filter((s) => s.delay <= FORECAST.onTimeGraceDays).length;
  const onTimeRate = Math.round((onTime / list.length) * 100);
  const grade = onTimeRate >= 80 && avgDelay <= 5 ? 'A' : avgDelay <= 15 ? 'B' : 'C';
  return { ...base, enoughHistory: true, grade, avgDelay, onTimeRate, onTimeCount: onTime };
}
