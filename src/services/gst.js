import { GST } from '../data/config.js';
import { roundDiv, sum } from '../utils/money.js';

export const DOC_TYPES = { regular: 'tax-invoice', composition: 'bill-of-supply', unregistered: 'invoice' };

const STATE_CODE = /^(0[1-9]|[1-3][0-9]|97|99)$/;
export const isStateCode = (c) => STATE_CODE.test(String(c ?? ''));

// Taxable value of one line in paise: quantity x unit rate, less a percentage discount.
// quantity may have up to 3 decimals (e.g. 2.5 kg); it is scaled to an integer before multiplying.
export function lineTaxable({ qty, ratePaise, discountPct = 0 }) {
  if (!(qty > 0)) throw new RangeError('quantity must be positive');
  if (!Number.isSafeInteger(ratePaise) || ratePaise < 0) throw new RangeError('rate must be a non-negative integer of paise');
  if (!(discountPct >= 0 && discountPct <= 100)) throw new RangeError('discount must be 0-100%');
  const milliQty = BigInt(Math.round(qty * 1000));
  const discountBps = BigInt(Math.round(discountPct * 100)); // basis points
  // taxable = qty * rate * (10000 - bps) / 10000, rounded half-up to the paisa once. BigInt because
  // the product passes 2^53 for lines above roughly ₹90 lakh.
  const n = milliQty * BigInt(ratePaise) * (10000n - discountBps);
  const d = 10000000n;
  const taxable = Number((n * 2n + d) / (2n * d));
  if (!Number.isSafeInteger(taxable)) throw new RangeError('line value too large');
  return taxable;
}

/**
 * Calculate an invoice. Returns { ok:false, error } instead of guessing when data is incomplete.
 * business: { stateCode, registrationType }   placeOfSupply: 2-digit state code
 * Rules: each line's tax is rounded to the paisa; CGST and SGST are each rounded independently
 * (half the rate each); line results are summed; the grand total is rounded to the nearest rupee
 * with an explicit round-off.
 */
export function calculateInvoice({ lines, business, placeOfSupply, allowedRates = GST.allowedRates }) {
  const docType = DOC_TYPES[business?.registrationType];
  if (!docType) return { ok: false, error: 'registration' };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: 'noLines' };
  const collectsGst = business.registrationType === 'regular';
  if (collectsGst && !isStateCode(business.stateCode)) return { ok: false, error: 'supplierState' };
  if (collectsGst && !isStateCode(placeOfSupply)) return { ok: false, error: 'placeOfSupply' };
  const interState = collectsGst && business.stateCode !== placeOfSupply;

  const out = [];
  for (const [i, line] of lines.entries()) {
    const rate = collectsGst ? line.taxRate : 0;
    if (collectsGst && !allowedRates.includes(rate)) return { ok: false, error: 'rate', line: i };
    let taxable;
    try {
      taxable = lineTaxable(line);
    } catch (e) {
      return { ok: false, error: 'line', line: i, detail: e.message };
    }
    const cgst = interState ? 0 : roundDiv(taxable * rate, 200);
    const sgst = cgst;
    const igst = interState ? roundDiv(taxable * rate, 100) : 0;
    out.push({ ...line, taxRate: rate, taxablePaise: taxable, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst,
      lineTotalPaise: taxable + cgst + sgst + igst });
  }
  const taxablePaise = sum(out.map((l) => l.taxablePaise));
  const cgstPaise = sum(out.map((l) => l.cgstPaise));
  const sgstPaise = sum(out.map((l) => l.sgstPaise));
  const igstPaise = sum(out.map((l) => l.igstPaise));
  const exact = taxablePaise + cgstPaise + sgstPaise + igstPaise;
  const totalPaise = roundDiv(exact, 100) * 100;
  return { ok: true, docType, collectsGst, interState, lines: out, taxablePaise, cgstPaise, sgstPaise, igstPaise,
    taxPaise: cgstPaise + sgstPaise + igstPaise, roundOffPaise: totalPaise - exact, totalPaise };
}
