import { MSMED } from '../data/config.js';
import { addDays, daysBetween, minDate } from '../utils/dates.js';
import { assertPaise } from '../utils/money.js';

// Same day N months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb).
function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

// Interest under s.16 on one unpaid balance. The appointed day is the agreed due date, capped at
// 45 days after the invoice date. Whole calendar months compound; the leftover days accrue simply.
export function msmedInterest({ principalPaise, invoiceDate, dueDate, today, bankRatePct = MSMED.bankRatePct }) {
  assertPaise(principalPaise);
  const appointed = minDate(dueDate, addDays(invoiceDate, MSMED.maxCreditDays));
  const daysLate = Math.max(0, daysBetween(appointed, today));
  const annual = (MSMED.multiplier * bankRatePct) / 100;
  if (daysLate === 0 || principalPaise <= 0) return { appointed, daysLate, months: 0, annualPct: annual * 100, interestPaise: 0 };
  let months = 0;
  while (daysBetween(addMonths(appointed, months + 1), today) >= 0) months += 1;
  const rest = daysBetween(addMonths(appointed, months), today);
  const factor = (1 + annual / 12) ** months * (1 + (annual * rest) / 365);
  return { appointed, daysLate, months, annualPct: annual * 100, interestPaise: Math.round(principalPaise * (factor - 1)) };
}

export const isMse = (business) => Boolean(business.udyam?.registered && ['micro', 'small'].includes(business.udyam.category));
