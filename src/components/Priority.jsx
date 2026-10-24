import { Link } from 'react-router';
import { useStore } from '../store-context.js';
import { PRIORITY } from '../data/config.js';
import { Badge, Button, ButtonLink, Disclosure, Money, StatusBadge } from './ui.jsx';
import { statusOf } from '../services/invoices.js';
import { useExplain } from '../hooks/useExplain.js';


export function PriorityCard({ r, rank, onSimulate, compact }) {
  const { t, state, today, customer, date, money } = useStore();
  const explain = useExplain();
  const c = customer(r.inv.customerId);
  const lines = explain(r);
  return (
    <article className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-muted">#{rank} · <Link className="font-medium text-brand hover:underline" to={`/invoices/${r.inv.id}`}>{r.inv.number}</Link></div>
          <div className="font-semibold">{c.name}</div>
        </div>
        <div className="text-right">
          <Money paise={r.balance} className="text-lg font-semibold" />
          <div className="flex flex-wrap justify-end gap-1 pt-1">
            <StatusBadge status={statusOf(state, r.inv, today)} />
            {r.breach && (r.helpsGap ? <Badge tone="ok">✓ {t('radar.helps')}</Badge> : <Badge tone="muted">{t('radar.doesntHelp')}</Badge>)}
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm">{lines.slice(0, compact ? 2 : 3).join(' ')}</p>
      {!compact && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="brand" className="num">{t('radar.score', { score: r.score })}</Badge>
            {r.expected && <span className="text-sm text-muted">{t('radar.expectedOn', { date: date(r.expected.date), basis: t(`basis.${r.expected.basis}`) })}</span>}
          </div>
          <Disclosure summary={t('radar.whyThis')} className="mt-3">
            <p className="mb-3 text-sm">{lines.join(' ')}</p>
            <p className="mb-2 text-sm text-muted">{t('radar.scoreTip')}</p>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(r.factors).map(([k, v]) => (
                  <tr key={k} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">{t(`radar.factor.${k}`)}</th>
                    <td className="py-1.5 text-right num">{v} / {PRIORITY.weights[k]}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-ink font-semibold"><th scope="row" className="py-1.5 text-left">{t('common.total')}</th><td className="py-1.5 text-right num">{r.score} / 100</td></tr>
              </tbody>
            </table>
            <h3 className="mt-3 text-sm font-semibold">{t('radar.dataUsed')}</h3>
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              <li>{t('common.dueDate')}: {date(r.inv.dueDate)} · {t('common.balance')}: {money(r.balance)} / {money(r.inv.totalPaise)}</li>
              <li>{t('cust.avgDelay')}: {r.metrics.enoughHistory ? t('common.days', { n: r.metrics.avgDelay }) : t('cust.noHistory')} · {t('cust.onTime')}: {r.metrics.enoughHistory ? `${r.metrics.onTimeRate}%` : '—'} ({r.metrics.count})</li>
              {r.breach && <li>{t('radar.gapTitle', { date: date(r.breach.date) })} · {money(r.targetPaise)}</li>}
              <li>{t('fu.stage')}: {r.ladder.current ? t(`stage.${r.ladder.current.id}`) : '—'}{r.ladder.status === 'due' ? ` (${t('fu.due')})` : ''}</li>
            </ul>
          </Disclosure>
          <div className="mt-3 flex flex-wrap gap-2">
            {onSimulate && r.helpsGap && <Button variant="scenario" onClick={() => onSimulate(r)}>{t('radar.simulate')}</Button>}
            <ButtonLink to={`/follow-ups#${r.inv.id}`}>{t('radar.prepare')}</ButtonLink>
          </div>
        </>
      )}
    </article>
  );
}
