import { useState } from 'react';
import { STATES } from '../data/config.js';
import { addCustomer } from '../services/actions.js';
import { useStore } from '../store-context.js';
import { Button, Dialog, Field, Notice, inputCls } from './ui.jsx';
import { useErrorText } from '../hooks/useErrorText.js';

// Add a customer without leaving the current screen (invoice form or Customers page).
export function CustomerDialog({ open, onClose, onCreated }) {
  const { t, state, run, notify } = useStore();
  const errText = useErrorText();
  const blank = { name: '', contactName: '', phone: '', email: '', gstin: '', stateCode: state.business.stateCode, address: '', creditDays: String(state.business.paymentTermsDays), language: 'en' };
  const [f, setF] = useState(blank);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const close = () => { setF(blank); setError(null); onClose(); };
  const save = () => {
    const r = run(addCustomer, f);
    const m = errText(r);
    setError(m);
    if (m) return;
    notify(t('cust.added', { name: f.name.trim() }));
    onCreated?.(r.state.customers.find((c) => c.id === r.customerId));
    close();
  };
  const gstinState = /^\d{2}/.test(f.gstin.trim()) ? f.gstin.trim().slice(0, 2) : null;
  return (
    <Dialog open={open} onClose={close} title={t('cust.add')}
      footer={<><Button onClick={close}>{t('common.cancel')}</Button><Button variant="primary" onClick={save}>{t('cust.addSave')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('cust.f.name')} className="sm:col-span-2">{(p) => <input {...p} className={inputCls} value={f.name} onChange={set('name')} />}</Field>
        <Field label={t('cust.f.contact')}>{(p) => <input {...p} className={inputCls} value={f.contactName} onChange={set('contactName')} />}</Field>
        <Field label={t('cust.f.phone')}>{(p) => <input {...p} type="tel" className={inputCls} value={f.phone} onChange={set('phone')} placeholder="+91" />}</Field>
        <Field label={t('cust.f.email')}>{(p) => <input {...p} type="email" className={inputCls} value={f.email} onChange={set('email')} />}</Field>
        <Field label={t('cust.f.gstin')} hint={t('cust.f.gstinHint')}>{(p) => <input {...p} className={`${inputCls} uppercase`} maxLength={15} value={f.gstin} onChange={set('gstin')} />}</Field>
        <Field label={t('new.place')} hint={gstinState ? t('cust.f.stateFromGstin') : undefined}>{(p) => (
          <select {...p} className={inputCls} value={gstinState ?? f.stateCode} onChange={set('stateCode')} disabled={!!gstinState}>
            {STATES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
          </select>)}</Field>
        <Field label={t('cust.f.credit')}>{(p) => <input {...p} inputMode="numeric" className={inputCls} value={f.creditDays} onChange={set('creditDays')} />}</Field>
        <Field label={t('cust.f.address')} className="sm:col-span-2">{(p) => <textarea {...p} rows={2} className={inputCls} value={f.address} onChange={set('address')} />}</Field>
        <Field label={t('cust.language')}>{(p) => (
          <select {...p} className={inputCls} value={f.language} onChange={set('language')}><option value="en">English</option><option value="hi">हिंदी</option></select>)}</Field>
      </div>
      {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
    </Dialog>
  );
}
