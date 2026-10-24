import { addDays, compareDates, daysBetween, formatDate } from '../utils/dates.js';
import { formatINR } from '../utils/money.js';
import { balanceOf, isOpen, isPromiseActive } from './invoices.js';

/**
 * Where an invoice sits on the escalation ladder on `today`.
 * Stages are reached at dueDate + offset days. Only the latest reached stage can be due, each stage
 * is sent at most once (inv.reminders[stageId]), and the ladder pauses for a dispute, an active
 * payment promise, a customer payment claim under review, or a snooze.
 */
export function ladderState(state, inv, today, ladder = state.settings.ladder) {
  if (!isOpen(state, inv)) return { status: 'closed' };
  const rel = daysBetween(inv.dueDate, today);
  const reached = ladder.filter((s) => s.enabled !== false && s.offset <= rel);
  const current = reached.at(-1) || null;
  const next = ladder.find((s) => s.enabled !== false && s.offset > rel) || null;
  const nextDate = next ? addDays(inv.dueDate, next.offset) : null;
  const sent = inv.reminders || {};
  const promiseBroken = !!inv.promise && !isPromiseActive(inv, today);

  let paused = null;
  if (inv.stopped) paused = 'stopped';
  else if (inv.dispute) paused = 'disputed';
  else if (isPromiseActive(inv, today)) paused = 'promise';
  else if (inv.claim) paused = 'claimReview';
  else if (inv.snoozedUntil && compareDates(inv.snoozedUntil, today) >= 0) paused = 'snoozed';

  const dueStage = current && !sent[current.id] ? current : null;
  return { status: paused ? 'paused' : dueStage ? 'due' : 'waiting', paused, current, dueStage, next, nextDate,
    daysRel: rel, promiseBroken, sent };
}

export function followUps(state, today) {
  const due = [];
  const paused = [];
  const upcoming = [];
  for (const inv of state.invoices) {
    const l = ladderState(state, inv, today);
    if (l.status === 'closed') continue;
    if (l.status === 'paused') paused.push({ inv, ladder: l });
    else if (l.status === 'due') due.push({ inv, ladder: l });
    else if (l.nextDate && daysBetween(today, l.nextDate) <= 7) upcoming.push({ inv, ladder: l });
  }
  due.sort((a, b) => b.ladder.daysRel - a.ladder.daysRel);
  upcoming.sort((a, b) => compareDates(a.ladder.nextDate, b.ladder.nextDate));
  return { due, paused, upcoming };
}

export function fillTemplate(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

// Prepared message for an invoice. Amount is the current confirmed balance, so a part payment
// automatically lowers the next reminder.
export function prepareMessage(state, inv, templateKey, lang, payLinkBase = '') {
  const customer = state.customers.find((c) => c.id === inv.customerId);
  const tpl = state.settings.templates[templateKey]?.[lang] || state.settings.templates[templateKey]?.en || '';
  return fillTemplate(tpl, {
    customer: customer?.contactName || customer?.name || '',
    company: customer?.name || '',
    number: inv.number,
    amount: formatINR(balanceOf(state, inv)),
    total: formatINR(inv.totalPaise),
    dueDate: formatDate(inv.dueDate, lang),
    days: String(Math.max(0, daysBetween(inv.dueDate, state.settings.demoDate))),
    promiseDate: inv.promise ? formatDate(inv.promise.date, lang) : '',
    business: state.business.name,
    owner: state.business.owner,
    phone: state.business.phone,
    email: state.business.email,
    link: `${payLinkBase}/pay/${inv.token}`,
  });
}
