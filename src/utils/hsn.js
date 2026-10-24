import { HSN } from '../data/config.js';

// { ok } or { ok:false, reason: 'digits' | 'length' | 'short', min }. SAC (6 digits starting 99) is
// always valid; any other code needs the minimum digits for the business's aggregate turnover.
export function validateHsn(code, turnoverPaise = 0) {
  const c = String(code ?? '').trim();
  if (!/^\d+$/.test(c)) return { ok: false, reason: 'digits' };
  if (!HSN.allowedLengths.includes(c.length)) return { ok: false, reason: 'length' };
  if (c.length === 6 && c.startsWith('99')) return { ok: true };
  const min = turnoverPaise > HSN.thresholdPaise ? HSN.minDigitsAboveThreshold : HSN.minDigits;
  return c.length < min ? { ok: false, reason: 'short', min } : { ok: true };
}
