// Every change to stored data goes through these pure transitions. Each returns
// { state } or { state, error } (state unchanged on error) and appends a Decision Trail entry.
import { compareDates, isValidDate } from '../utils/dates.js';
import { validateGstin } from '../utils/gstin.js';
import { validateHsn } from '../utils/hsn.js';
import { calculateInvoice, isStateCode } from './gst.js';
import { balanceOf, nextInvoiceNumber } from './invoices.js';
import { suggestMatch } from './reconciliation.js';

function draft(state) {
  const s = structuredClone(state);
  s.counters ??= { id: 1000 };
  return s;
}
const newId = (s, prefix) => `${prefix}-${++s.counters.id}`;
const fail = (state, error, extra = {}) => ({ state, error, ...extra });

export function logEvent(s, type, { invoiceId = null, amountPaise = null, actor = 'owner', ...detail } = {}) {
  s.trail.push({ id: newId(s, 'ev'), date: s.settings.demoDate, ts: new Date().toISOString(), type, invoiceId, amountPaise, actor, detail });
}

const findInv = (s, id) => s.invoices.find((i) => i.id === id);

// ---- Invoices ---------------------------------------------------------------

export function saveInvoice(state, form, { issue }) {
  const s = draft(state);
  const customer = s.customers.find((c) => c.id === form.customerId);
  if (!customer) return fail(state, 'customer');
  if (!isValidDate(form.date) || !isValidDate(form.dueDate)) return fail(state, 'date');
  if (compareDates(form.dueDate, form.date) < 0) return fail(state, 'dueBeforeDate');
  const badHsn = form.lines.findIndex((l) => !validateHsn(l.hsn, s.business.aggregateTurnoverPaise).ok);
  if (badHsn >= 0) return fail(state, 'hsn', { line: badHsn });
  const calc =calculateInvoice({ lines: form.lines, business: s.business, placeOfSupply: form.placeOfSupply });
  if (!calc.ok) return fail(state, calc.error, { line: calc.line });
  const existing = form.id ? findInv(s, form.id) : null;
  if (existing && existing.status !== 'draft') return fail(state, 'alreadyIssued');
  const inv = existing || { id: newId(s, 'inv'), reminders: {}, dispute: null, promise: null, claim: null, snoozedUntil: null, stopped: false };
  Object.assign(inv, {
    customerId: form.customerId, date: form.date, dueDate: form.dueDate, creditDays: form.creditDays,
    placeOfSupply: form.placeOfSupply, billingAddress: form.billingAddress, deliveryAddress: form.deliveryAddress || '',
    reverseCharge: !!form.reverseCharge, lines: form.lines.map((l) => ({ ...l })),
    docType: calc.docType, taxablePaise: calc.taxablePaise, totalPaise: calc.totalPaise,
    status: issue ? 'issued' : 'draft', number: issue ? nextInvoiceNumber(s.invoices, form.date, s.business.invoicePrefix) : null,
  });
  if (issue) inv.token = `p${inv.id.replace(/\D/g, '')}${inv.number.replace(/\D/g, '').slice(-4)}`;
  if (!existing) s.invoices.push(inv);
  logEvent(s, issue ? 'invoice-issued' : 'invoice-draft', { invoiceId: inv.id, amountPaise: calc.totalPaise, number: inv.number });
  return { state: s, invoiceId: inv.id };
}

// ---- Customers -----------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// New customer from the invoice form or the Customers page. A GSTIN, when given, must pass the
// checksum and decides the state code; without one the owner picks the state (place of supply).
export function addCustomer(state, form) {
  const s = draft(state);
  const name = form.name?.trim();
  if (!name) return fail(state, 'nameRequired');
  if (s.customers.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) return fail(state, 'duplicateCustomer');
  let gstin = '';
  let stateCode = String(form.stateCode ?? '').trim();
  if (form.gstin?.trim()) {
    const g = validateGstin(form.gstin);
    if (!g.ok) return fail(state, 'gstin');
    gstin = g.value;
    stateCode = g.stateCode;
  }
  if (!isStateCode(stateCode)) return fail(state, 'placeOfSupply');
  const creditDays = form.creditDays === '' || form.creditDays == null ? s.business.paymentTermsDays : Number(form.creditDays);
  if (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 365) return fail(state, 'creditDays');
  const email = form.email?.trim() || '';
  if (email && !EMAIL.test(email)) return fail(state, 'email');
  const c = { id: newId(s, 'c'), name, contactName: form.contactName?.trim() || '', stateCode, gstin, registered: !!gstin, creditDays,
    language: form.language === 'hi' ? 'hi' : 'en', phone: form.phone?.trim() || '', email, address: form.address?.trim() || '' };
  s.customers.push(c);
  logEvent(s, 'customer-added', { name });
  return { state: s, customerId: c.id };
}

// ---- Follow-ups --------------------------------------------------------------

// Opening WhatsApp/email/SMS is logged as "prepared", never as "sent".
export function logPrepared(state, invoiceId, stageId, channel) {
  const s = draft(state);
  logEvent(s, 'reminder-prepared', { invoiceId, stage: stageId, channel });
  return { state: s };
}

// The owner confirms they actually sent it. A stage can only be marked once.
export function markSent(state, invoiceId, stageId, channel) {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv) return fail(state, 'notFound');
  if (inv.reminders[stageId]) return fail(state, 'alreadySent');
  inv.reminders[stageId] = { date: s.settings.demoDate, channel };
  logEvent(s, 'reminder-sent', { invoiceId, stage: stageId, channel, amountPaise: balanceOf(s, inv) });
  return { state: s };
}

// Audited correction: re-open one ladder stage.
export function resetStage(state, invoiceId, stageId, reason) {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv?.reminders[stageId]) return fail(state, 'notSent');
  if (!reason?.trim()) return fail(state, 'reasonRequired');
  delete inv.reminders[stageId];
  logEvent(s, 'stage-reset', { invoiceId, stage: stageId, reason });
  return { state: s };
}

export function snooze(state, invoiceId, until) {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv || !isValidDate(until) || compareDates(until, s.settings.demoDate) < 0) return fail(state, 'date');
  inv.snoozedUntil = until;
  logEvent(s, 'snoozed', { invoiceId, until });
  return { state: s };
}

export function recordPromise(state, invoiceId, date, note = '', actor = 'owner') {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv || !isValidDate(date) || compareDates(date, s.settings.demoDate) < 0) return fail(state, 'date');
  inv.promise = { date, note, recordedOn: s.settings.demoDate };
  logEvent(s, 'promise', { invoiceId, promiseDate: date, note, actor, amountPaise: balanceOf(s, inv) });
  return { state: s };
}

export function setStopped(state, invoiceId, stopped, reason = '') {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv) return fail(state, 'notFound');
  inv.stopped = stopped;
  logEvent(s, stopped ? 'followups-stopped' : 'followups-resumed', { invoiceId, reason });
  return { state: s };
}

// ---- Disputes and customer responses ----------------------------------------

export function raiseDispute(state, invoiceId, reason, actor = 'owner') {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv) return fail(state, 'notFound');
  if (!reason?.trim()) return fail(state, 'reasonRequired');
  if (inv.dispute) return fail(state, 'alreadyDisputed');
  inv.dispute = { reason: reason.trim(), raisedOn: s.settings.demoDate, by: actor };
  s.inbox.push({ id: newId(s, 'in'), type: 'dispute', invoiceId, date: s.settings.demoDate, status: 'pending', actor, data: { reason: reason.trim() } });
  logEvent(s, 'dispute-raised', { invoiceId, reason: reason.trim(), actor });
  return { state: s };
}

/** resolution: 'resume' (customer accepts invoice), 'credit' (credit note of creditPaise), 'stop' */
export function resolveDispute(state, invoiceId, { resolution, creditPaise = 0, note = '' }) {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv?.dispute) return fail(state, 'notDisputed');
  if (!note.trim()) return fail(state, 'reasonRequired');
  if (resolution === 'credit') {
    if (!Number.isSafeInteger(creditPaise) || creditPaise <= 0 || creditPaise > balanceOf(s, inv)) return fail(state, 'amount');
    s.adjustments.push({ id: newId(s, 'adj'), invoiceId, type: 'credit-note', amountPaise: creditPaise, date: s.settings.demoDate, note });
  }
  if (resolution === 'stop') inv.stopped = true;
  inv.dispute = null;
  for (const item of s.inbox) if (item.invoiceId === invoiceId && item.type === 'dispute' && item.status === 'pending') {
    item.status = 'resolved';
    item.resolution = { resolution, note, creditPaise, date: s.settings.demoDate };
  }
  logEvent(s, 'dispute-resolved', { invoiceId, resolution, note, amountPaise: resolution === 'credit' ? creditPaise : null });
  return { state: s };
}

export function customerClaim(state, invoiceId, { reference, date, amountPaise }) {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv) return fail(state, 'notFound');
  // One claim under review at a time: a second submission must not silently replace the
  // first, otherwise two pending inbox events can disagree about what the owner decides on.
  if (inv.claim) return fail(state, 'claimPending');
  if (!reference?.trim()) return fail(state, 'referenceRequired');
  if (!isValidDate(date)) return fail(state, 'date');
  // Same rule as a recorded payment: a future "date paid" can never be confirmed against
  // the bank statement and would otherwise surface as an unconfirmable claim later.
  if (compareDates(date, s.settings.demoDate) > 0) return fail(state, 'futureDate');
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return fail(state, 'amount');
  inv.claim = { reference: reference.trim(), date, amountPaise };
  s.inbox.push({ id: newId(s, 'in'), type: 'payment-report', invoiceId, date: s.settings.demoDate, status: 'pending', actor: 'customer', data: { reference: reference.trim(), date, amountPaise } });
  logEvent(s, 'payment-reported', { invoiceId, actor: 'customer', amountPaise, reference: reference.trim(), paidOn: date });
  return { state: s };
}

export function customerMessage(state, invoiceId, message) {
  const s = draft(state);
  if (!message?.trim()) return fail(state, 'reasonRequired');
  s.inbox.push({ id: newId(s, 'in'), type: 'reply', invoiceId, date: s.settings.demoDate, status: 'pending', actor: 'customer', data: { message: message.trim() } });
  logEvent(s, 'customer-reply', { invoiceId, actor: 'customer' });
  return { state: s };
}

// The owner checks the claim against evidence (bank statement) before money is recorded.
const isClaimRecorded = (inv, data) =>
  !!inv?.claim && inv.claim.reference === data.reference && inv.claim.amountPaise === data.amountPaise && inv.claim.date === data.date;

export function confirmClaim(state, inboxId, { amountPaise, date, evidence }) {
  const item = state.inbox.find((i) => i.id === inboxId);
  if (!item || item.type !== 'payment-report' || item.status !== 'pending') return fail(state, 'notFound');
  if (!evidence?.trim()) return fail(state, 'evidenceRequired');
  const r = recordPayment(state, item.invoiceId, { amountPaise, date, method: 'customer-reported', note: `Evidence: ${evidence.trim()}`, source: 'claim' });
  if (r.error) return r;
  const s = r.state;
  const it = s.inbox.find((i) => i.id === inboxId);
  it.status = 'confirmed';
  it.resolution = { evidence: evidence.trim(), amountPaise, date: s.settings.demoDate };
  const inv = findInv(s, item.invoiceId);
  // Clear the claim only when this notification is the one the invoice is still showing, so an
  // older decision can never wipe a different, later claim the customer reported.
  if (isClaimRecorded(inv, it.data)) inv.claim = null;
  logEvent(s, 'claim-confirmed', { invoiceId: item.invoiceId, amountPaise, evidence: evidence.trim() });
  return { state: s };
}

export function rejectClaim(state, inboxId, reason) {
  const s = draft(state);
  const it = s.inbox.find((i) => i.id === inboxId);
  if (!it || it.status !== 'pending') return fail(state, 'notFound');
  if (!reason?.trim()) return fail(state, 'reasonRequired');
  it.status = 'rejected';
  it.resolution = { reason: reason.trim(), date: s.settings.demoDate };
  const inv = findInv(s, it.invoiceId);
  if (it.type === 'payment-report' && isClaimRecorded(inv, it.data)) inv.claim = null;
  logEvent(s, it.type === 'payment-report' ? 'claim-rejected' : 'reply-closed', { invoiceId: it.invoiceId, reason: reason.trim() });
  return { state: s };
}

// ---- Payments -----------------------------------------------------------------

export function recordPayment(state, invoiceId, { amountPaise, date, method = 'manual', note = '', source = 'manual', bankTxnId = null }) {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv || inv.status === 'draft') return fail(state, 'notFound');
  if (!isValidDate(date)) return fail(state, 'date');
  // Cash only counts once it has arrived; a future-dated receipt would vanish from the forecast.
  if (compareDates(date, s.settings.demoDate) > 0) return fail(state, 'futureDate');
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return fail(state, 'amount');
  if (amountPaise > balanceOf(s, inv)) return fail(state, 'exceedsBalance');
  s.payments.push({ id: newId(s, 'pay'), invoiceId, amountPaise, date, method, note, source, bankTxnId, confirmedOn: s.settings.demoDate });
  logEvent(s, 'payment-confirmed', { invoiceId, amountPaise, paidOn: date, method, source, balanceAfter: balanceOf(s, inv) });
  return { state: s };
}

// Owner records a TDS deduction after receiving the certificate, or another adjustment.
export function recordAdjustment(state, invoiceId, { type, amountPaise, note }) {
  const s = draft(state);
  const inv = findInv(s, invoiceId);
  if (!inv) return fail(state, 'notFound');
  if (!['tds', 'credit-note', 'write-off'].includes(type)) return fail(state, 'type');
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > balanceOf(s, inv)) return fail(state, 'amount');
  if (!note?.trim()) return fail(state, 'reasonRequired');
  s.adjustments.push({ id: newId(s, 'adj'), invoiceId, type, amountPaise, date: s.settings.demoDate, note: note.trim() });
  logEvent(s, 'adjustment', { invoiceId, amountPaise, type, note: note.trim() });
  return { state: s };
}

// ---- Bank reconciliation ---------------------------------------------------------

export function importTransactions(state, parsed, fileName = 'statement.csv') {
  const s = draft(state);
  const known = new Set(s.bankTxns.map((t) => t.id));
  const fresh = parsed.txns.filter((t) => !known.has(t.id));
  const skipped = parsed.txns.length - fresh.length;
  for (const t of fresh) {
    s.bankTxns.push({ ...t, status: 'pending', suggestion: suggestMatch(s, t), importedOn: s.settings.demoDate, fileName,
      reviewDuplicate: parsed.sameFileDuplicates.includes(t.id) });
  }
  s.imports.push({ id: newId(s, 'imp'), fileName, date: s.settings.demoDate, added: fresh.length, skipped, errors: parsed.errors.length });
  logEvent(s, 'statement-imported', { fileName, added: fresh.length, skipped, errors: parsed.errors.length, actor: 'owner' });
  return { state: s, added: fresh.length, skipped };
}

// Re-run suggestions for pending rows (balances may have changed since import).
export function refreshSuggestions(state) {
  const s = draft(state);
  for (const t of s.bankTxns) if (t.status === 'pending') t.suggestion = suggestMatch(s, t);
  return { state: s };
}

/**
 * Owner confirms a bank credit. allocations: [{invoiceId, amountPaise}], any excess becomes
 * unallocated customer credit. Sum of allocations + excess must equal the bank amount exactly.
 */
export function confirmTransaction(state, txnId, { allocations, customerId = null }) {
  let s = draft(state);
  const t = s.bankTxns.find((x) => x.id === txnId);
  if (!t || t.status !== 'pending') return fail(state, 'notFound');
  const allocated = allocations.reduce((a, x) => a + x.amountPaise, 0);
  if (allocations.some((a) => !Number.isSafeInteger(a.amountPaise) || a.amountPaise <= 0)) return fail(state, 'amount');
  if (allocated > t.amountPaise) return fail(state, 'overAllocated');
  const excess = t.amountPaise - allocated;
  if (excess > 0 && !customerId) return fail(state, 'excessNeedsCustomer');
  for (const a of allocations) {
    const r = recordPayment(s, a.invoiceId, { amountPaise: a.amountPaise, date: t.date, method: 'bank', source: 'bank', bankTxnId: t.id, note: t.reference });
    if (r.error) return fail(state, r.error, { invoiceId: a.invoiceId });
    s = r.state;
  }
  if (excess > 0) s.credits.push({ id: newId(s, 'cr'), customerId, amountPaise: excess, date: t.date, bankTxnId: t.id, status: 'unallocated' });
  const tx = s.bankTxns.find((x) => x.id === txnId);
  tx.status = 'confirmed';
  tx.confirmed = { allocations, excessPaise: excess, customerId, on: s.settings.demoDate };
  logEvent(s, 'bank-confirmed', { amountPaise: t.amountPaise, txn: t.id, allocations, excessPaise: excess, invoiceId: allocations[0]?.invoiceId ?? null });
  return { state: s };
}

// The bank credit is money the owner already recorded: link the two, add no new money.
export function linkTransaction(state, txnId, paymentId) {
  const s = draft(state);
  const t = s.bankTxns.find((x) => x.id === txnId);
  const p = s.payments.find((x) => x.id === paymentId);
  if (!t || t.status !== 'pending' || !p) return fail(state, 'notFound');
  if (p.bankTxnId) return fail(state, 'alreadyLinked');
  if (p.amountPaise !== t.amountPaise) return fail(state, 'amount');
  p.bankTxnId = t.id;
  t.status = 'confirmed';
  t.confirmed = { allocations: [], excessPaise: 0, customerId: null, linkedPaymentId: p.id, on: s.settings.demoDate };
  logEvent(s, 'bank-linked', { invoiceId: p.invoiceId, amountPaise: t.amountPaise, txn: t.id });
  return { state: s };
}

export function setTransactionStatus(state, txnId, status, note = '') {
  const s = draft(state);
  const t = s.bankTxns.find((x) => x.id === txnId);
  if (!t || !['ignored', 'pending', 'held'].includes(status)) return fail(state, 'notFound');
  t.status = status;
  t.note = note;
  logEvent(s, `bank-${status}`, { txn: t.id, amountPaise: t.amountPaise, note });
  return { state: s };
}

// ---- Settings ------------------------------------------------------------------

export function updateSettings(state, patch) {
  const s = draft(state);
  if (patch.demoDate !== undefined && !isValidDate(patch.demoDate)) return fail(state, 'date');
  const before = s.settings.demoDate;
  const beforeFx = s.settings.fxRates ? { ...s.settings.fxRates } : {};
  Object.assign(s.settings, patch);
  if (patch.demoDate && patch.demoDate !== before) logEvent(s, 'demo-date', { from: before, to: patch.demoDate, actor: 'system' });
  if (patch.fxRates !== undefined) {
    const codes = Object.keys(patch.fxRates).filter((c) => beforeFx[c] !== undefined && beforeFx[c] !== patch.fxRates[c]).join(', ');
    if (codes) logEvent(s, 'fx-changed', { codes });
  }
  return { state: s };
}

export function updateExpenses(state, expenses) {
  const s = draft(state);
  if (!Array.isArray(expenses)) return fail(state, 'amount');
  for (const e of expenses) {
    if (!Number.isSafeInteger(e.amountPaise) || e.amountPaise < 0) return fail(state, 'amount');
    if (e.schedule?.type === 'monthly' && !(e.schedule.day >= 1 && e.schedule.day <= 31)) return fail(state, 'amount');
    if (e.schedule?.type !== 'monthly' && e.schedule?.type !== 'weekly') return fail(state, 'amount');
  }
  const totalPaise = expenses.reduce((sum, e) => sum + e.amountPaise, 0);
  s.expenses = expenses;
  logEvent(s, 'expenses-changed', { n: expenses.length, amountPaise: totalPaise });
  return { state: s };
}

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const LOGO = /^data:image\/(png|jpeg);base64,/;
export const LOGO_MAX_BYTES = 200 * 1024;
const UDYAM_CATEGORIES = ['micro', 'small', 'medium'];

export function updateBusiness(state, patch) {
  const s = draft(state);
  for (const k of ['openingBalancePaise', 'bufferPaise']) {
    if (patch[k] !== undefined && (!Number.isSafeInteger(patch[k]) || patch[k] < 0)) return fail(state, 'amount');
  }
  if (patch.bank !== undefined) {
    const { name, account, ifsc } = patch.bank;
    if (!name?.trim() || !account?.trim()) return fail(state, 'bankRequired');
    if (!IFSC.test(ifsc ?? '')) return fail(state, 'ifsc');
  }
  if (patch.udyam?.registered && !UDYAM_CATEGORIES.includes(patch.udyam.category)) return fail(state, 'udyamCategory');
  if (patch.logo) {
    // base64 carries 3 bytes per 4 characters; checked again here because the UI is not a trust boundary.
    if (!LOGO.test(patch.logo)) return fail(state, 'logoType');
    if ((patch.logo.length - patch.logo.indexOf(',') - 1) * 0.75 > LOGO_MAX_BYTES) return fail(state, 'logoSize');
  }
  const before = { bufferPaise: s.business.bufferPaise, openingBalancePaise: s.business.openingBalancePaise };
  Object.assign(s.business, patch);
  if (patch.bufferPaise !== undefined && patch.bufferPaise !== before.bufferPaise) {
    logEvent(s, 'buffer-changed', { from: before.bufferPaise, to: patch.bufferPaise, amountPaise: patch.bufferPaise });
  }
  if (patch.openingBalancePaise !== undefined && patch.openingBalancePaise !== before.openingBalancePaise) {
    logEvent(s, 'opening-changed', { from: before.openingBalancePaise, to: patch.openingBalancePaise, amountPaise: patch.openingBalancePaise });
  }
  return { state: s };
}
