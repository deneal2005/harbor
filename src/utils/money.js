// All money is an integer number of paise. Rupee values only exist at the input/display edge.

export function assertPaise(value, label = 'amount') {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be an integer number of paise`);
  return value;
}

// Parse a rupee string typed by a user ("1,23,456.50") into paise, exactly once.
// Returns null for anything that is not a plain non-negative amount with at most 2 decimals.
export function rupeesToPaise(input) {
  const s = String(input ?? '').replace(/[,\s₹]/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

const fmt0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 });

// ₹1,00,000 style. Shows paise only when they are non-zero (or when exact=true).
export function formatINR(paise, { exact = false } = {}) {
  assertPaise(paise);
  const f = exact || paise % 100 !== 0 ? fmt2 : fmt0;
  return f.format(paise / 100);
}

export const CURRENCIES = {
  INR: { locale: 'en-IN', symbol: '₹' },
  USD: { locale: 'en-US', symbol: '$' },
  EUR: { locale: 'en-IE', symbol: '€' },
  JPY: { locale: 'ja-JP', symbol: '¥' },
};
const fmtCache = new Map();

// Display-only conversion. The ledger, GST and documents stay in INR paise; another currency is
// shown at the owner-entered rate (rupees per 1 unit). Converted values are never stored or summed.
export function formatMoney(paise, { currency = 'INR', rate, exact } = {}) {
  if (currency === 'INR' || !(rate > 0) || !CURRENCIES[currency]) return formatINR(paise, { exact });
  assertPaise(paise);
  if (!fmtCache.has(currency)) fmtCache.set(currency, new Intl.NumberFormat(CURRENCIES[currency].locale, { style: 'currency', currency }));
  return fmtCache.get(currency).format(paise / 100 / rate);
}

export function paiseToRupeeInput(paise) {
  return (paise / 100).toFixed(2).replace(/\.00$/, '');
}

// Integer division rounding half away from zero: roundDiv(n, d) == Math.round(n / d) without float error.
export function roundDiv(n, d) {
  assertPaise(n, 'numerator');
  if (!Number.isSafeInteger(d) || d <= 0) throw new RangeError('divisor must be a positive integer');
  const sign = n < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(n) * 2 + d) / (2 * d));
}

export const sum = (list) => list.reduce((acc, v) => acc + assertPaise(v), 0);

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}

// Indian system: crore, lakh, thousand, hundred.
function integerToWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

export function amountInWords(paise) {
  assertPaise(paise);
  if (paise < 0) return `Minus ${amountInWords(-paise)}`;
  const p = paise % 100;
  return `Rupees ${integerToWords(Math.floor(paise / 100))}${p ? ` and ${twoDigits(p)} Paise` : ''} Only`;
}
