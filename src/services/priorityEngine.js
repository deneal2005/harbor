import { PRIORITY } from '../data/config.js';
import { addDays, compareDates, daysBetween } from '../utils/dates.js';
import { customerMetrics } from './customerMetrics.js';
import { balanceOf, daysOverdue, isOpen, isPromiseActive } from './invoices.js';
import { ladderState } from './reminders.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * Cash Gap-to-Action score (0-100). Deterministic; a prioritisation aid, not a payment probability.
 *
 * gap (35):     share of the first cash gap this balance could cover, x timing. Timing is 1 when the
 *               invoice is due on/before the breach date (the owner can legitimately ask for it
 *               before the gap) and its expected date is after the breach (chasing could change the
 *               outcome); 0.5 when it is already expected before the breach (chasing protects a
 *               receipt the forecast already relies on); 0 when it is not due until after the
 *               breach. With no projected breach, the target is obligations in the next 30 days.
 * overdue (20): linear in days overdue, capped at PRIORITY.overdueCapDays.
 * history (20): 12 x (average delay / delayCapDays) + 8 x (late share). Fixed neutral points when
 *               there is not enough history.
 * balance (15): linear in balance up to balanceCapPaise; multiplied by balanceOverlapFactor when
 *               the invoice already earns gap points, so the same rupees are not counted twice.
 * stage (10):   10 if a ladder stage is due today and unsent, 5 if the next stage is within
 *               upcomingStageDays, else 0.
 */
export function rankInvoices(state, today, forecast, weights = PRIORITY.weights) {
  const breach = forecast.firstBreach;
  const target = breach ? breach.gapPaise : forecastObligations30(forecast, today);
  const expectedById = new Map(forecast.collections.filter((c) => !c.hypothetical).map((c) => [c.invoiceId, c]));
  const metrics = new Map();
  const ranked = [];
  const attention = [];

  for (const inv of state.invoices) {
    if (!isOpen(state, inv)) continue;
    const balance = balanceOf(state, inv);
    if (inv.dispute) { attention.push({ inv, balance, reason: 'disputed' }); continue; }
    if (isPromiseActive(inv, today)) { attention.push({ inv, balance, reason: 'promise' }); continue; }
    if (inv.claim) { attention.push({ inv, balance, reason: 'claimReview' }); continue; }
    if (inv.stopped) { attention.push({ inv, balance, reason: 'stopped' }); continue; }

    if (!metrics.has(inv.customerId)) metrics.set(inv.customerId, customerMetrics(state, inv.customerId));
    const m = metrics.get(inv.customerId);
    const expected = expectedById.get(inv.id);
    const overdue = daysOverdue(inv, today);
    const ladder = ladderState(state, inv, today);

    // gap
    let timing = 0;
    let timingReason;
    if (breach) {
      const dueBefore = compareDates(inv.dueDate, breach.lowDate) <= 0;
      const expectedBefore = expected && compareDates(expected.date, breach.lowDate) <= 0;
      if (!dueBefore) { timing = 0; timingReason = 'dueAfterGap'; }
      else if (expectedBefore) { timing = 0.5; timingReason = 'alreadyExpected'; }
      else { timing = 1; timingReason = 'canPullForward'; }
    } else {
      timing = daysBetween(today, inv.dueDate) <= 30 ? 1 : 0;
      timingReason = timing ? 'noGapDueSoon' : 'noGapLater';
    }
    const coverPaise = Math.min(balance, target);
    const gapPts = target > 0 ? weights.gap * (coverPaise / target) * timing : 0;

    const overduePts = weights.overdue * clamp01(overdue / PRIORITY.overdueCapDays);

    let historyPts;
    if (m.enoughHistory) {
      historyPts = weights.history * (0.6 * clamp01(m.avgDelay / PRIORITY.delayCapDays) + 0.4 * (1 - m.onTimeRate / 100));
    } else historyPts = PRIORITY.insufficientHistoryPoints * (weights.history / 20);

    const overlap = gapPts > 0 ? PRIORITY.balanceOverlapFactor : 1;
    const balancePts = weights.balance * clamp01(balance / PRIORITY.balanceCapPaise) * overlap;

    let stagePts = 0;
    if (ladder.status === 'due') stagePts = weights.stage;
    else if (ladder.nextDate && daysBetween(today, ladder.nextDate) <= PRIORITY.upcomingStageDays) stagePts = weights.stage / 2;

    const factors = { gap: round1(gapPts), overdue: round1(overduePts), history: round1(historyPts), balance: round1(balancePts), stage: round1(stagePts) };
    const score = round1(Object.values(factors).reduce((a, b) => a + b, 0));
    ranked.push({
      inv, balance, score, factors, metrics: m, expected, overdue, ladder,
      timing, timingReason, coverPaise: timing > 0 ? coverPaise : 0, targetPaise: target, breach,
      helpsGap: !!breach && timing === 1,
    });
  }
  // Stable, reproducible order: score, then larger balance, then invoice number.
  ranked.sort((a, b) => b.score - a.score || b.balance - a.balance || a.inv.number.localeCompare(b.inv.number));
  return { ranked, attention, target, hasGap: !!breach };
}

function forecastObligations30(forecast, today) {
  return forecast.expenses.filter((e) => daysBetween(today, e.date) < 30).reduce((a, e) => a + e.amountPaise, 0);
}

/**
 * A practical (not optimal, not guaranteed) collection plan for the first gap: take invoices that
 * can be pulled forward before the breach, highest score first, until the gap is covered.
 */
export function collectionPlan(ranking) {
  const { ranked, target, hasGap } = ranking;
  if (!hasGap) return null;
  let remaining = target;
  const picks = [];
  for (const r of ranked.filter((x) => x.helpsGap)) {
    if (remaining <= 0) break;
    const counts = Math.min(r.balance, remaining);
    picks.push({ ...r, countsPaise: counts });
    remaining -= counts;
  }
  return { picks, covered: target - Math.max(0, remaining), remaining: Math.max(0, remaining), target };
}

// Suggested "collect by" date for the counterfactual: the day before cash first dips below the
// buffer (collecting only before the low point would still leave the earlier dip).
export const collectByDate = (breach, today) => {
  const d = addDays(breach.date, -1);
  return compareDates(d, today) < 0 ? today : d;
};
