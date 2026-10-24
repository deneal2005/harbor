import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/data/seed.js';
import * as A from '../src/services/actions.js';
import { balanceOf } from '../src/services/invoices.js';
import { findRefs, matchCustomer, parseStatement } from '../src/services/reconciliation.js';
import { buildForecast } from '../src/services/forecasting.js';

const CSV = readFileSync(new URL('../src/data/bank-statement.csv', import.meta.url), 'utf8');
const byNo = (s, n) => s.invoices.find((i) => i.number === `INV/26-27/${n}`);
const imported = () => {
  const s = buildSeed();
  const r = A.importTransactions(s, parseStatement(CSV));
  return r.state;
};
const txn = (s, ref) => s.bankTxns.find((t) => t.reference === ref);

describe('bank statement reconciliation', () => {
  it('parses all six rows', () => {
    const p = parseStatement(CSV);
    expect(p.ok).toBe(true);
    expect(p.txns).toHaveLength(6);
    expect(p.errors).toEqual([]);
  });
  it('rejects future-dated rows when the demo date is given', () => {
    const csv = `${CSV.split('\n')[0]}\n2026-10-30,NEFT CR FUTURE SUPPLIES,UTR-FUT-1,1200.00`;
    const p = parseStatement(csv, { today: '2026-10-23' });
    expect(p.ok).toBe(true);
    expect(p.txns).toHaveLength(0);
    expect(p.errors).toEqual([{ line: 2, error: 'futureDate' }]);
  });
  it('1 exact payment → high confidence on the right invoice', () => {
    const s = imported();
    expect(txn(s, 'NEFT0019KP').suggestion).toMatchObject({ kind: 'exact', confidence: 'high', allocations: [{ invoiceId: byNo(s, '0068').id }] });
  });
  it('2 partial payment keeps the remaining balance', () => {
    const s = imported();
    const t = txn(s, 'IMPS2010WB');
    expect(t.suggestion.kind).toBe('partial');
    const inv = byNo(s, '0069');
    const after = A.confirmTransaction(s, t.id, { allocations: t.suggestion.allocations }).state;
    expect(balanceOf(after, inv)).toBe(inv.totalPaise - 30_000_00);
  });
  it('3 one payment for two invoices follows the listed references', () => {
    const s = imported();
    const t = txn(s, 'RTGS2010DS');
    expect(t.suggestion).toMatchObject({ kind: 'multi', basis: 'listed', excessPaise: 0 });
    expect(t.suggestion.allocations.map((a) => a.invoiceId)).toEqual([byNo(s, '0066').id, byNo(s, '0073').id]);
  });
  it('4 a 2% shortfall on taxable value is flagged as possible TDS, not settled', () => {
    const s = imported();
    const t = txn(s, 'NEFT0021CH');
    expect(t.suggestion).toMatchObject({ kind: 'tds', confidence: 'medium', tds: { rate: 2, expectedPaise: 800_00 } });
    const after = A.confirmTransaction(s, t.id, { allocations: t.suggestion.allocations }).state;
    expect(balanceOf(after, byNo(after, '0070'))).toBe(800_00);
  });
  it('5 an overpayment keeps the excess as unallocated customer credit', () => {
    const s = imported();
    const t = txn(s, 'NEFT0021ST');
    expect(t.suggestion).toMatchObject({ kind: 'overpayment', excessPaise: 687_00 });
    expect(A.confirmTransaction(s, t.id, { allocations: t.suggestion.allocations }).error).toBe('excessNeedsCustomer');
    const after = A.confirmTransaction(s, t.id, { allocations: t.suggestion.allocations, customerId: 'c8' }).state;
    expect(balanceOf(after, byNo(after, '0067'))).toBe(0);
    expect(after.credits).toMatchObject([{ customerId: 'c8', amountPaise: 687_00, status: 'unallocated' }]);
  });
  it('6 an unknown deposit goes to the unmatched queue', () => {
    const s = imported();
    expect(txn(s, 'NEFT0022RK').suggestion).toMatchObject({ kind: 'unmatched', allocations: [] });
  });
  it('importing the same statement twice adds nothing', () => {
    let s = imported();
    const r = A.importTransactions(s, parseStatement(CSV));
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(6);
    expect(r.state.bankTxns).toHaveLength(6);
  });
  it('identical rows inside one file are both kept and flagged for review', () => {
    const dup = 'date,description,reference,amount\n2026-10-20,CASH DEPOSIT,,5000\n2026-10-20,CASH DEPOSIT,,5000\n';
    const p = parseStatement(dup);
    expect(p.txns).toHaveLength(2);
    expect(p.sameFileDuplicates).toHaveLength(1);
  });
  it('nothing is paid and no cash moves until the owner confirms', () => {
    const before = buildSeed();
    const s = imported();
    for (const inv of s.invoices) expect(balanceOf(s, inv)).toBe(balanceOf(before, before.invoices.find((i) => i.id === inv.id)));
    expect(buildForecast(s, s.settings.demoDate).startCash).toBe(buildForecast(before, before.settings.demoDate).startCash);
    expect(s.payments).toHaveLength(before.payments.length);
  });
  it('a confirmed transaction cannot be confirmed twice', () => {
    const s = imported();
    const t = txn(s, 'NEFT0019KP');
    const once = A.confirmTransaction(s, t.id, { allocations: t.suggestion.allocations }).state;
    expect(A.confirmTransaction(once, t.id, { allocations: t.suggestion.allocations }).error).toBe('notFound');
  });
  it('rejects malformed files with a useful error', () => {
    expect(parseStatement('')).toMatchObject({ ok: false, error: 'empty' });
    expect(parseStatement('foo,bar\n1,2')).toMatchObject({ ok: false, error: 'header' });
    const p = parseStatement('date,description,reference,amount\n2026-13-01,x,,10\n2026-10-01,x,,abc\n2026-10-01,x,,-50');
    expect(p.errors.map((e) => e.error)).toEqual(['date', 'amount', 'debit']);
  });
  it('normalises references and never confuses similar customer names', () => {
    expect(findRefs('paid inv 26-27 0007 and INV-26-27-12')).toEqual(['INV/26-27/0007', 'INV/26-27/0012']);
    const customers = [{ id: 'a', name: 'Patil Foods Pvt Ltd' }, { id: 'b', name: 'Patil Agro' }];
    expect(matchCustomer(customers, 'NEFT PATIL AGRO')?.id).toBe('b');
    expect(matchCustomer(customers, 'NEFT PATIL')).toBeNull();
  });
  it('a customer payment claim stays unpaid until confirmed with evidence', () => {
    let s = buildSeed();
    const inv = byNo(s, '0065');
    s = A.customerClaim(s, inv.id, { reference: 'UTR123', date: '2026-10-22', amountPaise: inv.totalPaise }).state;
    expect(balanceOf(s, inv)).toBe(inv.totalPaise);
    const item = s.inbox.find((i) => i.type === 'payment-report');
    expect(A.confirmClaim(s, item.id, { amountPaise: inv.totalPaise, date: '2026-10-22', evidence: '' }).error).toBe('evidenceRequired');
    s = A.confirmClaim(s, item.id, { amountPaise: inv.totalPaise, date: '2026-10-22', evidence: 'Seen on bank statement 22 Oct' }).state;
    expect(balanceOf(s, inv)).toBe(0);
  });
});

describe('money already recorded is never applied twice', () => {
  it('a bank credit for a payment recorded by hand is offered as a link, and linking adds no money', () => {
    let s = buildSeed();
    const inv = byNo(s, '0068');
    const bal = balanceOf(s, inv);
    s = A.recordPayment(s, inv.id, { amountPaise: bal, date: s.settings.demoDate }).state;
    const cashBefore = buildForecast(s, s.settings.demoDate).startCash;
    s = A.importTransactions(s, parseStatement(CSV)).state;
    const t = txn(s, 'NEFT0019KP');
    expect(t.suggestion).toMatchObject({ kind: 'alreadyRecorded', confidence: 'high', invoiceId: inv.id, allocations: [] });
    const r = A.linkTransaction(s, t.id, t.suggestion.paymentId);
    expect(r.error).toBeUndefined();
    expect(buildForecast(r.state, r.state.settings.demoDate).startCash).toBe(cashBefore);
    expect(r.state.credits).toHaveLength(s.credits.length);
    expect(A.linkTransaction(r.state, t.id, t.suggestion.paymentId).error).toBe('notFound');
  });
});
