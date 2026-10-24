import { describe, expect, it } from 'vitest';
import { calculateInvoice, lineTaxable } from '../src/services/gst.js';
import { amountInWords, formatINR, formatMoney, roundDiv, rupeesToPaise } from '../src/utils/money.js';
import { validateGstin } from '../src/utils/gstin.js';
import { nextInvoiceNumber } from '../src/services/invoices.js';
import { buildSeed } from '../src/data/seed.js';
import { validateHsn } from '../src/utils/hsn.js';
import { stateLabel, stateName } from '../src/data/config.js';
import { saveInvoice, updateBusiness } from '../src/services/actions.js';
import { validateState } from '../src/services/storage.js';
import { initialsOf } from '../src/utils/initials.js';

const MH = { stateCode: '27', registrationType: 'regular' };
const line = (rupees, taxRate, extra = {}) => ({ description: 'x', hsn: '4819', qty: 1, unit: 'pcs', ratePaise: rupees * 100, discountPct: 0, taxRate, ...extra });

describe('money', () => {
  it('formats Indian grouping', () => {
    expect(formatINR(1_00_000_00)).toBe('₹1,00,000');
    expect(formatINR(12_34_567_89)).toBe('₹12,34,567.89');
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(-5_000_00)).toBe('-₹5,000');
  });
  it('parses rupee input exactly once into paise', () => {
    expect(rupeesToPaise('1,00,000.5')).toBe(10000050);
    expect(rupeesToPaise('0.07')).toBe(7);
    expect(rupeesToPaise('-5')).toBeNull();
    expect(rupeesToPaise('1.234')).toBeNull();
  });
  it('rounds half away from zero without float error', () => {
    expect(roundDiv(249750, 100)).toBe(2498);
    expect(roundDiv(-15, 10)).toBe(-2);
  });
  it('rejects non-integer paise', () => expect(() => formatINR(10.5)).toThrow());
  it('converts for display only, at the owner rate, and falls back to INR without a rate', () => {
    expect(formatMoney(88_000_00, { currency: 'USD', rate: 88 })).toBe('$1,000.00');
    expect(formatMoney(58_00, { currency: 'JPY', rate: 0.58 })).toMatch(/^[¥￥]100$/);
    expect(formatMoney(1_00_000_00, { currency: 'USD', rate: 0 })).toBe('₹1,00,000');
  });
});

describe('GST acceptance tests', () => {
  it('A: ₹10,000 at 18% intra-state → CGST 900 + SGST 900 = ₹11,800', () => {
    const r = calculateInvoice({ lines: [line(10000, 18)], business: MH, placeOfSupply: '27' });
    expect([r.cgstPaise, r.sgstPaise, r.igstPaise, r.totalPaise]).toEqual([90000, 90000, 0, 1180000]);
    expect(r.interState).toBe(false);
  });
  it('B: ₹10,000 at 18% to Gujarat → IGST 1,800 = ₹11,800', () => {
    const r = calculateInvoice({ lines: [line(10000, 18)], business: MH, placeOfSupply: '24' });
    expect([r.cgstPaise, r.sgstPaise, r.igstPaise, r.totalPaise]).toEqual([0, 0, 180000, 1180000]);
  });
  it('3 units at ₹333 with 5% tax rounds each half and the total', () => {
    const r = calculateInvoice({ lines: [line(333, 5, { qty: 3 })], business: MH, placeOfSupply: '27' });
    expect(r.taxablePaise).toBe(99900);
    expect(r.cgstPaise).toBe(2498); // 2497.5 → 2498
    expect(r.sgstPaise).toBe(2498);
    expect(r.totalPaise).toBe(104900);
    expect(r.roundOffPaise).toBe(4);
    expect(r.taxablePaise + r.taxPaise + r.roundOffPaise).toBe(r.totalPaise);
  });
  it('10% discount reduces taxable value', () => {
    expect(lineTaxable({ qty: 10, ratePaise: 100000, discountPct: 10 })).toBe(900000);
  });
  it('a ₹1 crore line (10,000 × ₹1,000) calculates exactly', () => {
    const r = calculateInvoice({ lines: [line(1000, 18, { qty: 10000 })], business: MH, placeOfSupply: '27' });
    expect(r.ok).toBe(true);
    expect(r.taxablePaise).toBe(1_00_00_000_00);
    expect(r.totalPaise).toBe(1_18_00_000_00);
  });
  it('zero-rated line carries no tax', () => {
    const r = calculateInvoice({ lines: [line(5000, 0)], business: MH, placeOfSupply: '27' });
    expect(r.taxPaise).toBe(0);
    expect(r.totalPaise).toBe(500000);
  });
  it('composition business issues a Bill of Supply with no GST', () => {
    const r = calculateInvoice({ lines: [line(10000, 18)], business: { stateCode: '27', registrationType: 'composition' }, placeOfSupply: '24' });
    expect(r.docType).toBe('bill-of-supply');
    expect(r.taxPaise).toBe(0);
    expect(r.totalPaise).toBe(1000000);
  });
  it('multiple lines round independently and reconcile with round-off', () => {
    const lines = [line(0, 18, { ratePaise: 33333 }), line(0, 5, { ratePaise: 11111, qty: 7 }), line(0, 18, { ratePaise: 99, qty: 3 })];
    const r = calculateInvoice({ lines, business: MH, placeOfSupply: '27' });
    const perLine = r.lines.reduce((a, l) => a + l.lineTotalPaise, 0);
    expect(perLine + r.roundOffPaise).toBe(r.totalPaise);
    expect(r.totalPaise % 100).toBe(0);
    expect(r.roundOffPaise).not.toBe(0);
    expect(r.lines[0].cgstPaise).toBe(3000); // 33333*9% = 2999.97 → 3000
  });
  it('rejects invalid tax rates and incomplete state information', () => {
    expect(calculateInvoice({ lines: [line(100, 12)], business: MH, placeOfSupply: '27' })).toMatchObject({ ok: false, error: 'rate' });
    expect(calculateInvoice({ lines: [line(100, 18)], business: MH, placeOfSupply: '' })).toMatchObject({ ok: false, error: 'placeOfSupply' });
    expect(calculateInvoice({ lines: [line(100, 18)], business: { registrationType: 'regular', stateCode: 'XX' }, placeOfSupply: '27' })).toMatchObject({ ok: false, error: 'supplierState' });
    expect(calculateInvoice({ lines: [], business: MH, placeOfSupply: '27' })).toMatchObject({ ok: false, error: 'noLines' });
  });
  it('amount in words matches the rounded total', () => {
    expect(amountInWords(1180000)).toBe('Rupees Eleven Thousand Eight Hundred Only');
    expect(amountInWords(12345678900)).toBe('Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only');
    expect(amountInWords(104900)).toBe('Rupees One Thousand Forty Nine Only');
  });
});

describe('GSTIN validation', () => {
  it('accepts published-format examples and every sample GSTIN', () => {
    expect(validateGstin('27AAPFU0939F1ZV').ok).toBe(true);
    expect(validateGstin('29AAGCB7383J1Z4').ok).toBe(true);
    const s = buildSeed();
    for (const g of [s.business.gstin, ...s.customers.map((c) => c.gstin).filter(Boolean)]) expect(validateGstin(g).ok).toBe(true);
  });
  it('rejects bad checksum, format and length', () => {
    expect(validateGstin('27AAPFU0939F1ZW')).toMatchObject({ ok: false, reason: 'checksum' });
    expect(validateGstin('27AAKFS7319M1ZK').reason).toBe('checksum');
    expect(validateGstin('27AAPFU0939F1XV').reason).toBe('format');
    expect(validateGstin('27AAPFU0939F1Z').reason).toBe('length');
  });
});

describe('invoice numbering', () => {
  it('is consecutive within the financial year and restarts in a new one', () => {
    const inv = [{ number: 'INV/26-27/0007' }, { number: 'INV/26-27/0003' }, { number: 'INV/25-26/0099' }, { number: null }];
    expect(nextInvoiceNumber(inv, '2026-10-01')).toBe('INV/26-27/0008');
    expect(nextInvoiceNumber(inv, '2027-03-31')).toBe('INV/26-27/0008');
    expect(nextInvoiceNumber(inv, '2027-04-01')).toBe('INV/27-28/0001');
    expect(nextInvoiceNumber(inv, '2027-04-01').length).toBeLessThanOrEqual(16);
  });
  it('seed numbers are unique', () => {
    const nums = buildSeed().invoices.map((i) => i.number).filter(Boolean);
    expect(new Set(nums).size).toBe(nums.length);
  });
});

describe('HSN/SAC validation', () => {
  const LOW = 2_40_00_000_00; // ₹2.4 crore
  const HIGH = 6_00_00_000_00; // ₹6 crore
  it('4-digit HSN passes up to ₹5 crore and fails above it', () => {
    expect(validateHsn('4819', LOW).ok).toBe(true);
    expect(validateHsn('4819', HIGH)).toEqual({ ok: false, reason: 'short', min: 6 });
  });
  it('6-digit HSN passes at both turnovers', () => {
    expect(validateHsn('481910', LOW).ok).toBe(true);
    expect(validateHsn('481910', HIGH).ok).toBe(true);
  });
  it('rejects letters and other lengths', () => {
    expect(validateHsn('48A9', LOW)).toEqual({ ok: false, reason: 'digits' });
    expect(validateHsn('', LOW).reason).toBe('digits');
    expect(validateHsn('48191', LOW)).toEqual({ ok: false, reason: 'length' });
  });
  it('a 6-digit SAC starting 99 passes at any turnover', () => {
    expect(validateHsn('998912', LOW).ok).toBe(true);
    expect(validateHsn('998912', HIGH).ok).toBe(true);
  });
  it('every seeded line passes at the seeded turnover', () => {
    const s = buildSeed();
    for (const inv of s.invoices) for (const l of inv.lines) expect(validateHsn(l.hsn, s.business.aggregateTurnoverPaise).ok, l.hsn).toBe(true);
  });
  it('saveInvoice blocks a bad code and names the line', () => {
    const s = buildSeed();
    const form = { customerId: s.customers[0].id, date: s.settings.demoDate, dueDate: s.settings.demoDate, creditDays: 0, placeOfSupply: '27', billingAddress: '', lines: [line(100, 18), line(100, 18, { hsn: 'abc' })] };
    expect(saveInvoice(s, form, { issue: true })).toMatchObject({ error: 'hsn', line: 1 });
  });
});

describe('state names on documents', () => {
  it('labels a code with its name, falling back to the bare code', () => {
    expect(stateLabel('27')).toBe('Maharashtra (27)');
    expect(stateLabel('98')).toBe('98');
    expect(stateName('24')).toBe('Gujarat');
  });
  it('a changed state code can never leave the old name behind', () => {
    const r = updateBusiness(buildSeed(), { stateCode: '24' });
    expect(r.state.business.state).toBe('Maharashtra'); // stale stored field...
    expect(stateName(r.state.business.stateCode)).toBe('Gujarat'); // ...which documents no longer read
  });
});

describe('business profile', () => {
  const bank = { name: 'Bank', account: '123', ifsc: 'HDFC0001234' };
  it('saves valid bank details and rejects a bad IFSC or missing account', () => {
    expect(updateBusiness(buildSeed(), { bank }).state.business.bank).toEqual(bank);
    expect(updateBusiness(buildSeed(), { bank: { ...bank, ifsc: 'HDFC1234' } }).error).toBe('ifsc');
    expect(updateBusiness(buildSeed(), { bank: { ...bank, account: ' ' } }).error).toBe('bankRequired');
  });
  it('needs a Udyam category only when registered', () => {
    expect(updateBusiness(buildSeed(), { udyam: { registered: true, category: 'large' } }).error).toBe('udyamCategory');
    expect(updateBusiness(buildSeed(), { udyam: { registered: false } }).error).toBeUndefined();
  });
  it('accepts a small PNG/JPG logo, rejects other types and oversize files, and can remove it', () => {
    const png = `data:image/png;base64,${'A'.repeat(100)}`;
    expect(updateBusiness(buildSeed(), { logo: png }).state.business.logo).toBe(png);
    expect(updateBusiness(buildSeed(), { logo: 'data:image/gif;base64,AAAA' }).error).toBe('logoType');
    expect(updateBusiness(buildSeed(), { logo: `data:image/jpeg;base64,${'A'.repeat(300_000)}` }).error).toBe('logoSize');
    expect(updateBusiness(buildSeed(), { logo: null }).state.business.logo).toBeNull();
  });
  it('old saved data without a logo still validates', () => {
    const s = buildSeed();
    delete s.business.logo;
    expect(validateState(s)).toBeNull();
  });
  it('initials come from the business name', () => {
    expect(initialsOf('Sharma Packaging')).toBe('SP');
    expect(initialsOf('Acme')).toBe('AC');
    expect(initialsOf('')).toBe('?');
  });
});
