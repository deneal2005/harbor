import { INVOICE } from '../data/config.js';
import { daysBetween, financialYear } from '../utils/dates.js';
import { sum } from '../utils/money.js';

// Confirmed money only: owner-confirmed payments and owner-approved adjustments (credit notes, TDS).
export const paidOn = (state, invoiceId) => sum(state.payments.filter((p) => p.invoiceId === invoiceId).map((p) => p.amountPaise));
export const adjustedOn = (state, invoiceId) => sum(state.adjustments.filter((a) => a.invoiceId === invoiceId).map((a) => a.amountPaise));

export function balanceOf(state, inv) {
  if (inv.status === 'draft') return 0;
  return inv.totalPaise - paidOn(state, inv.id) - adjustedOn(state, inv.id);
}

export const daysOverdue = (inv, today) => Math.max(0, daysBetween(inv.dueDate, today));

export const isPromiseActive = (inv, today) => !!inv.promise && daysBetween(today, inv.promise.date) >= 0;

// Derived, never stored: status follows from dates, balances and dispute state.
export function statusOf(state, inv, today) {
  if (inv.status === 'draft') return 'draft';
  const bal = balanceOf(state, inv);
  if (bal <= 0) return 'paid';
  if (inv.dispute) return 'disputed';
  if (daysBetween(inv.dueDate, today) > 0) return 'overdue';
  if (bal < inv.totalPaise) return 'part-paid';
  if (daysBetween(today, inv.dueDate) <= INVOICE.dueSoonDays) return 'due-soon';
  return 'sent';
}

export const isOpen = (state, inv) => inv.status !== 'draft' && balanceOf(state, inv) > 0;

export function ageingBucket(inv, today) {
  const d = daysBetween(inv.dueDate, today);
  if (d <= 0) return 'notDue';
  if (d <= 30) return 'd1_30';
  if (d <= 60) return 'd31_60';
  if (d <= 90) return 'd61_90';
  return 'd90plus';
}

export const formatNumber = (prefix, fy, seq) => `${prefix}/${fy}/${String(seq).padStart(4, '0')}`;

const NUMBER = /^([A-Z]{1,5})\/(\d{2}-\d{2})\/(\d{4,})$/;
export function parseNumber(number) {
  const m = NUMBER.exec(number ?? '');
  return m ? { prefix: m[1], fy: m[2], seq: Number(m[3]) } : null;
}

// Next consecutive number in the invoice date's financial year. Drafts have no number yet.
export function nextInvoiceNumber(invoices, date, prefix = INVOICE.prefix) {
  const fy = financialYear(date);
  const used = invoices.map((i) => parseNumber(i.number)).filter((p) => p && p.fy === fy && p.prefix === prefix);
  const number = formatNumber(prefix, fy, Math.max(0, ...used.map((p) => p.seq)) + 1);
  if (number.length > INVOICE.maxLength) throw new RangeError('invoice number exceeds 16 characters');
  return number;
}

// Normalised invoice reference for matching bank text: "inv 26-27 0007" -> "INV/26-27/0007".
export function normaliseRef(text) {
  const m = /INV[\s/\-_.]*(\d{2})[\s\-/_.]*(\d{2})[\s/\-_.]*(\d{1,4})\b/i.exec(text ?? '');
  return m ? formatNumber('INV', `${m[1]}-${m[2]}`, Number(m[3])) : null;
}
