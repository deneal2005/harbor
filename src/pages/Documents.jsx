import { useState } from 'react';
import { Link } from 'react-router';
import { Card, Empty, Field, Money, Page, inputCls } from '../components/ui.jsx';
import { updateSettings } from '../services/actions.js';
import { balanceOf, daysOverdue, isOpen } from '../services/invoices.js';
import { useStore } from '../store-context.js';

export default function Documents() {
  const { t, state, today, run, date, customer } = useStore();
  const issued = state.invoices.filter((i) => i.status !== 'draft').sort((a, b) => b.number.localeCompare(a.number));
  const overdueCustomers = state.customers.filter((c) => state.invoices.some((i) => i.customerId === c.id && isOpen(state, i) && daysOverdue(i, today) > 0));
  const [q, setQ] = useState('');
  const list = issued.filter((i) => !q || `${i.number} ${customer(i.customerId).name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page title={t('doc.title')} subtitle={t('doc.subtitle')}>
      <label className="flex min-h-12 items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={state.settings.bilingualDocs} onChange={(e) => run(updateSettings, { bilingualDocs: e.target.checked })} />{t('doc.bilingual')}
      </label>
      <Card title={t('doc.letters')}>
        {overdueCustomers.length === 0 ? <Empty>{t('doc.noOverdue')}</Empty> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {overdueCustomers.map((c) => {
              const amt = state.invoices.filter((i) => i.customerId === c.id && isOpen(state, i) && daysOverdue(i, today) > 0).reduce((a, i) => a + balanceOf(state, i), 0);
              return <li key={c.id}><Link to={`/print/letter/${c.id}`} className="flex min-h-12 justify-between gap-2 rounded-lg border border-line p-3 hover:border-brand"><span>{t('doc.letterFor', { company: c.name })}</span><Money paise={amt} /></Link></li>;
            })}
          </ul>
        )}
      </Card>
      <Card title={`${t('doc.invoices')} · ${t('doc.packs')}`}>
        <Field label={t('common.search')} className="mb-3 max-w-sm">{(p) => <input {...p} type="search" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('inv.searchPh')} />}</Field>
        <ul className="divide-y divide-line">
          {list.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>{i.number} · {customer(i.customerId).name} · {date(i.date)}</span>
              <span className="flex gap-3"><Link to={`/print/invoice/${i.id}`} className="inline-flex min-h-12 items-center text-brand underline">{t('inv.printInvoice')}</Link><Link to={`/print/pack/${i.id}`} className="inline-flex min-h-12 items-center text-brand underline">{t('inv.evidence')}</Link></span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
