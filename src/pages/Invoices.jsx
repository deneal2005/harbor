import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ButtonLink, Button, Empty, Field, Money, Page, StatusBadge, inputCls } from '../components/ui.jsx';
import { invoicesEmptyState } from '../services/formFlow.js';
import { ageingBucket, balanceOf, statusOf } from '../services/invoices.js';
import { useStore } from '../store-context.js';

const STATUSES = ['draft', 'sent', 'due-soon', 'overdue', 'part-paid', 'paid', 'disputed'];
const BUCKETS = ['notDue', 'd1_30', 'd31_60', 'd61_90', 'd90plus'];
const SORTS = { due: (a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate), balance: (a, b) => b.balance - a.balance, number: (a, b) => (b.inv.number || '').localeCompare(a.inv.number || '') };

export default function Invoices() {
  const { t, state, today, date, customer } = useStore();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const ageing = params.get('ageing') || '';
  const sort = params.get('sort') || 'due';
  const set = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  const rows = useMemo(() => state.invoices.map((inv) => ({ inv, status: statusOf(state, inv, today), balance: balanceOf(state, inv), c: customer(inv.customerId) }))
    .filter((r) => !status || r.status === status)
    .filter((r) => !ageing || (r.balance > 0 && r.inv.status !== 'draft' && ageingBucket(r.inv, today) === ageing))
    .filter((r) => !q || `${r.inv.number ?? ''} ${r.c.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort(SORTS[sort] || SORTS.due), [state, today, status, ageing, q, sort, customer]);

  return (
    <Page title={t('inv.title')} actions={<ButtonLink to="/invoices/new" variant="primary">+ {t('inv.new')}</ButtonLink>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('common.search')}>{(p) => <input {...p} type="search" className={inputCls} placeholder={t('inv.searchPh')} value={q} onChange={(e) => set('q', e.target.value)} />}</Field>
        <Field label={t('inv.filterStatus')}>{(p) => (
          <select {...p} className={inputCls} value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">{t('common.all')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>)}</Field>
        <Field label={t('inv.ageing')}>{(p) => (
          <select {...p} className={inputCls} value={ageing} onChange={(e) => set('ageing', e.target.value)}>
            <option value="">{t('common.all')}</option>{BUCKETS.map((b) => <option key={b} value={b}>{t(`ageing.${b}`)}</option>)}
          </select>)}</Field>
        <Field label="Sort">{(p) => (
          <select {...p} className={inputCls} value={sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="due">{t('common.dueDate')}</option><option value="balance">{t('common.balance')}</option><option value="number">{t('inv.number')}</option>
          </select>)}</Field>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {t(invoicesEmptyState({ rowsLength: 0, totalLength: state.invoices.length, hasFilters: !!(q || status || ageing) }))}
          {state.invoices.length > 0 && (q || status || ageing) ? (
            <Button className="mt-2" onClick={() => { setParams(new URLSearchParams(sort ? { sort } : {}), { replace: true }); }}>{t('inv.clearFilters')}</Button>
          ) : state.invoices.length === 0 ? (
            <ButtonLink to="/invoices/new" variant="primary" className="mt-2">+ {t('inv.new')}</ButtonLink>
          ) : null}
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left">
                {['inv.number', 'common.customer', 'inv.date', 'common.dueDate', 'common.total', 'common.balance', 'common.status'].map((k) => <th key={k} scope="col" className={`px-3 py-2 ${['common.total', 'common.balance'].includes(k) ? 'text-right' : ''}`}>{t(k)}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(({ inv, status: s, balance, c }) => (
                  <tr key={inv.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-3 py-2"><Link to={inv.status === 'draft' ? `/invoices/${inv.id}/edit` : `/invoices/${inv.id}`} className="font-medium underline">{inv.number || t('status.draft')}</Link></td>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 num">{date(inv.date)}</td>
                    <td className="px-3 py-2 num">{date(inv.dueDate)}</td>
                    <td className="px-3 py-2 text-right"><Money paise={inv.totalPaise} /></td>
                    <td className="px-3 py-2 text-right font-medium"><Money paise={balance} /></td>
                    <td className="px-3 py-2"><StatusBadge status={s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map(({ inv, status: s, balance, c }) => (
              <li key={inv.id}><Link to={inv.status === 'draft' ? `/invoices/${inv.id}/edit` : `/invoices/${inv.id}`} className="block rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-card)]">
                <div className="flex justify-between gap-2"><span className="font-semibold">{inv.number || t('status.draft')}</span><StatusBadge status={s} /></div>
                <div className="text-sm">{c.name}</div>
                <div className="mt-1 flex justify-between gap-2 text-sm"><span className="text-muted">{t('common.dueDate')} {date(inv.dueDate)}</span><Money paise={balance} className="font-semibold" /></div>
              </Link></li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
