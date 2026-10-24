import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { TrailList } from '../components/Trail.jsx';
import { BellRing, CalendarClock, Check, Clock, Copy, Flag, HandCoins, Mail, MessageCircle, PauseCircle, Smartphone } from 'lucide-react';
import { Badge, Button, Card, Disclosure, Dialog, Empty, Field, Money, Notice, Page, Segmented, inputCls } from '../components/ui.jsx';
import { useErrorText } from '../hooks/useErrorText.js';
import { appUrl } from '../utils/appUrl.js';
import { logPrepared, markSent, raiseDispute, recordPromise, snooze } from '../services/actions.js';
import { balanceOf } from '../services/invoices.js';
import { prepareMessage } from '../services/reminders.js';
import { useStore } from '../store-context.js';
import { addDays } from '../utils/dates.js';

const digits = (phone) => phone.replace(/\D/g, '');

function FollowUpCard({ inv, ladder }) {
  const { t, state, today, run, notify, date, customer } = useStore();
  const errText = useErrorText();
  const c = customer(inv.customerId);
  const [lang, setLang] = useState(c.language === 'hi' ? 'hi' : 'en');
  const [channel, setChannel] = useState('whatsapp');
  const [promiseDate, setPromiseDate] = useState(addDays(today, 7));
  const [snoozeDate, setSnoozeDate] = useState(addDays(today, 2));
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const stage = ladder.dueStage;
  const tplKey = state.settings.ladder.find((s) => s.id === stage.id)?.template ?? stage.template;
  const message = prepareMessage(state, inv, tplKey, lang, appUrl());
  const links = {
    whatsapp: `https://wa.me/${digits(c.phone)}?text=${encodeURIComponent(message)}`,
    email: `mailto:${c.email}?subject=${encodeURIComponent(`${state.business.name} — ${inv.number}`)}&body=${encodeURIComponent(message)}`,
    sms: `sms:${digits(c.phone)}?body=${encodeURIComponent(message)}`,
  };
  const act = (r, ok) => { const m = errText(r); setError(m); if (!m && ok) notify(ok); return !m; };
  const offsetText = stage.offset < 0 ? t('fu.before', { n: -stage.offset }) : stage.offset > 0 ? t('fu.after', { n: stage.offset }) : t('fu.on');

  const dialogs = {
    promise: { title: t('fu.promise'), field: <Field label={t('fu.promiseDate')}>{(p) => <input {...p} type="date" min={today} className={inputCls} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />}</Field>,
      run: () => run(recordPromise, inv.id, promiseDate, ''), variant: 'primary' },
    snooze: { title: t('fu.snooze'), field: <Field label={t('fu.snoozeUntil')}>{(p) => <input {...p} type="date" min={today} className={inputCls} value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} />}</Field>,
      run: () => run(snooze, inv.id, snoozeDate), variant: 'primary' },
    dispute: { title: t('fu.dispute'), field: <Field label={t('fu.disputeReason')}>{(p) => <textarea {...p} rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>,
      run: () => run(raiseDispute, inv.id, reason, 'owner'), variant: 'danger' },
  };
  const d = dialogs[dialog];
  const ICONS = { whatsapp: MessageCircle, email: Mail, sms: Smartphone };

  return (
    <article id={inv.id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.name}</span><Badge tone={stage.offset >= 15 ? 'danger' : stage.offset > 0 ? 'warn' : 'brand'} dot>{t(`stage.${stage.id}`)}</Badge>
            {ladder.promiseBroken && <Badge tone="danger">{t('fu.promiseBroken')}</Badge>}</div>
          <div className="mt-0.5 text-sm text-muted"><Link to={`/invoices/${inv.id}`} className="hover:underline">{inv.number}</Link> · {t('common.dueDate')} {date(inv.dueDate)} · {ladder.daysRel > 0 ? t('common.daysOverdue', { n: ladder.daysRel }) : ladder.daysRel === 0 ? t('common.dueToday') : t('common.dueIn', { n: -ladder.daysRel })}</div>
        </div>
        <Money paise={balanceOf(state, inv)} className="text-xl font-semibold" />
      </div>
      <div className="space-y-3 px-4 pb-4 sm:px-5">
        <p className="text-sm text-muted"><span className="font-medium text-ink">{t('fu.why')}:</span> {t('fu.whyText', { stage: t(`stage.${stage.id}`), offset: offsetText })}
          {stage.id === 'final' && ` ${t('fu.call')}`}{stage.id === 'demand' && ` ${t('fu.demandSuggest')}`}{stage.id === 'review' && ` ${t('fu.reviewSuggest')}`}
          {stage.id === 'review' && state.business.udyam?.registered && ['micro', 'small'].includes(state.business.udyam.category) && ` ${t('fu.reviewMsme')}`}</p>
        <div className="rounded-xl bg-paper p-3.5 ring-1 ring-inset ring-line">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-faint">{t('fu.message', { lang: lang === 'hi' ? 'हिंदी' : 'English' })}</span>
            <Segmented size="sm" label={t('app.language')} value={lang} onChange={setLang} options={[{ value: 'en', label: 'English', short: 'EN' }, { value: 'hi', label: 'हिंदी', short: 'हि' }]} />
          </div>
          <p className="whitespace-pre-wrap text-[0.94rem] leading-relaxed" lang={lang}>{message}</p>
        </div>
        {/* One clear primary action: open WhatsApp with the prepared message.
            Opening any channel logs "prepared" — nothing is sent from Harbor. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <a href={links.whatsapp} target="_blank" rel="noreferrer"
            onClick={() => { setChannel('whatsapp'); run(logPrepared, inv.id, stage.id, 'whatsapp'); notify(t('fu.prepared', { channel: t('channel.whatsapp') })); }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[0.95rem] font-medium text-white shadow-[var(--shadow-card)] hover:bg-brand/90 sm:w-auto"><MessageCircle size={17} aria-hidden="true" />{t('fu.whatsapp')}</a>
          {['email', 'sms'].map((ch) => {
            const Icon = ICONS[ch];
            return (
              <a key={ch} href={links[ch]} rel="noreferrer"
                onClick={() => { setChannel(ch); run(logPrepared, inv.id, stage.id, ch); notify(t('fu.prepared', { channel: t(`channel.${ch}`) })); }}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[0.95rem] font-medium shadow-[var(--shadow-card)] hover:bg-paper"><Icon size={17} aria-hidden="true" />{t(`fu.${ch}`)}</a>
            );
          })}
          <Button icon={Copy} onClick={() => navigator.clipboard?.writeText(message).then(() => notify(t('fu.copied')))}>{t('fu.copy')}</Button>
        </div>
      </div>
      <div className="border-t border-line bg-paper/60 px-4 py-3 sm:px-5">
        <p className="text-xs font-medium text-muted">{t('fu.confirmStrip')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Segmented size="sm" label={t('inv.method')} value={channel} onChange={setChannel} options={['whatsapp', 'email', 'sms', 'call'].map((ch) => ({ value: ch, label: t(`channel.${ch}`) }))} />
          <Button variant="primary" icon={Check} onClick={() => act(run(markSent, inv.id, stage.id, channel), t('fu.sentOk', { stage: t(`stage.${stage.id}`) }))}>{t('fu.markSent')}</Button>
        </div>
        <p className="mt-2 w-full text-xs text-muted">{t('fu.markSentHint')}</p>
        {/* Secondary actions stay grouped so mobile users face one decision at a time. */}
        <Disclosure summary={t('fu.more')} className="mt-3">
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" icon={HandCoins} onClick={() => setDialog('promise')}>{t('fu.promise')}</Button>
            <Button variant="ghost" icon={Clock} onClick={() => setDialog('snooze')}>{t('fu.snooze')}</Button>
            <Button variant="ghost" icon={Flag} onClick={() => setDialog('dispute')}>{t('fu.dispute')}</Button>
          </div>
        </Disclosure>
      </div>
      {error && !d && <Notice tone="danger" className="m-4 mt-0">{error}</Notice>}
      <Dialog open={!!d} onClose={() => { setDialog(null); setError(null); }} title={d?.title ?? ''}
        footer={<><Button onClick={() => { setDialog(null); setError(null); }}>{t('common.cancel')}</Button><Button variant={d?.variant} onClick={() => act(d.run(), t('common.saved')) && setDialog(null)}>{t('common.save')}</Button></>}>
        <p className="text-sm text-muted">{c.name} · {inv.number}</p>
        {d?.field}
        {error && <Notice tone="danger">{error}</Notice>}
      </Dialog>
    </article>
  );
}

export default function FollowUps() {
  const { t, state, today, followUps, date, customer, money } = useStore();
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }); }, [hash]);
  const history = state.trail.filter((e) => ['reminder-prepared', 'reminder-sent', 'promise', 'snoozed', 'dispute-raised', 'stage-reset'].includes(e.type)).reverse().slice(0, 15);
  const pausedLabel = ({ inv, ladder }) => t(`fu.pausedReason.${ladder.paused}`, { date: date(ladder.paused === 'promise' ? inv.promise.date : inv.snoozedUntil) });

  return (
    <Page title={t('fu.title')} subtitle={t('fu.subtitle', { date: date(today) })}>
      <section aria-labelledby="due-h" className="space-y-3">
        <h2 id="due-h" className="text-xl font-semibold">{t('fu.due')} ({followUps.due.length})</h2>
        {followUps.due.length === 0 ? <Empty>{t('fu.none')}</Empty> : followUps.due.map((f) => <FollowUpCard key={f.inv.id} {...f} />)}
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <Card icon={PauseCircle} title={`${t('fu.paused')} (${followUps.paused.length})`}>
          {followUps.paused.length === 0 ? <Empty>{t('fu.nonePaused')}</Empty> : (
            <ul className="space-y-2">{followUps.paused.map((f) => (
              <li key={f.inv.id}><Link to={`/invoices/${f.inv.id}`} className="flex flex-wrap justify-between gap-2 rounded-lg border border-line p-3 hover:border-brand">
                <span>{f.inv.number} · {customer(f.inv.customerId).name}<span className="block text-sm text-muted">⏸ {pausedLabel(f)}</span></span>
                <Money paise={balanceOf(state, f.inv)} />
              </Link></li>))}</ul>
          )}
        </Card>
        <Card icon={CalendarClock} title={t('fu.upcoming')}>
          {followUps.upcoming.length === 0 ? <Empty>{t('fu.noneUpcoming')}</Empty> : (
            <ul className="space-y-2">{followUps.upcoming.map(({ inv, ladder }) => (
              <li key={inv.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-line p-3 text-sm">
                <span>{inv.number} · {customer(inv.customerId).name}<span className="block text-muted">{t('fu.next', { stage: t(`stage.${ladder.next.id}`), date: date(ladder.nextDate) })}</span></span>
                <span className="num">{money(balanceOf(state, inv))}</span>
              </li>))}</ul>
          )}
        </Card>
      </div>
      <Card icon={BellRing} title={t('fu.history')}><TrailList events={history} showInvoice /></Card>
    </Page>
  );
}
