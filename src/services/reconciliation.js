import { RECONCILIATION } from '../data/config.js';
import { compareDates, daysBetween, isValidDate } from '../utils/dates.js';
import { roundDiv, rupeesToPaise } from '../utils/money.js';
import { balanceOf, formatNumber, isOpen } from './invoices.js';

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const REQUIRED = ['date', 'description', 'reference', 'amount'];
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Deterministic 32-bit FNV-1a, hex. Used for stable transaction ids.
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * Parse a bank statement. Credits only (positive amounts) are payment candidates.
 * Fingerprint = date|amount|reference|description plus the occurrence index of identical rows in
 * the same file, so two genuinely identical deposits are both kept (and flagged for review), while
 * re-importing the same file produces the same fingerprints and is skipped.
 */
export function parseStatement(text, { today = null } = {}) {
  const rows = parseCsv(String(text ?? ''));
  if (rows.length === 0) return { ok: false, error: 'empty' };
  const header = rows[0].map((h) => norm(h));
  const idx = Object.fromEntries(REQUIRED.map((k) => [k, header.indexOf(k)]));
  if (Object.values(idx).some((i) => i < 0)) return { ok: false, error: 'header', missing: REQUIRED.filter((k) => idx[k] < 0) };
  const txns = [];
  const errors = [];
  const seen = new Map();
  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const date = (r[idx.date] || '').trim();
    const raw = (r[idx.amount] || '').trim();
    const negative = raw.startsWith('-');
    const amountPaise = rupeesToPaise(raw.replace(/^-/, ''));
    if (!isValidDate(date)) return errors.push({ line, error: 'date' });
    // A future-dated credit could be imported as pending but could never be confirmed (payments
    // may not be dated in the future), so the row is rejected here where the mistake is visible.
    if (today && compareDates(date, today) > 0) return errors.push({ line, error: 'futureDate' });
    if (amountPaise === null || amountPaise === 0) return errors.push({ line, error: 'amount' });
    if (negative) return errors.push({ line, error: 'debit' });
    const description = (r[idx.description] || '').trim();
    const reference = (r[idx.reference] || '').trim();
    const key = `${date}|${amountPaise}|${norm(reference)}|${norm(description)}`;
    const occurrence = (seen.get(key) || 0) + 1;
    seen.set(key, occurrence);
    txns.push({ id: `bt-${fnv(`${key}#${occurrence}`)}`, date, amountPaise, description, reference, line, occurrence });
  });
  const sameFileDuplicates = txns.filter((t) => t.occurrence > 1).map((t) => t.id);
  return { ok: true, txns, errors, sameFileDuplicates };
}

// All invoice references in free text, normalised ("inv-26-27-0011" -> "INV/26-27/0011").
export function findRefs(text) {
  const re = /INV[\s/\-_.]*(\d{2})[\s\-/_.]*(\d{2})[\s/\-_.]*(\d{1,4})\b/gi;
  const out = [];
  for (const m of String(text ?? '').matchAll(re)) {
    const ref = formatNumber('INV', `${m[1]}-${m[2]}`, Number(m[3]));
    if (!out.includes(ref)) out.push(ref);
  }
  return out;
}

const STOP = new Set(['pvt', 'ltd', 'private', 'limited', 'llp', 'co', 'and', 'the', 'ms', 'company', 'enterprises', 'industries']);
const tokens = (name) => norm(name).split(' ').filter((t) => t.length >= 3 && !STOP.has(t));

// A customer matches only when every significant word of its name appears in the bank text, so
// "Patil Foods" never matches a deposit from "Patil Agro".
export function matchCustomer(customers, text) {
  const words = new Set(norm(text).split(' '));
  const hits = customers.filter((c) => {
    const t = tokens(c.name);
    return t.length > 0 && t.every((w) => words.has(w));
  });
  return hits.length === 1 ? hits[0] : null;
}

function tdsCheck(inv, amountPaise, balance) {
  if (balance !== inv.totalPaise) return null; // only on a first, single payment against the full total
  const shortfall = balance - amountPaise;
  if (shortfall <= 0) return null;
  for (const rate of RECONCILIATION.tdsRates) {
    const expected = roundDiv(inv.taxablePaise * rate, 100);
    if (Math.abs(shortfall - expected) <= RECONCILIATION.tdsTolerancePaise) return { rate, expectedPaise: expected, shortfallPaise: shortfall };
  }
  return null;
}

/**
 * Suggest how a bank credit maps to open invoices. Never changes data; the owner confirms.
 * Order of evidence: explicit invoice references > customer name with an exact-amount invoice >
 * customer name with oldest-first allocation (low confidence) > unmatched.
 */
export function suggestMatch(state, txn) {
  const text = `${txn.description} ${txn.reference}`;
  const refs = findRefs(text);
  const byNumber = new Map(state.invoices.map((i) => [i.number, i]));

  // Money the owner already recorded (by hand or from a customer's claim) must not be applied twice:
  // same amount, within a week, and the reference or payer name points at that invoice.
  const named = matchCustomer(state.customers, text);
  const recorded = state.payments.find((p) => {
    if (p.bankTxnId || p.amountPaise !== txn.amountPaise || Math.abs(daysBetween(p.date, txn.date)) > RECONCILIATION.recordedWindowDays) return false;
    const inv = state.invoices.find((i) => i.id === p.invoiceId);
    return inv && (refs.includes(inv.number) || inv.customerId === named?.id);
  });
  if (recorded) {
    const inv = state.invoices.find((i) => i.id === recorded.invoiceId);
    return { kind: 'alreadyRecorded', confidence: refs.includes(inv.number) ? 'high' : 'medium', customerId: inv.customerId, paymentId: recorded.id,
      invoiceId: inv.id, allocations: [], excessPaise: 0, refs };
  }
  const refInvoices = refs.map((r) => byNumber.get(r)).filter((i) => i && isOpen(state, i));

  if (refInvoices.length > 0) {
    const customerId = refInvoices[0].customerId;
    if (refInvoices.length === 1) {
      const inv = refInvoices[0];
      const bal = balanceOf(state, inv);
      if (txn.amountPaise === bal) return { kind: 'exact', confidence: 'high', customerId, allocations: [{ invoiceId: inv.id, amountPaise: bal }], excessPaise: 0, refs };
      if (txn.amountPaise > bal) return { kind: 'overpayment', confidence: 'high', customerId, allocations: [{ invoiceId: inv.id, amountPaise: bal }], excessPaise: txn.amountPaise - bal, refs };
      const tds = tdsCheck(inv, txn.amountPaise, bal);
      if (tds) return { kind: 'tds', confidence: 'medium', customerId, allocations: [{ invoiceId: inv.id, amountPaise: txn.amountPaise }], excessPaise: 0, tds, refs };
      return { kind: 'partial', confidence: 'high', customerId, allocations: [{ invoiceId: inv.id, amountPaise: txn.amountPaise }], excessPaise: 0, remainingPaise: bal - txn.amountPaise, refs };
    }
    // Several references: allocate in the order the payer listed them.
    return { kind: 'multi', confidence: 'high', customerId, basis: 'listed', ...allocate(state, refInvoices, txn.amountPaise), refs };
  }

  const customer = matchCustomer(state.customers, text);
  if (customer) {
    const open = state.invoices.filter((i) => i.customerId === customer.id && isOpen(state, i))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number));
    const exact = open.filter((i) => balanceOf(state, i) === txn.amountPaise);
    if (exact.length === 1) return { kind: 'exact', confidence: 'medium', customerId: customer.id, allocations: [{ invoiceId: exact[0].id, amountPaise: txn.amountPaise }], excessPaise: 0, refs: [] };
    if (open.length > 0) return { kind: open.length > 1 ? 'multi' : 'partial', confidence: 'low', customerId: customer.id, basis: 'oldestFirst', ...allocate(state, open, txn.amountPaise), refs: [] };
    return { kind: 'overpayment', confidence: 'low', customerId: customer.id, allocations: [], excessPaise: txn.amountPaise, refs: [] };
  }
  return { kind: 'unmatched', confidence: 'none', customerId: null, allocations: [], excessPaise: 0, refs };
}

function allocate(state, invoices, amount) {
  let left = amount;
  const allocations = [];
  for (const inv of invoices) {
    if (left <= 0) break;
    const take = Math.min(left, balanceOf(state, inv));
    if (take > 0) allocations.push({ invoiceId: inv.id, amountPaise: take });
    left -= take;
  }
  return { allocations, excessPaise: Math.max(0, left) };
}
