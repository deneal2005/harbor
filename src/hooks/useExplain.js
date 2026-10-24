// Plain-language priority explanation, built only from the ranking record (current data).
import { useStore } from '../store-context.js';
import { collectByDate } from '../services/priorityEngine.js';
import { daysBetween } from '../utils/dates.js';

export function useExplain() {
  const { t, money, date, customer, today } = useStore();
  return (r) => {
    const c = customer(r.inv.customerId);
    const m = r.metrics;
    const overdue = r.overdue > 0 ? t('common.daysOverdue', { n: r.overdue }) : t('common.dueIn', { n: Math.max(0, daysBetween(today, r.inv.dueDate)) });
    const lines = [t('reason.summaryHigh', { balance: money(r.balance), overdue })];
    if (!m.enoughHistory) lines.push(t('reason.historyNone', { company: c.name }));
    else if (m.avgDelay > 2) lines.push(t('reason.history', { company: c.name, delay: m.avgDelay, onTime: m.onTimeRate, count: m.count }));
    else lines.push(t('reason.historyEarly', { company: c.name, onTime: m.onTimeRate, count: m.count }));
    lines.push(t(`reason.${r.timingReason}`, { due: date(r.inv.dueDate), expected: r.expected ? date(r.expected.date) : '—', gapDate: r.breach ? date(r.breach.date) : '' }));
    if (r.helpsGap) lines.push(t('reason.cover', { date: date(collectByDate(r.breach, today)), cover: money(r.coverPaise), gap: money(r.targetPaise) }));
    lines.push(t('reason.disclaimer'));
    return lines;
  };
}
