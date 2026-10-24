import { useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { Coins, Download, Languages, LogOut, RotateCcw } from 'lucide-react';
import { BusinessMark } from '../components/BusinessMark.jsx';
import { useDisplayControls } from '../components/displayControls.jsx';
import { useErrorText } from '../hooks/useErrorText.js';
import { Button, Card, Dialog, Field, Notice, Page, Segmented, inputCls } from '../components/ui.jsx';
import { DEMO_DATE } from '../data/seed.js';
import { DEFAULT_FX } from '../data/config.js';
import { LOGO_MAX_BYTES, updateBusiness, updateExpenses, updateSettings } from '../services/actions.js';
import { CATEGORIES } from '../services/forecasting.js';
import { endSession, getSessionSnapshot, subscribeSession } from '../services/session.js';
import { useStore } from '../store-context.js';
import { addDays, isValidDate } from '../utils/dates.js';
import { validateGstin } from '../utils/gstin.js';
import { paiseToRupeeInput, rupeesToPaise } from '../utils/money.js';

export default function Settings() {
  const { t, state, run, reset, notify, date } = useStore();
  const b = state.business;
  const [f, setF] = useState(() => ({
    name: b.name, address: b.address, stateCode: b.stateCode, gstin: b.gstin, registrationType: b.registrationType, turnover: paiseToRupeeInput(b.aggregateTurnoverPaise),
    udyam: b.udyam.registered, udyamCategory: b.udyam.category || 'micro', owner: b.owner, email: b.email, phone: b.phone, upiId: b.upiId,
    bankName: b.bank.name, bankAccount: b.bank.account, ifsc: b.bank.ifsc, logo: b.logo ?? null,
    opening: paiseToRupeeInput(b.openingBalancePaise), balanceDate: b.balanceDate, buffer: paiseToRupeeInput(b.bufferPaise),
    assumed: paiseToRupeeInput(b.assumedWeeklySalesPaise || 0), assumedStart: String(b.assumedSalesStartDays),
  }));
  const [expenses, setExpenses] = useState(() => state.expenses.map((e) => ({ ...e, amount: paiseToRupeeInput(e.amountPaise), day: String(e.schedule.day ?? '') })));
  const [error, setError] = useState(null);
  const [logoError, setLogoError] = useState(null);
  const errText = useErrorText();
  const pickLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again after Remove
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setLogoError(t('err.logoType'));
    if (file.size > LOGO_MAX_BYTES) return setLogoError(t('err.logoSize'));
    const reader = new FileReader();
    reader.onload = () => { setLogoError(null); setF((x) => ({ ...x, logo: reader.result })); };
    reader.readAsDataURL(file);
  };
  const set =(k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const gst = validateGstin(f.gstin);
  const controls = useDisplayControls();
  const navigate = useNavigate();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  const signOut = () => { endSession(); navigate('/login', { replace: true }); };
  const [confirmReset, setConfirmReset] = useState(false);
  const [rates, setRates] = useState(() => Object.fromEntries(['USD', 'EUR', 'JPY'].map((c) => [c, String(state.settings.fxRates?.[c] ?? DEFAULT_FX[c])])));

  const save = () => {
    const money = { openingBalancePaise: rupeesToPaise(f.opening), bufferPaise: rupeesToPaise(f.buffer), assumedWeeklySalesPaise: rupeesToPaise(f.assumed), aggregateTurnoverPaise: rupeesToPaise(f.turnover) };
    if (Object.values(money).some((v) => v === null) || !isValidDate(f.balanceDate) || !/^\d+$/.test(f.assumedStart)) return setError(t('err.amount'));
    const exp = expenses.map((e) => ({ id: e.id, label: e.label, category: e.category, amountPaise: rupeesToPaise(e.amount), schedule: e.schedule.type === 'monthly' ? { type: 'monthly', day: Number(e.day) } : e.schedule }));
    if (exp.some((e) => e.amountPaise === null || (e.schedule.type === 'monthly' && !(e.schedule.day >= 1 && e.schedule.day <= 31)))) return setError(t('err.amount'));
    setError(null);
    const r = run(updateBusiness, { ...money, name: f.name, address: f.address, stateCode: f.stateCode, gstin: f.gstin.toUpperCase(), registrationType: f.registrationType,
      udyam: { ...b.udyam, registered: f.udyam, category: f.udyamCategory },
      bank: { name: f.bankName.trim(), account: f.bankAccount.trim(), ifsc: f.ifsc.trim().toUpperCase() }, logo: f.logo,
      owner: f.owner, email: f.email, phone: f.phone, upiId: f.upiId, balanceDate: f.balanceDate, assumedSalesStartDays: Number(f.assumedStart) });
    if (r.error) return setError(errText(r));
    run(updateExpenses, exp);
    notify(t('set.saved'));
  };
  const setDate = (d) => run(updateSettings, { demoDate: d });
  const text = (k, label, extra = {}) => <Field label={label} {...extra}>{(p) => <input {...p} className={inputCls} value={f[k]} onChange={set(k)} inputMode={extra.inputMode} />}</Field>;
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `harbor-${state.settings.demoDate}.json` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page title={t('set.title')}>
      <Card title={t('set.demo')} tone="brand">
        <p className="text-sm">{t('set.demoDateHint', { date: date(DEMO_DATE) })}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label={t('app.demoDate')} className="w-48">{(p) => <input {...p} type="date" className={inputCls} value={state.settings.demoDate} onChange={(e) => isValidDate(e.target.value) && setDate(e.target.value)} />}</Field>
          <Button onClick={() => setDate(addDays(state.settings.demoDate, 1))}>{t('set.plus1')}</Button>
          <Button onClick={() => setDate(addDays(state.settings.demoDate, 7))}>{t('set.plus7')}</Button>
          <Button onClick={() => setDate(DEMO_DATE)}>{t('set.resetDate', { date: date(DEMO_DATE) })}</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="danger" icon={RotateCcw} onClick={() => setConfirmReset(true)}>{t('set.reset')}</Button>
          <Button icon={Download} onClick={exportData}>{t('set.export')}</Button>
        </div>
      </Card>

      <Card title={t('set.display')} icon={Languages}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><div className="text-sm font-medium text-ink/80">{t('app.language')}</div>{controls.language()}</div>
          <div className="space-y-1.5"><div className="text-sm font-medium text-ink/80">{t('set.textSize')}</div>
            <Segmented label={t('set.textSize')} value={state.settings.textSize} onChange={(v) => run(updateSettings, { textSize: v })} options={[{ value: 'normal', label: t('set.text.normal') }, { value: 'large', label: t('set.text.large') }]} /></div>
          <div className="space-y-1.5 sm:col-span-2"><div className="text-sm font-medium text-ink/80">{t('set.motion')}</div>
            <Segmented label={t('set.motion')} value={state.settings.motion || 'auto'} onChange={(v) => run(updateSettings, { motion: v })} options={[{ value: 'auto', label: t('set.motion.auto') }, { value: 'on', label: t('set.motion.on') }, { value: 'off', label: t('set.motion.off') }]} />
            <p className="text-sm text-muted">{t('set.motionHint')}</p></div>
        </div>
        <label className="mt-4 flex min-h-12 items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={!!state.settings.simpleLanguage} onChange={(e) => run(updateSettings, { simpleLanguage: e.target.checked })} />
          <span className="min-w-0">
            <span className="text-sm font-medium">{t('set.simple')}</span>
            <span className="block text-sm text-muted">{t('set.simpleHint')}</span>
          </span>
        </label>
      </Card>

      <Card title={t('set.currency')} hint={t('set.currencyHint')} icon={Coins}>
        <div className="space-y-4">
          {controls.currency()}
          <div className="grid gap-3 sm:grid-cols-3">
            {['USD', 'EUR', 'JPY'].map((code) => (
              <Field key={code} label={t('set.rate', { code })} hint={t('set.rateHint')}>{(p) => (
                <input {...p} inputMode="decimal" className={inputCls} value={rates[code]} onChange={(e) => setRates({ ...rates, [code]: e.target.value })}
                  onBlur={() => { const v = Number(rates[code]); if (v > 0) run(updateSettings, { fxRates: { ...state.settings.fxRates, [code]: v } }); else setRates({ ...rates, [code]: String(state.settings.fxRates?.[code] ?? DEFAULT_FX[code]) }); }} />
              )}</Field>
            ))}
          </div>
        </div>
      </Card>

      <Card title={t('set.money')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('opening', t('set.opening'), { inputMode: 'decimal' })}
          <Field label={t('set.balanceDate')}>{(p) => <input {...p} type="date" className={inputCls} value={f.balanceDate} onChange={set('balanceDate')} />}</Field>
          {text('buffer', t('set.buffer'), { inputMode: 'decimal' })}
          {text('assumed', t('set.assumed'), { inputMode: 'decimal' })}
          {text('assumedStart', t('set.assumedStart'), { inputMode: 'numeric' })}
        </div>
      </Card>

      <Card title={t('set.expenses')}>
        <div className="space-y-3" id="expenses">
          {expenses.map((e, i) => (
            <div key={e.id} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-4">
              <Field label={t('set.expLabel')} className="sm:col-span-2">{(p) => <input {...p} className={inputCls} value={e.label} onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))} />}</Field>
              <Field label={t('set.expAmount')}>{(p) => <input {...p} inputMode="decimal" className={inputCls} value={e.amount} onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} />}</Field>
              <Field label={t('set.expDay')}>{(p) => <input {...p} inputMode="numeric" className={inputCls} value={e.day} onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, day: ev.target.value } : x)))} />}</Field>
              <Field label={t('set.expCategory')} className="sm:col-span-2">{(p) => <select {...p} className={inputCls} value={e.category} onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, category: ev.target.value } : x)))}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`set.cat.${c}`)}</option>)}</select>}</Field>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('set.business')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('name', t('set.name'))}
          {text('address', t('set.address'))}
          {text('stateCode', t('set.stateCode'), { inputMode: 'numeric' })}
          <Field label={t('set.gstin')} error={f.registrationType !== 'unregistered' && !gst.ok ? t('set.gstinBad', { reason: gst.reason }) : null} hint={gst.ok ? t('set.gstinOk') : undefined}>{(p) => <input {...p} className={inputCls} value={f.gstin} onChange={set('gstin')} />}</Field>
          <Field label={t('set.registration')}>{(p) => <select {...p} className={inputCls} value={f.registrationType} onChange={set('registrationType')}>{['regular', 'composition', 'unregistered'].map((r) => <option key={r} value={r}>{t(`set.reg.${r}`)}</option>)}</select>}</Field>
          {text('turnover', t('set.turnover'), { inputMode: 'decimal' })}
          {text('owner', t('set.owner'))}
          {text('email', t('set.email'))}
          {text('phone', t('set.phone'))}
          {text('upiId', t('set.upi'))}
          {text('bankName', t('set.bankName'))}
          {text('bankAccount', t('set.bankAccount'), { inputMode: 'numeric' })}
          {text('ifsc', t('set.ifsc'))}
          <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.udyam} onChange={set('udyam')} />{t('set.udyam')}</label>
          {f.udyam && <Field label={t('set.udyamCategory')}>{(p) => <select {...p} className={inputCls} value={f.udyamCategory} onChange={set('udyamCategory')}>{['micro', 'small', 'medium'].map((c) => <option key={c} value={c}>{t(`set.udyam.${c}`)}</option>)}</select>}</Field>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <BusinessMark business={{ name: f.name, logo: f.logo }} className="h-14 w-14 text-xl" />
          <div className="min-w-0 flex-1">
            <Field label={t('set.logo')} hint={f.logo ? t('set.logoHint') : `${t('set.logoHint')} ${t('set.logoNone')}`} error={logoError}>{(p) => <input {...p} type="file" accept="image/png,image/jpeg" className="block w-full text-sm" onChange={pickLogo} />}</Field>
          </div>
          {f.logo && <Button variant="ghost" onClick={() => { setLogoError(null); setF((x) => ({ ...x, logo: null })); }}>{t('set.logoRemove')}</Button>}
        </div>
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end"><Button variant="primary" onClick={save}>{t('common.save')}</Button></div>
      <Card title={t('session.signOut')} hint={t('session.signOutHint')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm">{t('session.signedInAs', { email: session.email ?? '' })}</p>
          <Button variant="danger" icon={LogOut} onClick={signOut}>{t('session.signOut')}</Button>
        </div>
      </Card>
      <Card title={t('set.privacy')}><p className="text-sm">{t('set.privacyBody')}</p></Card>
      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} title={t('set.reset')}
        footer={<><Button onClick={() => setConfirmReset(false)}>{t('common.cancel')}</Button><Button variant="danger" icon={RotateCcw} onClick={() => { reset(); setConfirmReset(false); notify(t('set.resetDone')); }}>{t('set.reset')}</Button></>}>
        <p>{t('set.resetConfirm')}</p>
      </Dialog>
    </Page>
  );
}
