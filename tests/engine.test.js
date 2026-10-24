import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/data/seed.js';
import * as A from '../src/services/actions.js';
import { buildForecast } from '../src/services/forecasting.js';
import { balanceOf, statusOf } from '../src/services/invoices.js';
import { collectByDate, collectionPlan, rankInvoices } from '../src/services/priorityEngine.js';
import { followUps, ladderState, prepareMessage } from '../src/services/reminders.js';
import { customerMetrics } from '../src/services/customerMetrics.js';

const seed = () => buildSeed();
const byNo = (s, n) => s.invoices.find((i) => i.number === `INV/26-27/${n}`);
const today = (s) => s.settings.demoDate;
const ok = (r) => { expect(r.error).toBeUndefined(); return r.state; };

describe('invoice states', () => {
  it('paid invoices have zero balance and status paid', () => {
    const s = seed();
    const inv = byNo(s, '0037');
    expect(balanceOf(s, inv)).toBe(0);
    expect(statusOf(s, inv, today(s))).toBe('paid');
  });
  it('a partial payment reduces the balance by exactly the amount', () => {
    let s = seed();
    const inv = byNo(s, '0069');
    s = ok(A.recordPayment(s, inv.id, { amountPaise: 10_000_00, date: today(s) }));
    expect(balanceOf(s, inv)).toBe(inv.totalPaise - 10_000_00);
    expect(statusOf(s, inv, today(s))).toBe('part-paid');
  });
  it('refuses payments dated after the Demo Date', () => {
    const s = seed();
    const inv = byNo(s, '0068');
    expect(A.recordPayment(s, inv.id, { amountPaise: inv.totalPaise, date: '2026-10-30' }).error).toBe('futureDate');
  });
  it('refuses payments above the balance', () => {
    const s = seed();
    const inv = byNo(s, '0069');
    expect(A.recordPayment(s, inv.id, { amountPaise: inv.totalPaise + 1, date: today(s) }).error).toBe('exceedsBalance');
  });
  it('a customer cannot stack a second payment claim while one is under review', () => {
    let s = seed();
    const inv = byNo(s, '0074'); // issued 23 Oct, due 22 Nov, still open
    s = ok(A.customerClaim(s, inv.id, { reference: 'UTR-1', date: today(s), amountPaise: 100_000 }));
    const again = A.customerClaim(s, inv.id, { reference: 'UTR-2', date: today(s), amountPaise: 50_000 });
    expect(again.error).toBe('claimPending');
    // the first claim and its inbox event survive untouched
    expect(again.state.invoices.find((i) => i.id === inv.id).claim).toMatchObject({ reference: 'UTR-1' });
    expect(again.state.inbox.filter((x) => x.type === 'payment-report' && x.status === 'pending')).toHaveLength(1);
  });
  it('refuses customer claims dated after the Demo Date', () => {
    const s = seed();
    const inv = byNo(s, '0074');
    expect(A.customerClaim(s, inv.id, { reference: 'UTR-F', date: '2026-10-30', amountPaise: 100_000 }).error).toBe('futureDate');
  });
  it('deciding on one claim never wipes a different pending claim on the same invoice', () => {
    const s = seed();
    const inv = byNo(s, '0074');
    inv.claim = { reference: 'NEW-REF', date: '2026-10-22', amountPaise: 500_000 }; // the claim the invoice is showing
    s.inbox.push({ id: 'in-old', type: 'payment-report', invoiceId: inv.id, date: today(s), status: 'pending', actor: 'customer', data: { reference: 'OLD-REF', date: '2026-10-20', amountPaise: 100_000 } });
    const rejected = A.rejectClaim(s, 'in-old', 'No such credit in the bank statement.');
    expect(rejected.error).toBeUndefined();
    expect(rejected.state.inbox.find((x) => x.id === 'in-old').status).toBe('rejected');
    // the newer claim the invoice shows must survive a decision on the older notification
    expect(rejected.state.invoices.find((i) => i.id === inv.id).claim).toEqual({ reference: 'NEW-REF', date: '2026-10-22', amountPaise: 500_000 });
    const confirmed = A.confirmClaim(s, 'in-old', { amountPaise: 100_000, date: '2026-10-20', evidence: 'Statement row 4 sample-0001' });
    expect(confirmed.error).toBeUndefined();
    expect(confirmed.state.invoices.find((i) => i.id === inv.id).claim).toEqual({ reference: 'NEW-REF', date: '2026-10-22', amountPaise: 500_000 });
  });
  it('disputed invoices keep their disputed state; status follows the date', () => {
    const s = seed();
    expect(statusOf(s, byNo(s, '0062'), today(s))).toBe('disputed');
    const inv = byNo(s, '0064'); // due 25 Oct
    expect(statusOf(s, inv, '2026-10-24')).toBe('due-soon');
    expect(statusOf(s, inv, '2026-10-25')).toBe('due-soon');
    expect(statusOf(s, inv, '2026-10-26')).toBe('overdue');
  });
  it('the timeline records each action', () => {
    let s = seed();
    const inv = byNo(s, '0064');
    s = ok(A.markSent(s, inv.id, 'heads-up', 'whatsapp'));
    s = ok(A.recordPromise(s, inv.id, '2026-10-30'));
    const types = s.trail.filter((e) => e.invoiceId === inv.id).map((e) => e.type);
    expect(types).toEqual(['reminder-sent', 'promise']);
  });
});

describe('follow-up ladder', () => {
  it('stages come from the configured schedule and the Demo Date', () => {
    const s = seed();
    const inv = byNo(s, '0064'); // due 2026-10-25
    expect(ladderState(s, inv, '2026-10-21').status).toBe('waiting');
    expect(ladderState(s, inv, '2026-10-22').dueStage.id).toBe('heads-up');
    expect(ladderState(s, inv, '2026-10-25').dueStage.id).toBe('due');
    expect(ladderState(s, inv, '2026-11-01').dueStage.id).toBe('firm');
    expect(ladderState(s, inv, '2026-11-09').dueStage.id).toBe('final');
  });
  it('never sends the same stage twice without an audited reset', () => {
    let s = seed();
    const inv = byNo(s, '0064');
    s = ok(A.markSent(s, inv.id, 'heads-up', 'whatsapp'));
    expect(A.markSent(s, inv.id, 'heads-up', 'email').error).toBe('alreadySent');
    expect(ladderState(s, byNo(s, '0064'), today(s)).status).toBe('waiting');
    expect(A.resetStage(s, inv.id, 'heads-up', '').error).toBe('reasonRequired');
    s = ok(A.resetStage(s, inv.id, 'heads-up', 'Sent to wrong number'));
    expect(ladderState(s, byNo(s, '0064'), today(s)).dueStage.id).toBe('heads-up');
  });
  it('disputes pause and resolution resumes', () => {
    let s = seed();
    const inv = byNo(s, '0060');
    expect(ladderState(s, inv, today(s)).status).toBe('due');
    s = ok(A.raiseDispute(s, inv.id, 'Wrong quantity', 'customer'));
    expect(ladderState(s, byNo(s, '0060'), today(s)).paused).toBe('disputed');
    expect(followUps(s, today(s)).due.map((f) => f.inv.id)).not.toContain(inv.id);
    s = ok(A.resolveDispute(s, inv.id, { resolution: 'resume', note: 'Quantity confirmed by delivery note' }));
    expect(ladderState(s, byNo(s, '0060'), today(s)).status).toBe('due');
  });
  it('a promise pauses until the promised date, then resumes', () => {
    let s = seed();
    const inv = byNo(s, '0063'); // promise 2026-10-28
    expect(ladderState(s, inv, '2026-10-28').paused).toBe('promise');
    const after = ladderState(s, inv, '2026-10-29');
    expect(after.paused).toBeNull();
    expect(after.promiseBroken).toBe(true);
  });
  it('part payments update the next reminder amount', () => {
    let s = seed();
    const inv = byNo(s, '0064');
    expect(prepareMessage(s, inv, 'due', 'en')).toContain('₹1,06,980');
    s = ok(A.recordPayment(s, inv.id, { amountPaise: 6_980_00, date: today(s) }));
    expect(prepareMessage(s, inv, 'due', 'en')).toContain('₹1,00,000');
  });
  it('opening a message link is logged as prepared, not sent', () => {
    let s = seed();
    const inv = byNo(s, '0064');
    s = ok(A.logPrepared(s, inv.id, 'heads-up', 'whatsapp'));
    expect(inv.reminders['heads-up']).toBeUndefined();
    expect(s.invoices.find((i) => i.id === inv.id).reminders['heads-up']).toBeUndefined();
    expect(ladderState(s, inv, today(s)).status).toBe('due');
  });
});

describe('customer metrics', () => {
  it('describes history and labels thin history', () => {
    const s = seed();
    expect(customerMetrics(s, 'c4')).toMatchObject({ enoughHistory: true, grade: 'C', avgDelay: 30 });
    expect(customerMetrics(s, 'c1')).toMatchObject({ grade: 'A', onTimeRate: 100 });
    expect(customerMetrics(s, 'c11')).toMatchObject({ enoughHistory: false, grade: null });
  });
});

describe('cash forecast', () => {
  it('carries every closing balance into the next opening and reconciles each week', () => {
    const s = seed();
    const f = buildForecast(s, today(s));
    expect(f.weeks).toHaveLength(13);
    expect(f.weeks[0].opening).toBe(f.startCash);
    f.weeks.forEach((w, i) => {
      expect(w.opening + w.collections + w.assumedSales - w.outflows).toBe(w.closing);
      if (i > 0) expect(w.opening).toBe(f.weeks[i - 1].closing);
    });
  });
  it('finds the first buffer breach from the seeded obligations', () => {
    const s = seed();
    const f = buildForecast(s, today(s));
    expect(f.firstBreach).toMatchObject({ week: 2, date: '2026-11-01', lowDate: '2026-11-05', gapPaise: 89_715_00 });
    expect(f.firstBreach.contributors.map((c) => c.expenseId)).toEqual(['payroll', 'rent']);
    expect(f.firstNegative).toBeNull();
  });
  it('excludes paid and disputed invoices and counts partial balances once', () => {
    const s = seed();
    const f = buildForecast(s, today(s));
    const ids = f.collections.map((c) => c.invoiceId);
    expect(ids).not.toContain(byNo(s, '0037').id);
    expect(ids).not.toContain(byNo(s, '0062').id);
    expect(f.held.map((h) => h.invoiceId)).toContain(byNo(s, '0062').id);
    const konkan = byNo(s, '0057');
    expect(f.collections.find((c) => c.invoiceId === konkan.id).amountPaise).toBe(konkan.totalPaise - 25_000_00);
  });
  it('a hypothetical collection changes the scenario only, by exactly its amount', () => {
    const s = seed();
    const base = buildForecast(s, today(s));
    const inv = byNo(s, '0060');
    const sc = buildForecast(s, today(s), [{ type: 'collect', invoiceId: inv.id, date: '2026-10-31' }]);
    expect(sc.firstBreach.gapPaise).toBe(base.firstBreach.gapPaise - inv.totalPaise);
    expect(sc.weeks[1].low - base.weeks[1].low).toBe(inv.totalPaise);
    expect(sc.endCash).toBe(base.endCash); // same money, earlier
    expect(sc.weeks[1].hypotheticalCollections).toBe(inv.totalPaise);
    expect(balanceOf(s, inv)).toBe(inv.totalPaise); // ledger untouched
    const partial = buildForecast(s, today(s), [{ type: 'collect', invoiceId: inv.id, date: '2026-10-31', amountPaise: 30_000_00 }]);
    expect(partial.weeks[1].low - base.weeks[1].low).toBe(30_000_00);
  });
  it('a scenario date before today is treated as today, so no money vanishes', () => {
    const s = seed();
    const base = buildForecast(s, today(s));
    const sc = buildForecast(s, today(s), [{ type: 'collect', invoiceId: byNo(s, '0068').id, date: '2026-10-20' }]);
    expect(sc.endCash).toBe(base.endCash);
  });
  it('confirming a payment moves money from expected to cash without double counting', () => {
    let s = seed();
    const base = buildForecast(s, today(s));
    const inv = byNo(s, '0068');
    s = ok(A.recordPayment(s, inv.id, { amountPaise: inv.totalPaise, date: '2026-10-19' }));
    const f = buildForecast(s, today(s));
    expect(f.startCash - base.startCash).toBe(inv.totalPaise);
    expect(f.collections.map((c) => c.invoiceId)).not.toContain(inv.id);
    expect(f.endCash).toBe(base.endCash);
    expect(f.firstBreach.gapPaise).toBe(base.firstBreach.gapPaise - inv.totalPaise);
  });
  it('what-if: customer delay, supplier postponement and new order', () => {
    const s = seed();
    const base = buildForecast(s, today(s));
    const late = buildForecast(s, today(s), [{ type: 'delayCustomer', customerId: 'c5', days: 30 }]);
    // Pimpri's expected receipts move out, so cash dips under the buffer a week earlier.
    expect(late.firstBreach.date < base.firstBreach.date).toBe(true);
    expect(late.lowest.amount).toBeLessThan(base.lowest.amount);
    const occ = base.expenses.find((e) => e.expenseId === 'kraft').id;
    const post = buildForecast(s, today(s), [{ type: 'postponeExpense', occurrenceId: occ, toDate: '2026-11-20' }]);
    expect(post.firstBreach?.gapPaise ?? 0).toBe(Math.max(0, base.firstBreach.gapPaise - 1_40_000_00));
    const order = buildForecast(s, today(s), [{ type: 'newOrder', amountPaise: 2_00_000_00, collectDate: '2026-12-15', expensePaise: 80_000_00, expenseDate: '2026-11-03' }]);
    expect(order.firstBreach.gapPaise).toBe(base.firstBreach.gapPaise + 80_000_00);
  });
  it('the buffer change moves the breach', () => {
    let s = seed();
    s = ok(A.updateBusiness(s, { bufferPaise: 50_000_00 }));
    expect(buildForecast(s, today(s)).firstBreach).toBeNull();
  });
});

describe('Cash Gap-to-Action priority', () => {
  const rank = (s) => rankInvoices(s, today(s), buildForecast(s, today(s)));
  it('is reproducible and each score equals the sum of its factors', () => {
    const s = seed();
    const a = rank(s);
    const b = rank(s);
    expect(a.ranked.map((r) => r.inv.id)).toEqual(b.ranked.map((r) => r.inv.id));
    for (const r of a.ranked) {
      const total = Object.values(r.factors).reduce((x, y) => x + y, 0);
      expect(Math.abs(total - r.score)).toBeLessThan(0.051);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
  it('a large invoice due after the gap does not count toward it; a smaller earlier one does', () => {
    const s = seed();
    const r = rank(s);
    const big = r.ranked.find((x) => x.inv.number === 'INV/26-27/0072');
    const nashik = r.ranked.find((x) => x.inv.number === 'INV/26-27/0060');
    expect(big.balance).toBeGreaterThan(nashik.balance);
    expect(big.helpsGap).toBe(false);
    expect(big.timingReason).toBe('dueAfterGap');
    expect(big.factors.gap).toBe(0);
    expect(nashik.helpsGap).toBe(true);
    expect(nashik.score).toBeGreaterThan(big.score);
  });
  it('disputed and promised invoices are outside the ordinary chase list', () => {
    const s = seed();
    const r = rank(s);
    const ids = r.ranked.map((x) => x.inv.number);
    expect(ids).not.toContain('INV/26-27/0062');
    expect(ids).not.toContain('INV/26-27/0063');
    expect(r.attention.map((a) => a.reason).sort()).toEqual(['disputed', 'promise']);
  });
  it('rankings update after payment, dispute and buffer changes', () => {
    let s = seed();
    const nashik = byNo(s, '0060');
    s = ok(A.recordPayment(s, nashik.id, { amountPaise: 50_000_00, date: today(s) }));
    const afterPart = rank(s).ranked.find((x) => x.inv.id === nashik.id);
    expect(afterPart.balance).toBe(nashik.totalPaise - 50_000_00);
    s = ok(A.raiseDispute(s, nashik.id, 'Short delivery', 'owner'));
    expect(rank(s).ranked.find((x) => x.inv.id === nashik.id)).toBeUndefined();
    let t = ok(A.updateBusiness(seed(), { bufferPaise: 0 }));
    expect(rank(t).hasGap).toBe(false);
  });
  it('the collection plan only uses invoices that can arrive before the gap', () => {
    const s = seed();
    const plan = collectionPlan(rank(s));
    expect(plan.picks.every((p) => p.helpsGap)).toBe(true);
    expect(plan.covered + plan.remaining).toBe(plan.target);
    expect(plan.picks.map((p) => p.inv.number)).toEqual(['INV/26-27/0060', 'INV/26-27/0064']);
  });
  it('collecting a plan invoice by the suggested date shrinks the gap by its full balance', () => {
    const s = seed();
    const f = buildForecast(s, today(s));
    const nashik = byNo(s, '0060');
    const by = collectByDate(f.firstBreach, today(s));
    expect(by).toBe('2026-10-31');
    const sc = buildForecast(s, today(s), [{ type: 'collect', invoiceId: nashik.id, date: by }]);
    expect(sc.firstBreach.gapPaise).toBe(f.firstBreach.gapPaise - nashik.totalPaise);
  });
  it('moving the Demo Date forward changes overdue points', () => {
    const s = seed();
    const a = rank(s).ranked.find((x) => x.inv.number === 'INV/26-27/0060');
    const s2 = ok(A.updateSettings(s, { demoDate: '2026-10-30' }));
    const b = rankInvoices(s2, '2026-10-30', buildForecast(s2, '2026-10-30')).ranked.find((x) => x.inv.number === 'INV/26-27/0060');
    expect(b.factors.overdue).toBeGreaterThan(a.factors.overdue);
  });
});

describe('adding a customer', () => {
  it('validates input, takes the state from a valid GSTIN, and can be invoiced right away', async () => {
    const { withCheckChar } = await import('../src/utils/gstin.js');
    const { addCustomer, saveInvoice } = await import('../src/services/actions.js');
    const s = buildSeed();
    expect(addCustomer(s, { name: '  ' }).error).toBe('nameRequired');
    expect(addCustomer(s, { name: s.customers[0].name.toUpperCase(), stateCode: '27' }).error).toBe('duplicateCustomer');
    expect(addCustomer(s, { name: 'New Co', gstin: '24AABCT1234F1ZX' }).error).toBe('gstin');
    expect(addCustomer(s, { name: 'New Co', stateCode: '99x' }).error).toBe('placeOfSupply');
    expect(addCustomer(s, { name: 'New Co', stateCode: '27', email: 'nope' }).error).toBe('email');
    const gstin = withCheckChar('24AABCT1234F1Z');
    const r = addCustomer(s, { name: 'Surat Weaves', gstin, stateCode: '27', creditDays: '' });
    expect(r.error).toBeUndefined();
    const c = r.state.customers.find((x) => x.id === r.customerId);
    expect(c).toMatchObject({ stateCode: '24', gstin, registered: true, creditDays: s.business.paymentTermsDays });
    const inv = saveInvoice(r.state, { customerId: c.id, date: s.settings.demoDate, dueDate: s.settings.demoDate, creditDays: 0, placeOfSupply: c.stateCode,
      billingAddress: '', lines: [{ description: 'Cartons', hsn: '4819', unit: 'pcs', qty: 1, ratePaise: 10_000_00, discountPct: 0, taxRate: 18 }] }, { issue: true });
    expect(inv.error).toBeUndefined();
    expect(inv.state.invoices.at(-1)).toMatchObject({ customerId: c.id, totalPaise: 11_800_00 });
  });
});

describe('translation and simple-language setting', () => {
  // see tests/i18n.test.js for dictionary parity and makeT behaviour
  it('the follow-up card actions still map to the same sandboxed actions', () => {
    // UI reorganisation must not bypass action-layer safeguards: markSent stays once-per-stage,
    // logPrepared stays "prepared, not sent", and dispute/snooze/promise keep their route.
    let s = seed();
    const inv = byNo(s, '0060');
    s = ok(A.logPrepared(s, inv.id, 'final', 'whatsapp'));
    expect(s.trail.filter((e) => e.type === 'reminder-prepared')).toHaveLength(1);
    expect(s.trail.filter((e) => e.type === 'reminder-sent')).toHaveLength(0);
    s = ok(A.markSent(s, inv.id, 'final', 'whatsapp'));
    expect(s.trail.at(-1).type).toBe('reminder-sent');
    const again = A.markSent(s, inv.id, 'final', 'whatsapp');
    expect(again.error).toBe('alreadySent');
    expect(again.state.trail.filter((e) => e.type === 'reminder-sent')).toHaveLength(1);
  });
});

describe('settings and expenses are logged in the Decision Trail', () => {
  it('expense edits go through a logged action that keeps amounts as integer paise', () => {
    const s0 = seed();
    const exp = s0.expenses.map((e) => ({ ...e, amountPaise: e.amountPaise + 5_00 }));
    const s = ok(A.updateExpenses(s0, exp));
    const ev = s.trail.filter((e) => e.type === 'expenses-changed').at(-1);
    expect(ev.amountPaise).toBe(exp.reduce((x, y) => x + y.amountPaise, 0));
    expect(Number.isSafeInteger(ev.amountPaise)).toBe(true);
    expect(s.expenses).toEqual(exp);
  });
  it('updateExpenses rejects negative or malformed amounts without changing state', () => {
    const s0 = seed();
    for (const bad of [
      [{ ...s0.expenses[0], amountPaise: -5 }],
      [{ ...s0.expenses[0], amountPaise: 10.05 }],
      [{ ...s0.expenses[0], amountPaise: 500, schedule: { type: 'monthly', day: 40 } }],
    ]) {
      const r = A.updateExpenses(s0, bad);
      expect(r.error).toBe('amount');
      expect(r.state).toBe(s0);
      expect(r.state.trail.filter((e) => e.type === 'expenses-changed')).toHaveLength(0);
    }
  });
  it('opening-balance and fx changes leave trail entries', () => {
    const s = ok(A.updateBusiness(seed(), { openingBalancePaise: 10_00_000_00 }));
    expect(s.trail.filter((e) => e.type === 'opening-changed')).toHaveLength(1);
    const s2 = ok(A.updateSettings(s, { fxRates: { ...s.settings.fxRates, USD: 88.5 } }));
    const ev = s2.trail.filter((e) => e.type === 'fx-changed').at(-1);
    expect(ev.detail.codes).toBe('USD');
  });
  it('a no-op fx patch does not log', () => {
    const s = seed();
    const before = s.trail.length;
    const s2 = ok(A.updateSettings(s, { fxRates: { ...s.settings.fxRates, USD: s.settings.fxRates.USD } }));
    expect(s2.trail.filter((e) => e.type === 'fx-changed')).toHaveLength(0);
    expect(s2.trail.length).toBe(before);
  });
  it('toggling simple language persists and touches nothing else (and survives storage round-trip)', async () => {
    const s0 = seed();
    const before = s0.trail.length;
    const onR = A.updateSettings(s0, { simpleLanguage: true });
    expect(onR.error).toBeUndefined();
    const on = onR.state;
    expect(on.settings.simpleLanguage).toBe(true);
    expect(on.settings.language).toBe(s0.settings.language);
    expect(on.settings.currency).toBe(s0.settings.currency);
    expect(on.settings.demoDate).toBe(s0.settings.demoDate);
    expect(on.settings.textSize).toBe(s0.settings.textSize);
    expect(on.settings.fxRates).toEqual(s0.settings.fxRates);
    expect(on.trail.length).toBe(before);
    expect(on.trail).toEqual(s0.trail);
    expect(on.invoices).toEqual(s0.invoices); // business data untouched

    // persistence round-trip through the same storage path the app uses
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    const { saveState } = await import('../src/services/storage.js');
    const { loadState } = await import('../src/services/storage.js');
    saveState(on, storage);
    const loaded = loadState(storage);
    expect(loaded.status).toBe('loaded');
    expect(loaded.state.settings.simpleLanguage).toBe(true);
    expect(loaded.state.invoices.length).toBe(s0.invoices.length);

    // toggling off reverts and leaves the rest alone
    const off = ok(A.updateSettings(on, { simpleLanguage: false }));
    expect(off.settings.simpleLanguage).toBe(false);
    expect(off.settings.language).toBe(s0.settings.language);
  });
});
