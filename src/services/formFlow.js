// Pure helpers for the invoice form's mobile 3-step flow. UI-only: nothing here bypasses or
// duplicates the real validation in gl/calculateInvoice + saveInvoice — every submit still runs
// through the full engine; these checks just stop the user advancing with obviously incomplete data.
import { isValidDate } from '../utils/dates.js';
import { validateHsn } from '../utils/hsn.js';
import { rupeesToPaise } from '../utils/money.js';

export const STEPS = [
  { id: 1, key: 'new.step1' },
  { id: 2, key: 'new.step2' },
  { id: 3, key: 'new.step3' },
];

// Returns an array of error codes (translated with err.* by the caller). Empty array = step OK.
export function stepProblems(form, step, calc, turnoverPaise = 0) {
  if (step === 1) {
    const p = [];
    if (!form.customerId) p.push('customer');
    if (!isValidDate(form.date)) p.push('date');
    if (calc && !calc.ok && ['placeOfSupply', 'supplierState', 'registration'].includes(calc.error)) p.push(calc.error);
    return p;
  }
  if (step === 2) {
    const p = [];
    if (!form.lines.length) p.push('noLines');
    form.lines.forEach((l, i) => {
      if (!l.description.trim()) p.push({ code: 'descRequired', line: i });
      if (!validateHsn(l.hsn, turnoverPaise).ok) p.push({ code: 'hsn', line: i });
      const rate = rupeesToPaise(l.rate);
      if (rate === null || rate <= 0) p.push({ code: 'rateRequired', line: i });
    });
    return p;
  }
  return [];
}

// Decide which empty-state copy an invoices-style list should show.
export function invoicesEmptyState({ rowsLength, totalLength, hasFilters }) {
  if (rowsLength > 0) return null;
  return totalLength === 0 ? 'inv.emptyNone' : (hasFilters ? 'inv.emptyFiltered' : 'inv.emptyNone');
}
