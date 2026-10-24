import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, BellRing, CircleCheck, Clock, FileText, HandCoins, Inbox, Landmark, Receipt, TriangleAlert, Wallet, X } from 'lucide-react';
import { Badge, Button, ButtonLink, Card, CountMoney, Empty, Money, Page, ScoreBar, Stat } from '../components/ui.jsx';
import { cx } from '../utils/cx.js';
import { TrailList } from '../components/Trail.jsx';
import { useStore } from '../store-context.js';
import { ageingBucket, balanceOf, isOpen } from '../services/invoices.js';
import { collectByDate, collectionPlan } from '../services/priorityEngine.js';
import { buildForecast } from '../services/forecasting.js';
import { updateSettings } from '../services/actions.js';
import { useExplain } from '../hooks/useExplain.js';
import { QuickRecord } from '../components/QuickRecord.jsx';
import { isLowEndDevice } from '../utils/device.js';

const BUCKETS = [['notDue', 'bg-brand'], ['d1_30', 'bg-warn'], ['d31_60', 'bg-[#d9772b]'], ['d61_90', 'bg-danger/80'], ['d90plus', 'bg-danger']];

// 13-week runway: lowest balance per week against the safety buffer.
function Runway({ forecast }) {
  const { t, money } = useStore();
  const W = 560; const H = 120; const pad = 6;
  const lows = forecast.weeks.map((w) => w.low);
  const max = Math.max(...lows, forecast.buffer) * 1.08; const min = Math.min(...lows, 0);
  const x = (i) => pad + (i * (W - 2 * pad)) / (lows.length - 1);
  const y = (v) => pad + ((max - v) * (H - 2 * pad)) / Math.max(1, max - min);
  const line = lows.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-reveal h-28 w-full" role="img" aria-label={t('forecast.chart')} preserveAspectRatio="none">
      <defs><linearGradient id="rw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0b6b66" stopOpacity="0.18" /><stop offset="1" stopColor="#0b6b66" stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${x(lows.length - 1)},${H} L${x(0)},${H} Z`} fill="url(#rw)" />
      <line x1="0" x2={W} y1={y(forecast.buffer)} y2={y(forecast.buffer)} stroke="#9a5b00" strokeDasharray="5 4" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <path d={line} fill="none" stroke="#0b6b66" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {forecast.weeks.map((w, i) => w.breach && <circle key={w.index} cx={x(i)} cy={y(w.low)} r="3.5" fill="#c0262d"><title>{`W${w.index} · ${money(w.low)}`}</title></circle>)}
    </svg>
  );
}

function PlanStep({ to, icon: Icon, title, sub, done, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-soft text-brand', danger: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-warn', ok: 'bg-ok-soft text-ok' };
  return (
    <li>
      <Link to={to} className="group flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-paper">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${done ? tones.ok : tones[tone]}`}>{done ? <CircleCheck size={18} /> : <Icon size={18} />}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[0.94rem] font-medium ${done ? 'text-muted line-through decoration-faint' : ''}`}>{title}</span>
          {sub && <span className="block text-sm text-muted">{sub}</span>}
        </span>
        <ArrowRight size={16} className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
      </Link>
    </li>
  );
}

// The one action that matters most today: who, why, and what it does to the projected shortfall.
// The one action that matters most today, as the page's single bold card: who, why, what it does
// to the projected shortfall, and how much of the shortfall the whole collection plan covers.
function NextAction({ pick, fb, plan }) {
  const { t, state, today, money, date, customer } = useStore();
  const explain = useExplain();
  const c = customer(pick.inv.customerId);
  const lines = explain(pick);
  const by = fb && collectByDate(fb, today);
  // Hypothetical only: the same scenario engine as Radar, nothing is written to the ledger.
  const after = fb && pick.helpsGap ? buildForecast(state, today, [{ type: 'collect', invoiceId: pick.inv.id, date: by }]).firstBreach : undefined;
  const dueStage = pick.ladder.status === 'due';
  const covered = plan && plan.target > 0 ? Math.min(1, plan.covered / plan.target) : null;
  // Keep the invoice that was opened, so the sheet does not switch customer when a payment clears it.
  const [recording, setRecording] = useState(null);
  const closeRecording = () => setRecording(null);
  return (
    <section aria-labelledby="next-title" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-deep p-5 text-white shadow-[var(--shadow-pop)]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full border-[18px] border-white/[0.06]" />
      <div className="flex items-center gap-2 text-sm font-medium text-white/75"><HandCoins size={16} aria-hidden="true" /><h2 id="next-title">{t('dash.next')}</h2></div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-semibold leading-snug">{t('dash.nextTitle', { company: c.name })}</div>
          <div className="text-sm text-white/70">{pick.inv.number} · {pick.overdue > 0 ? t('common.daysOverdue', { n: pick.overdue }) : `${t('common.dueDate')} ${date(pick.inv.dueDate)}`}</div>
        </div>
        <CountMoney paise={pick.balance} fromZero className="text-3xl font-semibold tracking-tight" />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/85">{lines[1]} {lines[2]}</p>
      {after !== undefined && (
        <div className="mt-3 rounded-xl bg-white/10 px-3 py-2.5 text-sm ring-1 ring-inset ring-white/15">
          <span className="font-medium text-gold">{t('dash.nextImpactLabel', { date: date(by) })}</span>{' '}
          {after ? t('dash.nextImpact', { from: money(fb.gapPaise), to: money(after.gapPaise) }) : t('dash.nextImpactClosed', { from: money(fb.gapPaise) })}
          <span className="block text-xs text-white/60">{t('dash.nextImpactNote')}</span>
        </div>
      )}
      {covered !== null && (
        <div className="mt-3">
          <div className="flex justify-between gap-2 text-xs text-white/70"><span>{t('dash.planProgress', { n: plan.picks.length })}</span><span className="num">{money(plan.covered)} / {money(plan.target)}</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(covered * 100)} aria-label={t('dash.planProgress', { n: plan.picks.length })}>
            <div className="bar-grow h-full rounded-full bg-gold" style={{ width: `${covered * 100}%` }} />
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {dueStage && <ButtonLink to={`/follow-ups#${pick.inv.id}`} variant="light" icon={BellRing}>{t('dash.nextRemind')}</ButtonLink>}
        <Button variant={dueStage ? 'glass' : 'light'} icon={HandCoins} onClick={() => setRecording(pick.inv)}>{t('dash.nextRecord')}</Button>
        <ButtonLink to={`/invoices/${pick.inv.id}`} variant="glass" icon={FileText}>{t('dash.openInvoice')}</ButtonLink>
      </div>
      {recording && <QuickRecord inv={recording} open onClose={closeRecording} />}
    </section>
  );
}

// Demo checklist: each step ticks itself off from what the owner actually did. Owner actions get
// trail ids above the seed's (ev-1, ev-2), so sample history never counts; visited screens come
// from this browser session (Layout records them).
const USER_ID = (e) => Number(e.id.split('-')[1]) > 1000;
function useTour(state, top) {
  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem('harbor:visited') || '[]'); } catch { /* storage blocked: steps 1-2 just stay open */ }
  const did = (types) => state.trail.some((e) => USER_ID(e) && types.includes(e.type));
  const reminded = did(['reminder-prepared', 'reminder-sent']);
  const recorded = did(['payment-confirmed', 'promise', 'dispute-raised', 'claim-confirmed', 'bank-confirmed']);
  const steps = [
    { key: 'intro.s1', to: '/forecast', done: seen.includes('/forecast') || seen.includes('/radar') },
    { key: 'intro.s2', to: '/radar', done: reminded || recorded || seen.includes('/follow-ups') },
    { key: 'intro.s3', to: '/follow-ups', done: reminded },
    { key: 'intro.s4', to: top ? `/invoices/${top.inv.id}` : '/invoices', done: recorded },
    { key: 'intro.s5', to: '/forecast', done: recorded && seen.includes('/forecast') },
  ];
  return { steps, done: steps.filter((s) => s.done).length };
}

// "{owed} is owed…" with each value highlighted, so the summary reads at a glance.
function rich(template, vars) {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && vars[m[1]] ? <strong key={i} className={cx('font-semibold', vars[m[1]].tone)}>{vars[m[1]].text}</strong> : part;
  });
}

export default function Dashboard() {
  const { t, state, today, forecast, ranking, windows, money, date, customer, followUps, run } = useStore();
  const open = state.invoices.filter((i) => isOpen(state, i));
  const total = open.reduce((a, i) => a + balanceOf(state, i), 0);
  const overdue = open.filter((i) => ageingBucket(i, today) !== 'notDue').reduce((a, i) => a + balanceOf(state, i), 0);
  const ageing = BUCKETS.map(([b, color]) => {
    const list = open.filter((i) => ageingBucket(i, today) === b);
    return { b, color, amount: list.reduce((a, i) => a + balanceOf(state, i), 0), count: list.length };
  });
  const fb = forecast.firstBreach;
  const plan = collectionPlan(ranking);
  const pendingInbox = state.inbox.filter((i) => i.status === 'pending').length;
  const pendingBank = state.bankTxns.filter((x) => x.status === 'pending').length;
  const disputes = state.invoices.filter((i) => i.dispute && isOpen(state, i));
  const first = plan?.picks[0];
  const top = first || ranking.ranked[0];
  const tour = useTour(state, top);
  const summary = rich(t(fb ? 'dash.summary' : 'dash.summaryNoGap'), {
    owed: { text: money(total), tone: 'text-ink' },
    overdue: { text: money(overdue), tone: 'text-danger' },
    date: fb && { text: date(fb.date), tone: 'text-danger' },
    company: top && { text: customer(top.inv.customerId).name, tone: 'text-brand' },
  });

  return (
    <Page eyebrow={date(today)} title={t('dash.title', { owner: state.business.owner.split(' ')[0] })} subtitle={summary}>
      {(state.settings.motion || 'auto') === 'auto' && isLowEndDevice() && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line bg-white px-4 py-2 text-sm shadow-[var(--shadow-card)]">
          <span className="text-muted">{t('dash.motionOff')}</span>
          <span className="flex gap-2">
            <Button variant="brand" className="min-h-10" onClick={() => run(updateSettings, { motion: 'on' })}>{t('dash.motionOn')}</Button>
            <Button variant="ghost" className="min-h-10" onClick={() => run(updateSettings, { motion: 'off' })}>{t('dash.motionKeepOff')}</Button>
          </span>
        </div>
      )}
      {!state.settings.introDismissed && (
        <section aria-label={t('intro.label')} className="relative rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3.5 pr-12 sm:px-5">
          <p className="font-medium">{t('intro.pitch')}</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-5">
            {tour.steps.map((s, i) => (
              <li key={s.key}>
                <Link to={s.to} className={cx('group flex h-full items-start gap-2 rounded-xl px-2.5 py-2 text-sm ring-1 ring-inset transition', s.done ? 'bg-white/70 text-ink/60 ring-ok/20' : 'bg-white ring-brand/15 hover:-translate-y-0.5 hover:ring-brand/40 hover:shadow-sm')}>
                  <span className={cx('mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold', s.done ? 'animate-pop bg-ok text-white' : 'bg-brand-soft text-brand')}>
                    {s.done ? <CircleCheck size={13} aria-hidden="true" /> : i + 1}
                  </span>
                  <span className={cx(s.done && 'line-through decoration-ok/40')}>{t(s.key)}<span className="sr-only">{s.done ? ` (${t('intro.doneSr')})` : ''}</span></span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={tour.done} aria-label={t('intro.progress', { n: tour.done })}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${(tour.done / 5) * 100}%` }} />
            </div>
            <span className="num text-xs font-medium text-brand">{tour.done === 5 ? t('intro.complete') : t('intro.progress', { n: tour.done })}</span>
          </div>
          <button type="button" onClick={() => run(updateSettings, { introDismissed: true })} aria-label={t('app.close')}
            className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-white/70 hover:text-ink"><X size={18} aria-hidden="true" /></button>
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden" padded={false}>
          <div className="p-5 pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted"><Wallet size={16} aria-hidden="true" />{t('dash.bank')}</div>
                <div className="mt-1 text-4xl font-semibold tracking-tight"><CountMoney paise={forecast.startCash} fromZero /></div>
              </div>
              <div className="text-right text-sm">
                <div className="text-muted">{t('dash.lowest')}</div>
                <Money paise={forecast.lowest.amount} className={`text-lg font-semibold ${forecast.lowest.amount < forecast.buffer ? 'text-danger' : ''}`} />
                <div className="text-faint">{date(forecast.lowest.date)}</div>
              </div>
            </div>
          </div>
          <div className="px-2"><Runway forecast={forecast} /></div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pb-1 text-xs text-muted">
            <span>{date(forecast.weeks[0].start)} → {date(forecast.weeks.at(-1).end)}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t border-dashed border-warn" aria-hidden="true" />{t('forecast.buffer')} {money(forecast.buffer)}</span>
          </div>
          <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 ${fb ? 'border-danger/15 bg-danger-soft' : 'border-ok/15 bg-ok-soft'}`}>
            <div className="flex min-w-0 items-start gap-2.5">
              {fb ? <TriangleAlert size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" /> : <CircleCheck size={20} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />}
              <div className="min-w-0">
                {fb ? (
                  <>
                    <p className="font-semibold text-danger">{t('dash.alertBreach', { buffer: money(forecast.buffer), date: date(fb.date), week: fb.week })}</p>
                    <p className="text-sm text-ink/75">{t('dash.alertBreachGap', { gap: money(fb.gapPaise) })}{forecast.firstNegative && ` ${t('dash.alertNegative', { date: date(forecast.firstNegative.date) })}`}</p>
                  </>
                ) : <p className="font-semibold text-ok">{t('dash.alertNone', { buffer: money(forecast.buffer) })}</p>}
              </div>
            </div>
            <ButtonLink to="/radar" variant={fb ? 'primary' : 'secondary'} icon={ArrowRight}>{fb ? t('dash.closeGap') : t('dash.openRadar')}</ButtonLink>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          {first || ranking.ranked[0] ? <NextAction pick={first || ranking.ranked[0]} fb={fb} plan={plan} /> : <Card><Empty>{t('fu.none')}</Empty></Card>}
          <Card title={t('dash.alsoToday')}>
          <ol className="-mx-2 space-y-0.5">
            <PlanStep to="/follow-ups" icon={BellRing} tone="warn" done={followUps.due.length === 0}
              title={t('dash.planReminders', { n: followUps.due.length })} sub={followUps.due.length ? t('dash.planRemindersSub') : null} />
            <PlanStep to="/inbox" icon={Inbox} done={pendingInbox === 0} title={t('dash.planInbox', { n: pendingInbox })} />
            <PlanStep to="/payments" icon={Landmark} done={pendingBank === 0 && state.imports.length > 0} title={pendingBank ? t('dash.planBank', { n: pendingBank }) : t('dash.planBankNone')} />
          </ol>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat icon={FileText} label={t('dash.toCollect')} tip={t('dash.toCollectTip')} value={<CountMoney paise={total} fromZero />} sub={t('dash.openCount', { n: open.length })} to="/invoices" />
        <Stat icon={Clock} label={t('dash.overdue')} tip={t('dash.overdueTip')} value={<CountMoney paise={overdue} fromZero />} to="/invoices?status=overdue" tone="danger" />
        <Stat icon={HandCoins} label={t('dash.thisMonth')} tip={t('dash.expectedTip')} value={<CountMoney paise={windows.thisMonth} fromZero />} sub={`${t('dash.thisWeek')}: ${money(windows.thisWeek)}`} to="/forecast" />
        <Stat icon={Receipt} label={t('dash.obligations')} tip={t('dash.obligationsTip')} value={<CountMoney paise={windows.obligations30} fromZero />} to="/settings" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card title={t('dash.top5')} hint={t('radar.scoreTip')} padded={false}
          actions={<Link to="/radar" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand hover:underline">{t('dash.seeAll')}<ArrowRight size={15} /></Link>}>
          {ranking.ranked.length === 0 ? <div className="p-5"><Empty>{t('fu.none')}</Empty></div> : (
            <ul className="divide-y divide-line border-t border-line">
              {ranking.ranked.slice(0, 5).map((r, i) => (
                <li key={r.inv.id}>
                  <Link to={`/invoices/${r.inv.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-paper sm:px-5">
                    <span className="num w-5 shrink-0 text-sm font-semibold text-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{customer(r.inv.customerId).name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
                        <span>{r.inv.number}</span>
                        <span>{r.overdue > 0 ? t('common.daysOverdue', { n: r.overdue }) : t('common.dueDate') + ' ' + date(r.inv.dueDate)}</span>
                        {r.helpsGap && <Badge tone="ok">{t('radar.helps')}</Badge>}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1"><Money paise={r.balance} className="font-semibold" /><ScoreBar score={r.score} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="min-w-0 space-y-4">
          <Card title={t('dash.ageing')}>
            <div className="flex h-3 overflow-hidden rounded-full bg-paper" aria-hidden="true">
              {ageing.map(({ b, color, amount }) => amount > 0 && <div key={b} className={color} style={{ width: `${(amount / Math.max(1, total)) * 100}%` }} />)}
            </div>
            <ul className="mt-3 space-y-0.5">
              {ageing.map(({ b, color, amount, count }) => (
                <li key={b}>
                  <Link to={`/invoices?ageing=${b}`} className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 text-sm hover:bg-paper">
                    <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden="true" />{t(`ageing.${b}`)} <span className="text-faint">· {count}</span></span>
                    <Money paise={amount} className="font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t('dash.attention')}>
            {disputes.length === 0 ? <Empty>{t('dash.noDisputes')}</Empty> : (
              <ul className="space-y-2">
                {disputes.map((i) => (
                  <li key={i.id}><Link to={`/invoices/${i.id}`} className="block rounded-xl bg-scenario-soft p-3 text-sm ring-1 ring-inset ring-scenario/15 hover:ring-scenario/40">
                    <div className="flex justify-between gap-2 font-medium"><span className="truncate">{customer(i.customerId).name}</span><Money paise={balanceOf(state, i)} /></div>
                    <div className="mt-0.5 text-scenario">⚑ {i.dispute.reason}</div>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title={t('dash.recent')} hint={t('dash.recentHint')}>
        <TrailList events={[...state.trail].reverse().slice(0, 6)} showInvoice />
      </Card>
    </Page>
  );
}
