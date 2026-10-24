import { Component, Suspense, lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import RequireSession from './components/RequireSession.jsx';
import Login from './pages/Login.jsx';
import { ButtonLink, Page } from './components/ui.jsx';
import { useStore } from './store-context.js';
import Dashboard from './pages/Dashboard.jsx';

// Route pages load on demand. Only the home page (and the shared shell) stays
// in the entry bundle so the first paint is immediate. The print pages are
// named exports of one module, so their import() maps `default` to each export.
const Radar = lazy(() => import('./pages/Radar.jsx'));
const Forecast = lazy(() => import('./pages/Forecast.jsx'));
const FollowUps = lazy(() => import('./pages/FollowUps.jsx'));
const Invoices = lazy(() => import('./pages/Invoices.jsx'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail.jsx'));
const NewInvoice = lazy(() => import('./pages/NewInvoice.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Inbox = lazy(() => import('./pages/Inbox.jsx'));
const Payments = lazy(() => import('./pages/Payments.jsx'));
const Documents = lazy(() => import('./pages/Documents.jsx'));
const Escalation = lazy(() => import('./pages/Escalation.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const CustomerPay = lazy(() => import('./pages/CustomerPay.jsx'));
const PrintInvoice = lazy(() => import('./pages/Print.jsx').then((m) => ({ default: m.PrintInvoice })));
const PrintLetter = lazy(() => import('./pages/Print.jsx').then((m) => ({ default: m.PrintLetter })));
const PrintPack = lazy(() => import('./pages/Print.jsx').then((m) => ({ default: m.PrintPack })));

// Fetch the main screens in the background once the app is idle, so a first visit never waits on the
// network (same import() calls as above, so the browser reuses the downloaded chunks).
const PREFETCH = [() => import('./pages/Radar.jsx'), () => import('./pages/Forecast.jsx'), () => import('./pages/FollowUps.jsx'), () => import('./pages/Invoices.jsx'),
  () => import('./pages/InvoiceDetail.jsx'), () => import('./pages/Customers.jsx'), () => import('./pages/Inbox.jsx'), () => import('./pages/Payments.jsx'), () => import('./pages/NewInvoice.jsx')];

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    const t = this.props.t;
    // Never clears saved data: the owner decides what to do.
    return (
      <div className="mx-auto max-w-xl p-6" role="alert">
        <h1 className="text-2xl font-semibold">{t('err.boundaryTitle')}</h1>
        <p className="mt-2 text-muted">{t('err.boundaryBody')}</p>
        <a href={import.meta.env.BASE_URL} className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-brand px-4 text-white">{t('err.home')}</a>
      </div>
    );
  }
}

function Recovery() {
  const { t, recovery, reset } = useStore();
  const download = () => {
    const url = URL.createObjectURL(new Blob([recovery.raw ?? ''], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'harbor-saved-data.json' }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="mx-auto max-w-xl p-6" role="alert">
      <h1 className="text-2xl font-semibold">{t('err.recoverTitle')}</h1>
      <p className="mt-2 text-muted">{t('err.recoverBody', { problem: recovery.problem || recovery.status })}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={download} className="min-h-12 rounded-lg border border-line bg-white px-4">{t('err.download')}</button>
        <button type="button" onClick={reset} className="min-h-12 rounded-lg bg-brand px-4 text-white">{t('err.startFresh')}</button>
      </div>
    </div>
  );
}

function NotFound() {
  const { t } = useStore();
  return <Page title={t('common.notFound')} subtitle={t('err.404')}><ButtonLink to="/" variant="primary">{t('err.home')}</ButtonLink></Page>;
}

// Suspense fallback while a route chunk loads. Mirrors the app's page shell so
// the switch to the real screen is steady; announced politely to screen readers.
function PageSkeleton({ label }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
      <span className="sr-only">{label}</span>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="h-9 w-64 max-w-full animate-pulse rounded-xl bg-ink/8" />
        <div className="h-10 w-36 animate-pulse rounded-xl bg-ink/8" />
      </div>
      <div className="space-y-4">
        <div className="h-36 w-full animate-pulse rounded-2xl bg-ink/8" />
        <div className="h-36 w-full animate-pulse rounded-2xl bg-ink/8" />
        <div className="h-20 w-full animate-pulse rounded-2xl bg-ink/8" />
      </div>
    </div>
  );
}

export default function App() {
  const { state, t } = useStore();
  useEffect(() => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
    idle(() => PREFETCH.forEach((load) => load().catch(() => {})));
  }, []);
  if (!state) return <Recovery />;
  return (
    <ErrorBoundary t={t}>
      <Suspense fallback={<PageSkeleton label={t('common.loading')} />}>
        <Routes>
        {/* The signed gate is public: first run creates the device key, later visits sign in.
            Customer routes stay open without a session. */}
        <Route path="/login" element={<Login />} />
        <Route path="/pay/:token" element={<CustomerPay />} />
        <Route path="/print/invoice/:id" element={<PrintInvoice />} />
        <Route path="/print/letter/:customerId" element={<PrintLetter />} />
        <Route path="/print/pack/:id" element={<PrintPack />} />
        <Route element={<RequireSession><Layout /></RequireSession>}>
          <Route index element={<Dashboard />} />
          <Route path="radar" element={<Radar />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="follow-ups" element={<FollowUps />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/new" element={<NewInvoice />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="invoices/:id/edit" element={<NewInvoice />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<Customers />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="payments" element={<Payments />} />
          <Route path="documents" element={<Documents />} />
          <Route path="escalation" element={<Escalation />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
