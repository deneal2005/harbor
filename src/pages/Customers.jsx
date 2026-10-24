import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Search, UserPlus } from 'lucide-react';
import { CustomerDialog } from '../components/CustomerForm.jsx';
import { Badge, Button, ButtonLink, Card, Empty, Money, Page, StatusBadge, Tip, inputCls } from '../components/ui.jsx';
import { FORECAST } from '../data/config.js';
import { customerMetrics } from '../services/customerMetrics.js';
import { balanceOf, daysOverdue, isOpen, statusOf } from '../services/invoices.js';
import { useStore } from '../store-context.js';

function GradeBadge({ m }) {
  const { t } = useStore();
  if (!m.enoughHistory) return <Badge tone="muted">{t('cust.noHistory')}</Badge>;
  return <Badge tone={m.grade === 'A' ? 'ok' : m.grade === 'B' ? 'warn' : 'danger'}>{t('cust.grade', { grade: m.grade })}</Badge>;
}

const gradeText = (t, m) => (m.enoughHistory ? t(`cust.grade.${m.grade}`, { onTime: m.onTimeRate, delay: m.avgDelay }) : t('cust.grade.none', { count: m.count, min: FORECAST.minHistory }));

function Detail({ c }) {
  const { t, state, today, forecast, date, money } = useStore();
  const m = customerMetrics(state, c.id);
  const invs = state.invoices.filter((i) => i.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const next = forecast.collections.filter((x) => x.customerId === c.id).sort((a, b) => a.date.localeCompare(b.date))[0];
  const credit = state.credits.filter((x) => x.customerId === c.id).reduce((a, x) => a + x.amountPaise, 0);
  return (
    <Page title={c.name} subtitle={c.gstin ? `GSTIN ${c.gstin}` : t('new.unregistered')} actions={<><ButtonLink to="/customers">{t('common.back')}</ButtonLink><ButtonLink to={`/invoices/new?customer=${c.id}`} variant="primary">{t('nav.newInvoice')}</ButtonLink></>}>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('cust.outstanding')}</div><Money paise={m.outstandingPaise} className="text-xl font-semibold" /></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('cust.avgDelay')}</div><div className="text-xl font-semibold">{m.enoughHistory ? t('common.days', { n: m.avgDelay }) : '—'}</div></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('cust.onTime')}</div><div className="text-xl font-semibold">{m.enoughHistory ? `${m.onTimeRate}%` : '—'}</div></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"><div className="text-sm text-muted">{t('cust.nextExpected')}</div><div className="text-xl font-semibold">{next ? date(next.date) : '—'}</div>{next && <div className="text-sm text-muted">{money(next.amountPaise)}</div>}</div>
      </div>
      <Card title={<span className="flex items-center gap-2"><GradeBadge m={m} /><Tip text={t('cust.gradeTip')} /></span>}>
        <p>{gradeText(t, m)}</p>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">{t('cust.contact')}: </dt><dd className="inline">{[c.contactName, c.phone, c.email].filter(Boolean).join(' · ') || '—'}</dd></div>
          <div><dt className="inline text-muted">{t('cust.credit')}: </dt><dd className="inline">{t('common.days', { n: c.creditDays })}</dd></div>
          <div><dt className="inline text-muted">{t('cust.state', { code: c.stateCode })}</dt><dd className="inline">{c.stateCode !== state.business.stateCode ? ` · ${t('cust.otherState')}` : ''}</dd></div>
          <div><dt className="inline text-muted">{t('cust.language')}: </dt><dd className="inline">{c.language === 'hi' ? 'हिंदी' : 'English'}</dd></div>
          <div><dt className="inline text-muted">{t('cust.disputes')}: </dt><dd className="inline">{invs.filter((i) => i.dispute).length}</dd></div>
          {credit > 0 && <div><dd>{t('cust.credits', { amount: money(credit) })}</dd></div>}
        </dl>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('cust.invoices')}>
          <ul className="divide-y divide-line">
            {invs.map((i) => (
              <li key={i.id}><Link to={`/invoices/${i.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{i.number || t('status.draft')} · {date(i.dueDate)}</span>
                <span className="flex items-center gap-2"><Money paise={isOpen(state, i) ? balanceOf(state, i) : i.totalPaise} /><StatusBadge status={statusOf(state, i, today)} /></span>
              </Link></li>
            ))}
          </ul>
        </Card>
        <Card title={t('cust.history')}>
          <ul className="divide-y divide-line text-sm">
            {[...m.settlements].reverse().map((s) => (
              <li key={s.number} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{s.number} · {t('common.dueDate')} {date(s.dueDate)} → {date(s.paidDate)}</span>
                <Badge tone={s.delay > FORECAST.onTimeGraceDays ? 'warn' : 'ok'}>{s.delay > 0 ? t('cust.paidLate', { n: s.delay }) : s.delay < 0 ? t('cust.paidEarly', { n: -s.delay }) : t('cust.paidOnTime')}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

export default function Customers() {
  const { id } = useParams();
  const { t, state, today, forecast, customer, date } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  if (id) {
    const c = customer(id);
    return c ? <Detail c={c} /> : <Page title={t('common.notFound')}><ButtonLink to="/customers">{t('common.back')}</ButtonLink></Page>;
  }
  // Who owes the most first: the list doubles as a receivables-by-customer report.
  const rows = state.customers.map((c) => {
    const open = state.invoices.filter((i) => i.customerId === c.id && isOpen(state, i));
    const overdue = open.filter((i) => daysOverdue(i, today) > 0).reduce((a, i) => a + balanceOf(state, i), 0);
    const next = forecast.collections.filter((x) => x.customerId === c.id).sort((a, b) => a.date.localeCompare(b.date))[0];
    return { c, m: customerMetrics(state, c.id), openCount: open.length, overdue, next };
  }).filter(({ c }) => !q || `${c.name} ${c.contactName} ${c.gstin} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.m.outstandingPaise - a.m.outstandingPaise || a.c.name.localeCompare(b.c.name));
  const total = rows.reduce((a, r) => a + r.m.outstandingPaise, 0);
  return (
    <Page title={t('cust.title')} subtitle={t('cust.subtitle', { n: state.customers.length })}
      actions={<Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>{t('cust.add')}</Button>}>
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">{t('search.customers')}</span>
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input type="search" className={`${inputCls} pl-10`} placeholder={t('search.customers')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="text-sm text-muted">{t('cust.totalOwed')} <Money paise={total} className="font-semibold text-ink" /></div>
        </div>
        {rows.length === 0 ? <div className="px-5 pb-5"><Empty>{t('search.none')}</Empty></div> : (
          <ul className="divide-y divide-line border-t border-line">
            {rows.map(({ c, m, openCount, overdue, next }) => (
              <li key={c.id}>
                <Link to={`/customers/${c.id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-paper sm:grid-cols-[1fr_auto] sm:px-5 md:grid-cols-[1.4fr_1fr_auto]">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.name}</span><GradeBadge m={m} /></span>
                    <span className="block truncate text-sm text-muted">{[c.contactName, c.phone].filter(Boolean).join(' · ') || (c.gstin ? `GSTIN ${c.gstin}` : t('new.unregistered'))}</span>
                  </span>
                  <span className="hidden text-sm text-muted md:block">{next ? t('cust.nextOn', { date: date(next.date) }) : openCount ? t('cust.heldOut') : '—'}</span>
                  <span className="text-left sm:text-right">
                    <Money paise={m.outstandingPaise} className="font-semibold" />
                    <span className="block text-sm text-muted">{openCount ? t('dash.openCount', { n: openCount }) : t('cust.settled')}{overdue > 0 && <span className="text-danger"> · <Money paise={overdue} /> {t('dash.overdue').toLowerCase()}</span>}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CustomerDialog open={adding} onClose={() => setAdding(false)} onCreated={(c) => navigate(`/customers/${c.id}`)} />
    </Page>
  );
}
