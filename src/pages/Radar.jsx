import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { PriorityCard } from '../components/Priority.jsx';
import { ScenarioPanel } from '../components/Scenario.jsx';
import { Badge, Card, Empty, Money, Notice, Page } from '../components/ui.jsx';
import { collectByDate, collectionPlan } from '../services/priorityEngine.js';
import { useStore } from '../store-context.js';

export default function Radar() {
  const { t, forecast, ranking, today, money, date, invoice, customer } = useStore();
  const [changes, setChanges] = useState([]);
  const scenarioRef = useRef(null);
  const fb = forecast.firstBreach;
  const plan = collectionPlan(ranking);

  const simulate = (r) => {
    setChanges([{ type: 'collect', invoiceId: r.inv.id, date: collectByDate(fb, today) }]);
    requestAnimationFrame(() => scenarioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <Page title={t('radar.title')} subtitle={t('radar.subtitle')}>
      {fb ? (
        <Card tone="danger">
          <h2 className="text-xl font-semibold text-danger">⚠ {t('radar.gapTitle', { date: date(fb.date) })}</h2>
          <p className="mt-1">{t('radar.gapBody', { low: money(fb.low), lowDate: date(fb.lowDate), gap: money(fb.gapPaise), buffer: money(forecast.buffer) })}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{t('radar.causes')}</h3>
              <p className="text-sm text-muted">{t('radar.causesHint', { week: fb.week })}</p>
              <ul className="mt-2 divide-y divide-danger/20 rounded-lg bg-white">
                {fb.contributors.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 p-2 text-sm">
                    <span>{date(e.date)} · {e.label}</span>
                    <span><Money paise={-e.amountPaise} tone="danger" /> <span className="text-muted">→ <Money paise={e.balanceAfter} /></span></span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{t('radar.late')}</h3>
              <p className="text-sm text-muted">{t('radar.lateHint', { date: date(fb.lowDate) })}</p>
              <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-lg bg-white">
                {fb.lateReceipts.filter((c) => c.invoiceId).slice(0, 8).map((c) => {
                  const inv = invoice(c.invoiceId);
                  return (
                    <li key={c.invoiceId} className="flex flex-wrap justify-between gap-2 p-2 text-sm">
                      <Link to={`/invoices/${inv.id}`} className="font-medium text-brand hover:underline">{inv.number} · {customer(inv.customerId).name}</Link>
                      <span><Money paise={c.amountPaise} /> · {date(c.date)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <Card tone="ok">
          <h2 className="text-xl font-semibold text-ok">✓ {t('radar.noGap')}</h2>
          <p className="mt-1">{t('radar.noGapBody', { target: money(ranking.target) })}</p>
        </Card>
      )}

      {plan && (
        <Card title={t('radar.plan')} hint={t('radar.planHint')}>
          <ol className="space-y-2">
            {plan.picks.map((p, i) => (
              <li key={p.inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                <span><span className="font-semibold">{i + 1}.</span> <Link to={`/invoices/${p.inv.id}`} className="font-medium text-brand hover:underline">{p.inv.number}</Link> · {customer(p.inv.customerId).name}</span>
                <span className="text-sm">{t('common.balance')}: <Money paise={p.balance} /> · {t('label.expected')}: {p.expected ? date(p.expected.date) : '—'} · <Badge tone="ok">+<Money paise={p.countsPaise} /></Badge></span>
              </li>
            ))}
          </ol>
          {plan.picks.length === 0 ? <Empty>{t('fu.none')}</Empty> : (
            <div className="mt-3">
              <p className="font-semibold">{t('radar.planCovers', { covered: money(plan.covered), gap: money(plan.target) })}</p>
              {plan.remaining > 0 ? <Notice tone="warn" className="mt-2">{t('radar.planRemaining', { remaining: money(plan.remaining) })}</Notice>
                : <p className="text-sm text-muted">{t('radar.planFull', { date: date(fb.date) })}</p>}
              <p className="mt-1 text-sm text-muted">{t('reason.disclaimer')}</p>
            </div>
          )}
        </Card>
      )}

      <div ref={scenarioRef} className="scroll-mt-20"><ScenarioPanel changes={changes} setChanges={setChanges} kinds={['collect', 'partial', 'delay', 'promise']} /></div>

      <section aria-labelledby="ranked">
        <h2 id="ranked" className="mb-1 text-xl font-semibold">{t('radar.ranked')}</h2>
        <p className="mb-3 text-sm text-muted">{t('radar.scoreTip')}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          {ranking.ranked.map((r, i) => <PriorityCard key={r.inv.id} r={r} rank={i + 1} onSimulate={fb ? simulate : null} />)}
        </div>
        {ranking.ranked.length === 0 && <Empty>{t('fu.none')}</Empty>}
      </section>

      <Card title={t('radar.attention')}>
        {ranking.attention.length === 0 ? <Empty>{t('common.none')}</Empty> : (
          <ul className="space-y-2">
            {ranking.attention.map((a) => (
              <li key={a.inv.id}><Link to={`/invoices/${a.inv.id}`} className="flex flex-wrap justify-between gap-2 rounded-lg border border-line p-3 hover:border-brand">
                <span>{a.inv.number} · {customer(a.inv.customerId).name}<span className="block text-sm text-muted">{t(`attention.${a.reason}`, { date: a.inv.promise ? date(a.inv.promise.date) : '' })}</span></span>
                <Money paise={a.balance} />
              </Link></li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
