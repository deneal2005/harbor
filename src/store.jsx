import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motionEnabled } from './utils/device.js';
import { Ctx } from './store-context.js';
import { makeT } from './i18n/translate.js';
import { buildForecast, collectionWindows } from './services/forecasting.js';
import { rankInvoices } from './services/priorityEngine.js';
import { followUps } from './services/reminders.js';
import { loadState, resetState, saveState } from './services/storage.js';
import { formatDate } from './utils/dates.js';
import { formatMoney } from './utils/money.js';
import { DEFAULT_FX } from './data/config.js';

const gapOf = (s) => buildForecast(s, s.settings.demoDate).firstBreach?.gapPaise ?? 0;

export function StoreProvider({ children }) {
  const [boot] = useState(() => loadState());
  const [state, setState] = useState(boot.state);
  const [recovery, setRecovery] = useState(boot.state ? null : boot);
  const [storageOk, setStorageOk] = useState(boot.status !== 'unavailable');
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const stateRef = useRef(state);

  // Money mutations must stay synchronous: run() reads and updates stateRef so
  // several actions in one event handler always see the freshest state. The ref
  // is synced from committed state here as a safety net (every state change also
  // flows through run()/reset(), which keep it up to date themselves).
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const notify = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  // After any change that moves the projected shortfall, tell the owner by how much (step 6 of the journey).
  const [outlook, setOutlook] = useState(null);
  const outlookTimer = useRef();
  const dismissOutlook = useCallback(() => { clearTimeout(outlookTimer.current); setOutlook(null); }, []);

  // Run a pure transition from services/actions.js synchronously so the caller gets its result.
  const run = useCallback((action, ...args) => {
    const r = action(stateRef.current, ...args);
    if (!r.error) {
      const from = gapOf(stateRef.current);
      const to = gapOf(r.state);
      stateRef.current = r.state;
      setState(r.state);
      setStorageOk(saveState(r.state));
      if (from !== to) {
        setOutlook({ from, to, id: Date.now() });
        clearTimeout(outlookTimer.current);
        outlookTimer.current = setTimeout(() => setOutlook(null), 9000);
      }
    }
    return r;
  }, []);

  const reset = useCallback(() => {
    const s = resetState();
    stateRef.current = s;
    setState(s);
    setStorageOk(saveState(s));
    setRecovery(null);
  }, []);

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

  const value = useMemo(() => ({
    state, run, reset, t, lang, simple, notify, toast, outlook, dismissOutlook, storageOk, recovery, ...derived,
    currency, rate,
    money: (p, o) => formatMoney(p, { ...o, currency, rate }), date: (d) => formatDate(d, lang),
    customer: (id) => state?.customers.find((c) => c.id === id),
    invoice: (id) => state?.invoices.find((i) => i.id === id),
  }), [state, run, reset, t, lang, simple, notify, toast, outlook, dismissOutlook, storageOk, recovery, derived, currency, rate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
