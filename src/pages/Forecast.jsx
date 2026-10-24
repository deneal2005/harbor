import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CalendarRange, TrendingDown, TriangleAlert, Wallet } from 'lucide-react';
import { ForecastChart, ScenarioPanel } from '../components/Scenario.jsx';
import { Badge, Button, Card, CountMoney, Disclosure, Money, Notice, Page, Stat } from '../components/ui.jsx';
import { FORECAST } from '../data/config.js';
import { buildAuditPayload } from '../services/audit.js';
import { CATEGORIES } from '../services/forecasting.js';
import { useStore } from '../store-context.js';

const POLL_MS = 2000;
const MAX_WAIT_MS = 120000;

function IntegrityCheck() {
  const { t, state, forecast, money, date } = useStore();
  const [run, setRun] = useState({ phase: 'idle' });
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const poll = async (runId, started) => {
    while (!cancelled.current) {
      if (Date.now() - started > MAX_WAIT_MS) return setRun((r) => ({ ...r, phase: 'timeout' }));
      const res = await fetch(`/api/integrity-check/${encodeURIComponent(runId)}`).catch(() => null);
      if (!res) return setRun({ phase: 'offline' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setRun({ phase: 'error', message: body.error || res.status, runId });
      setRun({ phase: body.status === 'succeeded' || body.status === 'failed' || body.status === 'canceled' ? body.status : 'running', runId, status: body.status, report: body.report, error: body.error });
      if (['succeeded', 'failed', 'canceled'].includes(body.status)) return;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  };

  const start = async () => {
    setRun({ phase: 'starting' });
    const payload = buildAuditPayload(state, forecast);
    const res = await fetch('/api/integrity-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    if (!res) return setRun({ phase: 'offline' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 503) return setRun({ phase: 'notConfigured' });
    if (!res.ok) return setRun({ phase: 'error', message: body.message || body.error || `HTTP ${res.status}` });
    setRun({ phase: 'running', runId: body.runId, status: 'pending' });
    poll(body.runId, Date.now());
  };

  const busy = run.phase === 'starting' || run.phase === 'running';
  const r = run.report;
  // Static hosting (GitHub Pages) has no Node server, so the server-backed check is replaced by a note.
  if (import.meta.env.VITE_STATIC === '1') return <Card title={t('audit.title')}><p className="text-sm text-muted">{t('audit.static')}</p></Card>;
  return (
    <Card title={t('audit.title')} tone="brand">
      <p className="text-sm">{t('audit.body')}</p>
      <p className="mt-1 text-sm text-muted">{t('audit.sends')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={start} disabled={busy} aria-describedby="audit-status">{busy ? (run.phase === 'starting' ? t('audit.starting') : t('audit.running')) : t('audit.run')}</Button>
        {run.phase === 'timeout' && <Button onClick={() => { setRun((x) => ({ ...x, phase: 'running' })); poll(run.runId, Date.now()); }}>{t('audit.checkAgain')}</Button>}
      </div>
      <div id="audit-status" aria-live="polite" className="mt-3 space-y-2">
        {run.runId && <p className="text-sm"><Badge tone="muted">{t('audit.status', { id: run.runId, status: run.status ?? '…' })}</Badge></p>}
        {run.phase === 'notConfigured' && <Notice tone="warn">{t('audit.notConfigured')}</Notice>}
        {run.phase === 'offline' && <Notice tone="warn">{t('audit.offline')}</Notice>}
        {run.phase === 'error' && <Notice tone="danger">{t('audit.startFailed', { message: run.message })}</Notice>}
        {run.phase === 'timeout' && <Notice tone="warn">{t('audit.timeout')}</Notice>}
        {(run.phase === 'failed' || run.phase === 'canceled') && <Notice tone="danger">{t('audit.runFailed', { error: run.error || run.status })}</Notice>}
        {run.phase === 'succeeded' && r && (
          <div className="rounded-lg border border-line bg-white p-3">
            <p className={`font-semibold ${r.passed ? 'text-ok' : 'text-danger'}`}>{r.passed ? `✓ ${t('audit.passed', { n: r.counts.passed })}` : `✗ ${t('audit.failed', { n: r.counts.failed })}`}</p>
            {r.summary && <p className="text-sm">{r.summary.firstBreach ? t('audit.summary', { date: date(r.summary.firstBreach.date), gap: money(r.summary.firstBreach.gapPaise) }) : t('audit.summaryNone')}</p>}
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {r.checks.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className={c.passed ? 'text-ok' : 'text-danger'} aria-hidden="true">{c.passed ? '✓' : '✗'} </span>
                  <span className="font-medium">{t(`audit.check.${c.id}`)}</span>
                  <span className="sr-only">{c.passed ? 'passed' : 'failed'}</span>
                  <span className="block text-muted">{c.detail}{c.items?.length ? `: ${c.items.join(', ')}` : ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{r.checkedAt}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// What happens to cash in one week: opening, every receipt and payment in date order, closing.
function WeekDetail({ w }) {
  const { t, forecast, money, date, invoice, customer } = useStore();
  const inTotal = w.collections + w.assumedSales;
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-[16rem_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{t('common.week', { n: w.index })} · {date(w.start)} – {date(w.end)}</h3>
          {w.negative ? <Badge tone="danger">{t('forecast.negative')}</Badge> : w.breach ? <Badge tone="danger">{t('forecast.shortfall')}</Badge> : <Badge tone="ok">{t('forecast.ok')}</Badge>}
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-muted">{t('forecast.opening')}</dt><dd className="num">{money(w.opening)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted">{t('forecast.moneyIn')}</dt><dd className="num text-ok">+{money(inTotal)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted">{t('forecast.moneyOut')}</dt><dd className="num text-danger">−{money(w.outflows)}</dd></div>
          <div className="flex justify-between gap-2 border-t border-line pt-1.5 font-semibold"><dt>{t('forecast.closing')}</dt><dd className="num">{money(w.closing)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted">{t('forecast.low')}</dt><dd className={`num ${w.breach ? 'font-semibold text-danger' : ''}`}>{money(w.low)}</dd></div>
        </dl>
      </div>
      {w.ledger.length === 0 ? <p className="text-sm text-muted">{t('forecast.quietWeek')}</p> : (
        <ul className="divide-y divide-line text-sm">
          <li aria-hidden="true" className="hidden grid-cols-[1fr_6.5rem_6.5rem] gap-x-3 pb-1.5 text-xs font-medium uppercase tracking-wider text-faint sm:grid"><span /><span className="text-right">{t('common.amount')}</span><span className="text-right">{t('forecast.balanceAfter')}</span></li>
          {w.ledger.map((e, i) => (
            <li key={`${e.id ?? e.invoiceId}-${i}`} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 py-2 sm:grid-cols-[1fr_6.5rem_6.5rem]">
              <span className="col-span-2 min-w-0 sm:col-span-1">
                <span className="text-muted">{date(e.date).replace(/ \d{4}$/, '')} · </span>
                {e.kind === 'out' ? e.label : e.assumed ? <span className="italic">{t('label.assumed')}</span>
                  : <Link to={`/invoices/${e.invoiceId}`} className="text-brand hover:underline">{invoice(e.invoiceId)?.number} · {customer(invoice(e.invoiceId)?.customerId)?.name}</Link>}
                {e.kind === 'in' && !e.assumed && e.confidence === 'low' && <Badge tone="warn" className="ml-2">{t('confidence.low')}</Badge>}
              </span>
              <Money paise={e.kind === 'out' ? -e.amountPaise : e.amountPaise} tone={e.kind === 'out' ? 'danger' : 'ok'} className="text-right" />
              <Money paise={e.balanceAfter} tone={e.balanceAfter < forecast.buffer ? 'danger' : 'muted'} className="text-right" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Forecast() {
  const { t, state, forecast, money, date, invoice, customer } = useStore();
  const [changes, setChanges] = useState([]);
  const fb = forecast.firstBreach;
  const [week, setWeek] = useState(fb ? fb.week - 1 : 0);
  const b = state.business;
  const rows = [
    ['opening', 'forecast.opening'], ['collections', 'forecast.collections'], ['assumedSales', 'forecast.assumed'],
    ...CATEGORIES.map((c) => [c, `forecast.${c}`]), ['closing', 'forecast.closing'], ['bufferDiff', 'forecast.vsBuffer'], ['low', 'forecast.low'],
  ];
  const outRow = (k) => CATEGORIES.includes(k);

  return (
    <Page title={t('forecast.title')} subtitle={t('forecast.subtitle')}>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label={t('forecast.sumNow')} value={<CountMoney paise={forecast.startCash} fromZero />} sub={t('forecast.sumNowSub')} />
        <Stat icon={TrendingDown} label={t('forecast.sumLow')} tone={forecast.lowest.amount < forecast.buffer ? 'danger' : undefined} value={<CountMoney paise={forecast.lowest.amount} fromZero />} sub={date(forecast.lowest.date)} />
        <Stat icon={TriangleAlert} label={t('forecast.sumGap')} tone={fb ? 'danger' : 'ok'} value={fb ? <CountMoney paise={fb.gapPaise} fromZero /> : t('forecast.sumNoGap')}
          sub={fb ? t('forecast.sumGapSub', { date: date(fb.date) }) : t('forecast.sumNoGapSub', { buffer: money(forecast.buffer) })} to={fb ? '/radar' : undefined} />
        <Stat icon={CalendarRange} label={t('forecast.sumEnd')} value={<CountMoney paise={forecast.endCash} fromZero />} sub={date(forecast.horizonEnd)} />
      </div>

      <Card title={t('forecast.chartTitle')} hint={t('forecast.chartHint')}>
        <ForecastChart base={forecast} selected={week} onSelect={setWeek} />
        <WeekDetail w={forecast.weeks[week]} />
      </Card>

      <ScenarioPanel changes={changes} setChanges={setChanges} />

      <Disclosure summary={t('forecast.table')} className="shadow-[var(--shadow-card)]">
        {/* Desktop: full grid. Mobile: one card per week. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">{t('forecast.title')}</caption>
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="sticky left-0 bg-white py-2 pr-2 text-left">&nbsp;</th>
                {forecast.weeks.map((w) => <th key={w.index} scope="col" className={`px-1.5 py-2 text-right ${w.breach ? 'text-danger' : ''}`}>W{w.index}<span className="block font-normal text-muted">{date(w.start).replace(/ \d{4}$/, '')}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, label]) => (
                <tr key={k} className={`border-b border-line ${k === 'closing' ? 'font-semibold' : ''}`}>
                  <th scope="row" className="sticky left-0 bg-white py-1.5 pr-2 text-left font-medium">{t(label)}</th>
                  {forecast.weeks.map((w) => {
                    const v = outRow(k) ? -w[k] : w[k];
                    return <td key={w.index} className={`px-1.5 py-1.5 text-right num ${(k === 'bufferDiff' || k === 'low') && w[k] < (k === 'low' ? forecast.buffer : 0) ? 'text-danger' : ''} ${k === 'assumedSales' ? 'italic text-muted' : ''}`}>{v === 0 && outRow(k) ? '—' : money(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-3 md:hidden">
          {forecast.weeks.map((w) => (
            <li key={w.index} className={`rounded-lg border p-3 ${w.breach ? 'border-danger/50 bg-danger-soft' : 'border-line'}`}>
              <div className="flex flex-wrap justify-between gap-2 font-semibold">
                <span>{t('common.week', { n: w.index })} · {date(w.start)}</span>
                {w.negative ? <Badge tone="danger">{t('forecast.negative')}</Badge> : w.breach ? <Badge tone="danger">{t('forecast.shortfall')}</Badge> : <Badge tone="ok">{t('forecast.ok')}</Badge>}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt>{t('forecast.opening')}</dt><dd className="text-right num">{money(w.opening)}</dd>
                <dt>{t('forecast.collections')}</dt><dd className="text-right num text-ok">+{money(w.collections)}</dd>
                {w.assumedSales > 0 && <><dt className="italic">{t('forecast.assumed')}</dt><dd className="text-right num italic">+{money(w.assumedSales)}</dd></>}
                {CATEGORIES.filter((c) => w[c]).map((c) => <Fragment key={c}><dt>{t(`forecast.${c}`)}</dt><dd className="text-right num text-danger">−{money(w[c])}</dd></Fragment>)}
                <dt className="font-semibold">{t('forecast.closing')}</dt><dd className="text-right num font-semibold">{money(w.closing)}</dd>
                <dt>{t('forecast.low')}</dt><dd className={`text-right num ${w.breach ? 'text-danger' : ''}`}>{money(w.low)}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </Disclosure>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('forecast.assumptions')} hint={t('forecast.assumptionsHint')}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>{t('forecast.assumption1', { min: FORECAST.minHistory, def: FORECAST.defaultDelayDays })}</li>
            <li>{t('forecast.assumption2', { over: FORECAST.overdueAssumptionDays })}</li>
            <li>{t('forecast.assumption3', { weekly: money(b.assumedWeeklySalesPaise || 0), start: b.assumedSalesStartDays })}</li>
            <li>{t('forecast.assumption4')}</li>
          </ul>
          <Disclosure summary={t('forecast.collections')} className="mt-3">
            <ul className="space-y-1 text-sm">
              {forecast.collections.map((c) => (
                <li key={c.invoiceId} className="flex flex-wrap justify-between gap-2">
                  <span>{invoice(c.invoiceId).number} · {date(c.date)}</span>
                  <span><Money paise={c.amountPaise} /> <Badge tone={c.confidence === 'low' ? 'warn' : 'muted'}>{t(`confidence.${c.confidence}`)}</Badge></span>
                  <span className="w-full text-muted">{t(`basis.${c.basis}`)}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </Card>
        <Card title={t('forecast.held')} hint={t('forecast.heldHint')}>
          {forecast.held.length === 0 ? <p className="text-muted">{t('common.none')}</p> : (
            <ul className="space-y-1 text-sm">{forecast.held.map((h) => <li key={h.invoiceId} className="flex justify-between gap-2"><Link to={`/invoices/${h.invoiceId}`} className="text-brand hover:underline">{invoice(h.invoiceId).number} · {customer(invoice(h.invoiceId).customerId).name}</Link><Money paise={h.amountPaise} /></li>)}</ul>
          )}
        </Card>
      </div>

      <IntegrityCheck />
    </Page>
  );
}
