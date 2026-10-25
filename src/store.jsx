import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motionEnabled } from './utils/device.js';
import { Ctx } from './store-context.js';
import { makeT } from './i18n/translate.js';
import * as actions from './services/actions.js';
import { buildForecast, collectionWindows } from './services/forecasting.js';
import { rankInvoices } from './services/priorityEngine.js';
import { followUps } from './services/reminders.js';
import { api, checkSession, getSessionSnapshot, sessionLost, subscribeSession } from './services/session.js';
import { loadState } from './services/storage.js';
import { formatDate } from './utils/dates.js';
import { formatMoney } from './utils/money.js';
import { DEFAULT_FX } from './data/config.js';

const gapOf = (s) => buildForecast(s, s.settings.demoDate).firstBreach?.gapPaise ?? 0;
// Export names survive minification; function names do not.
const NAMES = new Map(Object.entries(actions).map(([name, fn]) => [fn, name]));
const IMPORT_DONE_KEY = 'harbor.importDone';
const isEmptyLedger = (s) => ['customers', 'invoices', 'payments', 'bankTxns'].every((k) => s[k].length === 0);

// Data saved in this browser before accounts existed, offered once for import into an empty ledger.
function localLedger() {
  try {
    if (localStorage.getItem(IMPORT_DONE_KEY)) return null;
  } catch {
    return null;
  }
  const { state, status } = loadState();
  return status === 'loaded' ? state : null;
}

export function StoreProvider({ children }) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  // Tagged with the owner it belongs to, so one owner's books never show under another's sign-in.
  const [loaded, setLoaded] = useState({ email: null, state: null });
  const state = session.signedIn && loaded.email === session.email ? loaded.state : null;
  const [storageOk, setStorageOk] = useState(true);
  const [importable, setImportable] = useState(null);
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const stateRef = useRef(state);
  // The server's copy and version. The browser shows its own copy while actions are in flight,
  // then always settles on the server's.
  const server = useRef({ state: null, version: null });
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const failed = useRef(false);

  const notify = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const show = useCallback((s) => {
    stateRef.current = s;
    setLoaded({ email: getSessionSnapshot().email, state: s });
  }, []);

  useEffect(() => { checkSession(); }, []);

  const load = useCallback(async () => {
    const r = await api('/api/state');
    if (r.status === 401) return sessionLost();
    if (r.status !== 200) return setStorageOk(false);
    // Never overwrite changes that are still on their way to the server.
    if (pending.current > 0) return;
    server.current = { state: r.body.state, version: r.body.version };
    show(r.body.state);
    setImportable(isEmptyLedger(r.body.state) ? localLedger() : null);
  }, [show]);

  // Signed in: load the ledger, and pick up other devices' changes on focus and once a minute.
  useEffect(() => {
    if (!session.signedIn) {
      server.current = { state: null, version: null };
      stateRef.current = null;
      return undefined;
    }
    // Fetching the server's copy is the external sync this effect exists for; state is set after the response.
    // oxlint-disable-next-line react/set-state-in-effect
    load();
    const refresh = () => document.visibilityState === 'visible' && load();
    window.addEventListener('focus', refresh);
    const id = setInterval(refresh, 60000);
    return () => { window.removeEventListener('focus', refresh); clearInterval(id); };
  }, [session.signedIn, session.email, load]);

  // After any change that moves the projected shortfall, tell the owner by how much (step 6 of the journey).
  const [outlook, setOutlook] = useState(null);
  const outlookTimer = useRef();
  const dismissOutlook = useCallback(() => { clearTimeout(outlookTimer.current); setOutlook(null); }, []);

  // Run a pure transition from services/actions.js synchronously so the caller gets its result at
  // once, then have the server run the same transition on its copy. Requests go one at a time, each
  // stating the version it builds on; a refusal (offline, another device got there first, a rule the
  // server's newer copy fails) puts the server's copy back and shows the "not saved" banner.
  const run = useCallback((action, ...args) => {
    const r = action(stateRef.current, ...args);
    if (r.error) return r;
    const from = gapOf(stateRef.current);
    const to = gapOf(r.state);
    show(r.state);
    if (from !== to) {
      setOutlook({ from, to, id: Date.now() });
      clearTimeout(outlookTimer.current);
      outlookTimer.current = setTimeout(() => setOutlook(null), 9000);
    }
    pending.current++;
    queue.current = queue.current.then(async () => {
      // After a refusal the rest of the queue was built on a copy the server never had: drop it.
      const res = failed.current ? null : await api(`/api/actions/${NAMES.get(action)}`, { args, version: server.current.version });
      if ([200, 409, 422].includes(res?.status)) server.current = { state: res.body.state, version: res.body.version };
      if (res?.status === 401) sessionLost();
      if (res?.status !== 200) failed.current = true;
      if (--pending.current === 0) {
        const wasRefused = failed.current;
        failed.current = false;
        show(server.current.state);
        setStorageOk(!wasRefused);
        if (wasRefused) load(); // offline or server error: settle on the server's copy once it answers
      }
    });
    return r;
  }, [show, load]);

  // Demo business only (the server refuses a real one): back to the sample ledger.
  const reset = useCallback(async () => {
    const r = await api('/api/state/reset', {});
    if (r.status !== 200) return false;
    server.current = { state: r.body.state, version: r.body.version };
    show(r.body.state);
    return true;
  }, [show]);

  const finishImport = useCallback(async (accept) => {
    if (accept) {
      const r = await api('/api/state/import', { state: importable });
      if (r.status !== 200) return false;
      server.current = { state: r.body.state, version: r.body.version };
      show(r.body.state);
    }
    try { localStorage.setItem(IMPORT_DONE_KEY, new Date().toISOString()); } catch { /* offered again next time */ }
    setImportable(null);
    return true;
  }, [importable, show]);

  const lang = state?.settings.language || 'en';
  const simple = !!state?.settings.simpleLanguage;
  const t = useMemo(() => makeT(lang, simple), [lang, simple]);

  const derived = useMemo(() => {
    if (!state) return null;
    const today = state.settings.demoDate;
    const forecast = buildForecast(state, today);
    return { today, forecast, ranking: rankInvoices(state, today, forecast), followUps: followUps(state, today), windows: collectionWindows(forecast, today) };
  }, [state]);

  // Layout effect: set before the first paint and before children's effects (count-ups) read it.
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.text = state?.settings.textSize || 'normal';
    document.documentElement.dataset.motion = motionEnabled(state?.settings.motion) ? 'on' : 'off';
  }, [lang, state?.settings.textSize, state?.settings.motion]);

  const currency = state?.settings.currency || 'INR';
  const rate = state?.settings.fxRates?.[currency] ?? DEFAULT_FX[currency];
  const demo = session.demo;

  const value = useMemo(() => ({
    state, run, reset, t, lang, simple, notify, toast, outlook, dismissOutlook, storageOk, demo, importable, finishImport, ...derived,
    currency, rate,
    money: (p, o) => formatMoney(p, { ...o, currency, rate }), date: (d) => formatDate(d, lang),
    customer: (id) => state?.customers.find((c) => c.id === id),
    invoice: (id) => state?.invoices.find((i) => i.id === id),
  }), [state, run, reset, t, lang, simple, notify, toast, outlook, dismissOutlook, storageOk, demo, importable, finishImport, derived, currency, rate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
