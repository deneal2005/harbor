import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
  BellRing, CalendarDays, ChartLine, Ellipsis, FileText, FolderOpen, Inbox, Landmark, LayoutDashboard, ListOrdered, Plus, Radar, Search, Settings, Users, X,
} from 'lucide-react';
import { useDisplayControls } from './displayControls.jsx';
import { useStore } from '../store-context.js';
import { cx } from '../utils/cx.js';
import { HarborMark } from './HarborMark.jsx';
import { SearchBox } from './Search.jsx';
import { CountMoney } from './ui.jsx';
import { isLowEndDevice } from '../utils/device.js';

const NAV = [
  ['nav.groupAct', [['/', 'nav.dashboard', LayoutDashboard], ['/radar', 'nav.radar', Radar], ['/forecast', 'nav.forecast', ChartLine], ['/follow-ups', 'nav.followups', BellRing], ['/inbox', 'nav.inbox', Inbox], ['/payments', 'nav.payments', Landmark]]],
  ['nav.groupRecords', [['/invoices', 'nav.invoices', FileText], ['/customers', 'nav.customers', Users], ['/documents', 'nav.documents', FolderOpen]]],
  ['nav.groupSetup', [['/escalation', 'nav.escalation', ListOrdered], ['/settings', 'nav.settings', Settings]]],
];
const TABS = [['/', 'nav.home', LayoutDashboard], ['/follow-ups', 'nav.tabFollowups', BellRing], ['/inbox', 'nav.inbox', Inbox], ['/payments', 'nav.payments', Landmark]];

function useCounts() {
  const { state, followUps } = useStore();
  return {
    '/follow-ups': followUps.due.length,
    '/inbox': state.inbox.filter((i) => i.status === 'pending').length,
    '/payments': state.bankTxns.filter((x) => x.status === 'pending').length,
  };
}

// One highlight that glides to the active item. Positioned on the element itself (transform only, so it
// runs on the compositor and never blocks the page change); no transition on the first placement.
function useSlidingPill() {
  const { pathname } = useLocation();
  const container = useRef(null);
  const pill = useRef(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const active = container.current?.querySelector('a[aria-current="page"]');
    const el = pill.current;
    if (!el) return;
    if (!active) { el.style.opacity = '0'; return; }
    el.style.transition = placed.current ? '' : 'none';
    el.style.opacity = '1';
    el.style.height = `${active.offsetHeight}px`;
    el.style.transform = `translateY(${active.offsetTop}px)`;
    placed.current = true;
  }, [pathname]);
  return [container, pill];
}

function Nav({ onNavigate }) {
  const { t } = useStore();
  const counts = useCounts();
  const [ref, pill] = useSlidingPill();
  return (
    <nav ref={ref} aria-label="Main" className="relative space-y-5">
      <span ref={pill} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 rounded-xl bg-white/[0.09] opacity-0 ring-1 ring-inset ring-white/[0.06] transition-[transform,height] duration-300 ease-[cubic-bezier(0.3,0.8,0.2,1)]" />
      {NAV.map(([group, items]) => (
        <div key={group}>
          <div className="px-3 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-white/40">{t(group)}</div>
          <ul className="space-y-0.5">
            {items.map(([to, key, Icon]) => (
              <li key={to}>
                <NavLink to={to} end onClick={onNavigate}
                  className={({ isActive }) => cx('group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.94rem] transition-colors', isActive ? 'font-semibold text-white' : 'text-white/70 hover:bg-white/[0.05] hover:text-white')}>
                  <Icon size={18} aria-hidden="true" className="relative shrink-0 opacity-90 transition-transform group-hover:scale-110" />
                  <span className="relative flex-1">{t(key)}</span>
                  {counts[to] > 0 && <span className="num relative rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">{counts[to]}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// Harbor brand: mark + Sora wordmark. The whole lockup links home (the dashboard).
// The dock-in intro plays once per page load (module flag set on mount), so later
// mounts of this Brand (the "More" sheet) show the settled mark, never a replay.
let brandDocked = false;

function Brand({ onNavigate }) {
  const { t, state, demo } = useStore();
  useEffect(() => { brandDocked = true; }, []);
  return (
    <Link to="/" onClick={onNavigate} title={t('nav.dashboard')}
      className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20">
      <HarborMark decorative dock={!brandDocked} className="h-9 w-9" />
      <div className="min-w-0">
        <div className="brand-word text-lg leading-tight text-white">HARBOR</div>
        <div className="truncate text-xs text-white/50">{state.business.name}{demo && ` · ${t('app.demoChip')}`}</div>
      </div>
    </Link>
  );
}

function DateChip({ compact }) {
  const { t, state, date } = useStore();
  return (
    <Link to="/settings" title={t('app.demoDate')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white px-2 text-sm font-medium shadow-[var(--shadow-card)] hover:border-ink/20">
      <CalendarDays size={16} className="text-faint" aria-hidden="true" />
      <span className={compact ? 'sr-only' : 'hidden text-muted sm:inline'}>{t('app.demoDate')}</span>
      <span className="num">{date(state.settings.demoDate)}</span>
    </Link>
  );
}

function SampleChip() {
  const { t, demo } = useStore();
  if (!demo) return null;
  return <span title={t('app.sample')} className="hidden items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn ring-1 ring-inset ring-warn/20 md:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{t('app.demoChip')}</span>;
}

// After a payment, promise or dispute: the projected shortfall rolls from its old to its new value,
// a bar shrinks or grows with it, and a thin line shows how long the notice stays.
function OutlookNotice({ o }) {
  const { t, money, dismissOutlook } = useStore();
  const [target, setTarget] = useState(o.from);
  useEffect(() => { const id = requestAnimationFrame(() => setTarget(o.to)); return () => cancelAnimationFrame(id); }, [o.to]);
  const better = o.to < o.from;
  const max = Math.max(o.from, o.to, 1);
  return (
    <div role="status" aria-live="polite" className="animate-pop no-print fixed inset-x-4 top-20 z-50 mx-auto max-w-sm overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-pop)]">
      <div className="flex items-start gap-3 p-4">
        <span className={cx('mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', better ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}><ChartLine size={18} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t('app.outlookTitle')}</div>
          <div className="text-xs text-muted">{o.to === 0 ? t('app.outlookNone') : t('app.outlookGap')}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <CountMoney paise={target} className={cx('text-2xl font-semibold tracking-tight', o.to === 0 ? 'text-ok' : better ? 'text-ink' : 'text-danger')} />
            {o.from > 0 && <span className="num text-xs text-faint line-through">{money(o.from)}</span>}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
            <div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', better ? 'bg-ok' : 'bg-danger')} style={{ width: `${(target / max) * 100}%` }} />
          </div>
          <Link to="/forecast" onClick={dismissOutlook} className="mt-2 inline-block text-sm font-medium text-brand hover:underline">{t('app.outlookSee')}</Link>
        </div>
        <button type="button" onClick={dismissOutlook} aria-label={t('app.close')} className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-paper"><X size={16} aria-hidden="true" /></button>
      </div>
      <div aria-hidden="true" className="animate-drain h-0.5 origin-left bg-brand/60" />
    </div>
  );
}

export default function Layout() {
  const { t, storageOk, toast, outlook, currency, rate, importable, finishImport } = useStore();
  const controls = useDisplayControls();
  const counts = useCounts();
  const lowEnd = isLowEndDevice(); // the Animations switch is only offered on low-powered devices
  // The sheet is keyed by the pathname at the moment it was opened, so it
  // closes itself on back/forward navigation without an effect's setState.
  const [more, setMore] = useState(null);
  const loc = useLocation();
  // Mobile tab bar: one indicator slides between the five slots (transform only).
  const tabIndex = TABS.findIndex(([to]) => to === loc.pathname);
  const moreOpen = more === loc.pathname;
  // Mobile search row, keyed by pathname like the "More" sheet so navigation closes it.
  const [searchAt, setSearchAt] = useState(null);
  const searching = searchAt === loc.pathname;
  useEffect(() => {
    window.scrollTo(0, 0);
    // Screens seen this session, for the dashboard's demo checklist.
    try {
      const seen = new Set(JSON.parse(sessionStorage.getItem('harbor:visited') || '[]'));
      seen.add(loc.pathname);
      sessionStorage.setItem('harbor:visited', JSON.stringify([...seen]));
    } catch { /* storage blocked: the checklist just ticks fewer steps */ }
  }, [loc.pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setMore(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">{t('app.skip')}</a>

      <aside className="no-print hidden bg-night px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto">
        <Brand />
        <div className="mt-7 flex-1"><Nav /></div>
        <div className="mt-6 space-y-3 rounded-2xl bg-white/[0.04] p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-white/50">{t('app.currency')}</span>{controls.currency({ dark: true })}</div>
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-white/50">{t('app.language')}</span>{controls.language({ dark: true })}</div>
          {lowEnd && <div className="flex items-center justify-between gap-2"><span className="text-xs text-white/50">{t('set.motion')}</span>{controls.motion({ dark: true })}</div>}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <Link to="/" title={t('nav.dashboard')}
                className="inline-flex items-center gap-2 rounded-xl text-[#0F2D3F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-inset">
                <HarborMark decorative dock={!brandDocked} className="h-8 w-8" />
                <span className="brand-word hidden min-[400px]:inline text-sm">HARBOR</span>
              </Link>
              <div className="ml-1">{controls.language({ size: 'sm' })}</div>
            </div>
            <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
              <SearchBox className="w-full max-w-sm" />
              <SampleChip />
              {currency !== 'INR' && rate > 0 && <span className="truncate text-xs text-muted">{t('app.showingIn', { code: currency, rate })}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSearchAt(searching ? null : loc.pathname)} aria-expanded={searching} aria-label={t('search.label')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-muted shadow-[var(--shadow-card)] lg:hidden"><Search size={18} aria-hidden="true" /></button>
              <DateChip compact />
              <Link to="/invoices/new" aria-label={t('nav.newInvoice')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-medium text-white shadow-sm hover:bg-ink/90 sm:px-3.5"><Plus size={16} aria-hidden="true" /><span className="hidden sm:inline">{t('nav.newInvoice')}</span></Link>
            </div>
          </div>
          {searching && <div className="px-4 pb-3 lg:hidden"><SearchBox autoFocus onDone={() => setSearchAt(null)} /></div>}
        </header>
        {!storageOk && <div role="alert" className="no-print bg-danger px-4 py-2 text-sm text-white">{t('app.storageFail')}</div>}
        {importable && (
          <div role="status" className="no-print flex flex-wrap items-center gap-3 bg-brand-soft px-4 py-2 text-sm">
            <span>{t('app.importOffer', { n: importable.invoices.length })}</span>
            <button type="button" onClick={() => finishImport(true)} className="min-h-10 rounded-lg bg-brand px-3 font-medium text-white">{t('app.importYes')}</button>
            <button type="button" onClick={() => finishImport(false)} className="min-h-10 rounded-lg px-3 font-medium">{t('app.importNo')}</button>
          </div>
        )}
        <main id="main" tabIndex={-1} key={loc.pathname}><Outlet /></main>
      </div>

      {/* Mobile: primary destinations one tap away, everything else in "More". */}
      <nav aria-label="Quick" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <span aria-hidden="true" className={cx('pointer-events-none absolute left-0 top-0 flex w-1/5 justify-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.3,0.8,0.2,1)]', tabIndex < 0 && 'opacity-0')}
          style={{ transform: `translateX(${Math.max(0, tabIndex) * 100}%)` }}><span className="h-[3px] w-10 rounded-b-full bg-brand" /></span>
        <ul className="grid grid-cols-5">
          {TABS.map(([to, key, Icon]) => (
            <li key={to}>
              <NavLink to={to} end className={({ isActive }) => cx('relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem] font-medium leading-tight transition-colors', isActive ? 'text-brand' : 'text-muted')}>
                {({ isActive }) => (<>
                  <Icon size={21} aria-hidden="true" className={cx('transition-transform', isActive && '-translate-y-0.5')} />
                  <span className="line-clamp-1 text-center">{t(key)}</span>
                  {counts[to] > 0 && <span className="num absolute right-[22%] top-2 rounded-full bg-danger px-1.5 text-[0.65rem] font-semibold text-white">{counts[to]}</span>}
                </>)}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMore(loc.pathname)} aria-expanded={moreOpen} className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium text-muted">
              <Ellipsis size={21} aria-hidden="true" /><span>{t('nav.more')}</span>
            </button>
          </li>
        </ul>
      </nav>
      {moreOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
          <div className="animate-fade absolute inset-0 bg-night/50 backdrop-blur-[2px]" onClick={() => setMore(null)} />
          <div className="animate-rise absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-night px-4 pb-8 pt-4">
            <div className="mb-5 flex items-center justify-between"><Brand onNavigate={() => setMore(null)} /><button type="button" onClick={() => setMore(null)} aria-label={t('app.close')} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10"><X size={20} /></button></div>
            <Nav onNavigate={() => setMore(null)} />
            <div className="mt-6 space-y-3 rounded-2xl bg-white/[0.05] p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm text-white/60">{t('app.currency')}</span>{controls.currency({ dark: true })}</div>
              <div className="flex items-center justify-between gap-2"><span className="text-sm text-white/60">{t('app.language')}</span>{controls.language({ dark: true })}</div>
              {lowEnd && <div className="flex items-center justify-between gap-2"><span className="text-sm text-white/60">{t('set.motion')}</span>{controls.motion({ dark: true })}</div>}
              <p className="text-xs leading-snug text-white/50">{t('app.sample')}</p>
            </div>
          </div>
        </div>
      )}

      {outlook && <OutlookNotice key={outlook.id} o={outlook} />}
      {toast && (
        <div key={toast.id} role="status" aria-live="polite" className={cx('animate-rise no-print fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm text-white shadow-[var(--shadow-pop)] lg:bottom-6', toast.tone === 'error' ? 'bg-danger' : 'bg-night')}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
