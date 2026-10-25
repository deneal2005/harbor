import { useId, useState } from 'react';
import { balanceOf, isOpen } from '../services/invoices.js';
import { useStore } from '../store-context.js';
import { useScenario } from '../hooks/useScenario.js';
import { addDays } from '../utils/dates.js';
import { CURRENCIES, rupeesToPaise } from '../utils/money.js';
import { cx } from '../utils/cx.js';
import { Badge, Button, Card, Field, Money, Notice, inputCls } from './ui.jsx';

// Round axis steps (1, 2, 2.5, 5 x 10^n) so the money scale reads naturally.
function niceStep(range, ticks) {
  const raw = Math.max(1, range / ticks);
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
}

// Lowest balance each week (the number the buffer is tested against), with a money axis, the
// safety-buffer zone, an optional scenario line, and weeks that can be hovered, focused or clicked.
export function ForecastChart({ base, scenario, selected, onSelect }) {
  const { t, money, date, currency, rate } = useStore();
  const [hover, setHover] = useState(null);
  const gid = `fc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const W = 720; const H = 280; const P = { l: 60, r: 14, t: 18, b: 34 };
  const values = [...base.weeks.map((w) => w.low), ...(scenario?.weeks.map((w) => w.low) ?? []), base.buffer, 0];
  const step = niceStep(Math.max(...values) - Math.min(...values), 4);
  const min = Math.floor(Math.min(...values) / step) * step;
  const max = Math.ceil((Math.max(...values) * 1.05) / step) * step;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  const n = base.weeks.length;
  const colW = (W - P.l - P.r) / n;
  const x = (i) => P.l + colW * (i + 0.5);
  const y = (v) => P.t + ((max - v) * (H - P.t - P.b)) / Math.max(1, max - min);
  const line = (f) => f.weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.low).toFixed(1)}`).join(' ');
  const fmt = new Intl.NumberFormat(CURRENCIES[currency]?.locale ?? 'en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  const axis = (p) => fmt.format(p / 100 / (currency === 'INR' || !(rate > 0) ? 1 : rate));
  const shortDate = (d) => date(d).replace(/ \d{4}$/, '');
  const focus = hover ?? selected ?? null;
  const fw = focus != null ? base.weeks[focus] : null;
  const pick = (i) => onSelect?.(i);

  return (
    <figure>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className={cx('h-auto w-full select-none', !scenario && 'chart-reveal')} role="group" aria-label={t('forecast.chart')} onMouseLeave={() => setHover(null)}>
          <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0b6b66" stopOpacity="0.16" /><stop offset="1" stopColor="#0b6b66" stopOpacity="0" /></linearGradient></defs>
          {/* Zone below the safety buffer */}
          <rect x={P.l} y={y(base.buffer)} width={W - P.l - P.r} height={Math.max(0, y(min) - y(base.buffer))} fill="#c0262d" opacity="0.05" />
          {ticks.map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#8a94a6' : '#e6e8ec'} strokeWidth="1" />
              <text x={P.l - 8} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#8a94a6">{axis(v)}</text>
            </g>
          ))}
          <line x1={P.l} x2={W - P.r} y1={y(base.buffer)} y2={y(base.buffer)} stroke="#9a5b00" strokeDasharray="6 4" strokeWidth="1.5" />
          <text x={W - P.r - 4} y={y(base.buffer) - 6} fontSize="11" textAnchor="end" fill="#9a5b00">{t('forecast.buffer')} {axis(base.buffer)}</text>
          {fw && <rect x={x(focus) - colW / 2} y={P.t} width={colW} height={H - P.t - P.b} fill="#0f172a" opacity="0.04" />}
          <path d={`${line(base)} L${x(n - 1)},${y(min)} L${x(0)},${y(min)} Z`} fill={`url(#${gid})`} />
          <path d={line(base)} fill="none" stroke="#0b6b66" strokeWidth="2.5" strokeLinejoin="round" />
          {scenario && <path d={line(scenario)} fill="none" stroke="#6d3fd8" strokeWidth="2.5" strokeDasharray="8 5" strokeLinejoin="round" />}
          {base.weeks.map((w, i) => (
            <g key={w.index}>
              <circle cx={x(i)} cy={y(w.low)} r={focus === i ? 6 : w.breach ? 4.5 : 3} fill={w.breach ? '#c0262d' : '#0b6b66'} stroke="#fff" strokeWidth="1.5" />
              {(i % 2 === 0 || n <= 7) && <text x={x(i)} y={H - 12} fontSize="11" textAnchor="middle" fill={focus === i ? '#0f172a' : '#8a94a6'}>{shortDate(w.start)}</text>}
              <rect x={x(i) - colW / 2} y={P.t} width={colW} height={H - P.t - P.b} fill="transparent" className="cursor-pointer outline-none focus-visible:fill-[rgb(11_107_102/0.12)]"
                tabIndex={onSelect ? 0 : -1} role={onSelect ? 'button' : undefined} aria-pressed={onSelect ? selected === i : undefined}
                aria-label={`${t('common.week', { n: w.index })}, ${date(w.start)}: ${t('forecast.low')} ${money(w.low)}${w.breach ? `, ${t('forecast.shortfall')}` : ''}`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => pick(i)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } }} />
            </g>
          ))}
        </svg>
        {fw && hover != null && (
          <div className="pointer-events-none absolute top-1 z-10 w-48 rounded-xl border border-line bg-white p-2.5 text-xs shadow-[var(--shadow-pop)]"
            style={{ left: `clamp(0px, calc(${(x(focus) / W) * 100}% - 6rem), calc(100% - 12rem))` }}>
            <div className="font-semibold">{t('common.week', { n: fw.index })} · {shortDate(fw.start)} – {shortDate(fw.end)}</div>
            <div className="mt-1 flex justify-between"><span className="text-muted">{t('forecast.moneyIn')}</span><span className="num text-ok">+{money(fw.collections + fw.assumedSales)}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t('forecast.moneyOut')}</span><span className="num text-danger">−{money(fw.outflows)}</span></div>
            <div className="flex justify-between font-medium"><span>{t('forecast.low')}</span><span className={`num ${fw.breach ? 'text-danger' : ''}`}>{money(fw.low)}</span></div>
            {scenario && <div className="flex justify-between text-scenario"><span>{t('label.scenario')}</span><span className="num">{money(scenario.weeks[focus].low)}</span></div>}
          </div>
        )}
      </div>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span><span aria-hidden="true" className="mr-1.5 inline-block h-0.5 w-5 bg-brand align-middle" />{t('forecast.lineLabel')}</span>
        {scenario && <span><span aria-hidden="true" className="mr-1.5 inline-block w-5 border-t-2 border-dashed border-scenario align-middle" />{t('label.scenario')}</span>}
        <span><span aria-hidden="true" className="mr-1.5 inline-block w-5 border-t-2 border-dashed border-warn align-middle" />{t('forecast.buffer')} {money(base.buffer)}</span>
        <span><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-danger align-middle" />{t('forecast.shortfall')}</span>
      </figcaption>
    </figure>
  );
}

export function ScenarioPanel({ changes, setChanges, kinds = ['collect', 'partial', 'delay', 'promise', 'postpone', 'newOrder'] }) {
  const { t, state, today, forecast, money, date, customer, invoice } = useStore();
  const scenario = useScenario(changes);
  const openInv = state.invoices.filter((i) => isOpen(state, i) && !i.dispute);
  const [kind, setKind] = useState(kinds[0]);
  const [f, setF] = useState({ invoiceId: openInv[0]?.id ?? '', date: addDays(today, 3), amount: '', customerId: state.customers[0]?.id ?? '', occurrenceId: '', orderAmount: '200000', orderCollect: addDays(today, 50), orderCost: '80000', orderCostDate: addDays(today, 10) });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const supplierOcc = forecast.expenses.filter((e) => e.category === 'supplier');

  const add = () => {
    setErr(null);
    let ch;
    if (kind === 'collect') ch = { type: 'collect', invoiceId: f.invoiceId, date: f.date };
    else if (kind === 'partial') {
      const p = rupeesToPaise(f.amount);
      if (!p) return setErr(t('err.amount'));
      ch = { type: 'collect', invoiceId: f.invoiceId, date: f.date, amountPaise: p };
    } else if (kind === 'delay') ch = { type: 'delayCustomer', customerId: f.customerId, days: 30 };
    else if (kind === 'promise') ch = { type: 'promise', invoiceId: f.invoiceId, date: f.date };
    else if (kind === 'postpone') ch = { type: 'postponeExpense', occurrenceId: f.occurrenceId || supplierOcc[0]?.id, toDate: f.date };
    else {
      const a = rupeesToPaise(f.orderAmount); const c = rupeesToPaise(f.orderCost || '0');
      if (!a || c === null) return setErr(t('err.amount'));
      ch = { type: 'newOrder', amountPaise: a, collectDate: f.orderCollect, expensePaise: c, expenseDate: f.orderCostDate };
    }
    setChanges([...changes, ch]);
  };

  const label = (ch) => {
    if (ch.type === 'collect') { const i = invoice(ch.invoiceId); return t('scenario.ch.collect', { number: i.number, amount: money(ch.amountPaise ?? balanceOf(state, i)), date: date(ch.date) }); }
    if (ch.type === 'delayCustomer') return t('scenario.ch.delayCustomer', { customer: customer(ch.customerId).name, days: ch.days });
    if (ch.type === 'promise') return t('scenario.ch.promise', { number: invoice(ch.invoiceId).number, date: date(ch.date) });
    if (ch.type === 'postponeExpense') return t('scenario.ch.postponeExpense', { label: forecast.expenses.find((e) => e.id === ch.occurrenceId)?.label ?? '', date: date(ch.toDate) });
    return t('scenario.ch.newOrder', { amount: money(ch.amountPaise), date: date(ch.collectDate) });
  };

  const before = forecast.firstBreach?.gapPaise ?? 0;
  const after = scenario ? (scenario.firstBreach?.gapPaise ?? 0) : before;
  const needsInvoice = ['collect', 'partial', 'promise'].includes(kind);

  return (
    <Card title={t('scenario.title')} tone="scenario" hint={t('scenario.notRecorded')}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('common.status')}>{(p) => (
          <select {...p} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k} value={k}>{t({ collect: 'scenario.collect', partial: 'scenario.partial', delay: 'scenario.delay', promise: 'scenario.promise', postpone: 'scenario.postpone', newOrder: 'scenario.newOrder' }[k])}</option>)}
          </select>)}</Field>
        {needsInvoice && <Field label={t('scenario.invoice')}>{(p) => (
          <select {...p} className={inputCls} value={f.invoiceId} onChange={set('invoiceId')}>
            {openInv.map((i) => <option key={i.id} value={i.id}>{i.number} · {customer(i.customerId).name} · {money(balanceOf(state, i))}</option>)}
          </select>)}</Field>}
        {(needsInvoice || kind === 'postpone') && <Field label={kind === 'postpone' ? t('scenario.moveTo') : t('scenario.date')}>{(p) => <input {...p} type="date" className={inputCls} value={f.date} min={today} onChange={set('date')} />}</Field>}
        {kind === 'partial' && <Field label={t('scenario.amount')} error={err}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={f.amount} onChange={set('amount')} placeholder="25000" />}</Field>}
        {kind === 'delay' && <Field label={t('scenario.customer')}>{(p) => (
          <select {...p} className={inputCls} value={f.customerId} onChange={set('customerId')}>{state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>)}</Field>}
        {kind === 'postpone' && <Field label={t('scenario.expense')}>{(p) => (
          <select {...p} className={inputCls} value={f.occurrenceId || supplierOcc[0]?.id} onChange={set('occurrenceId')}>{supplierOcc.map((e) => <option key={e.id} value={e.id}>{e.label} · {date(e.date)} · {money(e.amountPaise)}</option>)}</select>)}</Field>}
        {kind === 'newOrder' && <>
          <Field label={t('scenario.orderAmount')} error={err}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={f.orderAmount} onChange={set('orderAmount')} />}</Field>
          <Field label={t('scenario.orderCollect')}>{(p) => <input {...p} type="date" className={inputCls} value={f.orderCollect} onChange={set('orderCollect')} />}</Field>
          <Field label={t('scenario.orderCost')}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={f.orderCost} onChange={set('orderCost')} />}</Field>
          <Field label={t('scenario.orderCostDate')}>{(p) => <input {...p} type="date" className={inputCls} value={f.orderCostDate} onChange={set('orderCostDate')} />}</Field>
        </>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="scenario" onClick={add}>{t('scenario.add')}</Button>
        {changes.length > 0 && <Button onClick={() => setChanges([])}>{t('scenario.clear')}</Button>}
      </div>
      {changes.length === 0 ? <p className="mt-3 text-sm text-scenario">{t('scenario.none')}</p> : (
        <div className="mt-4 space-y-3">
          <ul className="space-y-1 text-sm">{changes.map((c, i) => <li key={i}><Badge tone="scenario">{t('label.scenario')}</Badge> {label(c)}</li>)}</ul>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-3"><div className="text-sm text-muted">{t('scenario.gapBefore')}</div><Money paise={before} className="text-lg font-semibold" tone={before ? 'danger' : 'ok'} /></div>
            <div className="rounded-lg bg-white p-3"><div className="text-sm text-muted">{t('scenario.gapAfter')}</div><Money paise={after} className="text-lg font-semibold" tone={after ? 'danger' : 'ok'} /></div>
            <div className="rounded-lg bg-white p-3"><div className="text-sm text-muted">{t('scenario.firstBreachAfter')}</div><div className="text-lg font-semibold">{scenario.firstBreach ? date(scenario.firstBreach.date) : '—'}</div></div>
          </div>
          {forecast.firstBreach && !scenario.firstBreach && <Notice tone="ok">✓ {t('scenario.closed')}</Notice>}
          <ForecastChart base={forecast} scenario={scenario} />
        </div>
      )}
    </Card>
  );
}
