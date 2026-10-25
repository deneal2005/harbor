import { describe, expect, it } from 'vitest';
import { MSMED } from '../src/data/config.js';
import en from '../src/i18n/en.js';
import { isMse, msmedInterest } from '../src/services/msmed.js';

const P = 1_00_000_00; // ₹1,00,000
const base = { principalPaise: P, invoiceDate: '2026-07-01', dueDate: '2026-07-31' };

describe('MSMED Act interest', () => {
  it('uses three times the bank rate from config', () => {
    expect(MSMED.multiplier).toBe(3);
    expect(msmedInterest({ ...base, today: '2026-08-31' }).annualPct).toBeCloseTo(MSMED.bankRatePct * 3);
  });
  it('one full month at 16.5% a year = 1.375% of the balance', () => {
    const r = msmedInterest({ ...base, today: '2026-08-31', bankRatePct: 5.5 });
    expect(r).toMatchObject({ appointed: '2026-07-31', daysLate: 31, months: 1, interestPaise: 1_375_00 });
  });
  it('compounds with monthly rests (month end clamps 31 Jul + 2 months to 30 Sep)', () => {
    const r = msmedInterest({ ...base, today: '2026-09-30', bankRatePct: 5.5 });
    expect(r.months).toBe(2);
    expect(r.interestPaise).toBe(2_768_91); // 1.01375² − 1, more than 2 × ₹1,375
  });
  it('a part month accrues simple interest by the day', () => {
    const r = msmedInterest({ ...base, today: '2026-08-10', bankRatePct: 5.5 });
    expect(r).toMatchObject({ months: 0, daysLate: 10, interestPaise: Math.round((P * 0.165 * 10) / 365) });
  });
  it('the appointed day is never later than 45 days after the invoice date', () => {
    const r = msmedInterest({ principalPaise: P, invoiceDate: '2026-06-01', dueDate: '2026-08-30', today: '2026-07-16' });
    expect(r).toMatchObject({ appointed: '2026-07-16', daysLate: 0, interestPaise: 0 });
  });
  it('nothing before the due date or on a zero balance; integer paise always', () => {
    expect(msmedInterest({ ...base, today: '2026-07-20' }).interestPaise).toBe(0);
    expect(msmedInterest({ ...base, principalPaise: 0, today: '2026-12-31' }).interestPaise).toBe(0);
    expect(Number.isSafeInteger(msmedInterest({ ...base, principalPaise: 33_333, today: '2026-11-17' }).interestPaise)).toBe(true);
    expect(() => msmedInterest({ ...base, principalPaise: 10.5, today: '2026-08-31' })).toThrow();
  });
  it('applies only to Udyam-registered micro and small businesses', () => {
    expect(isMse({ udyam: { registered: true, category: 'micro' } })).toBe(true);
    expect(isMse({ udyam: { registered: true, category: 'small' } })).toBe(true);
    expect(isMse({ udyam: { registered: true, category: 'medium' } })).toBe(false);
    expect(isMse({ udyam: { registered: false, category: 'micro' } })).toBe(false);
  });
  it('the letter states the Act, the 45-day limit, and never says legal notice', () => {
    expect(en['letter.msme']).toContain('MSMED) Act, 2006');
    expect(en['letter.msme']).toContain('cannot exceed 45 days');
    const letterText = Object.entries(en).filter(([k]) => k.startsWith('letter.') && k !== 'letter.disclaimer').map(([, v]) => v).join(' ');
    expect(letterText.toLowerCase()).not.toContain('legal notice');
    expect(en['letter.interestExcluded']).toContain('not included');
  });
});
