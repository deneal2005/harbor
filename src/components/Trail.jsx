import { Link } from 'react-router';
import { useStore } from '../store-context.js';
import { Empty } from './ui.jsx';

// Decision Trail: what happened, who did it, and the money involved.
export function TrailList({ events, showInvoice }) {
  const { t, date, money, invoice } = useStore();
  if (events.length === 0) return <Empty>—</Empty>;
  const detail = (e) => {
    const d = { ...e.detail };
    if (d.stage) d.stage = t(`stage.${d.stage}`);
    if (d.channel) d.channel = t(`channel.${d.channel}`);
    for (const k of ['promiseDate', 'until', 'from', 'to', 'paidOn']) if (d[k]) d[k] = date(d[k]);
    if (d.type) d.type = t(`inv.adj.${d.type}`);
    if (d.resolution) d.resolution = t(`inv.res.${d.resolution}`);
    return d;
  };
  return (
    <ol className="space-y-2">
      {events.map((e) => {
        const inv = e.invoiceId && invoice(e.invoiceId);
        return (
          <li key={e.id} className="flex gap-3 text-sm">
            <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.actor === 'customer' ? 'bg-scenario' : e.actor === 'system' ? 'bg-muted' : 'bg-brand'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-x-2">
                <span className="font-medium">{t(`ev.${e.type}`, detail(e))}</span>
                {e.amountPaise != null && <span className="num">{money(e.amountPaise)}</span>}
              </div>
              <div className="text-muted">
                {date(e.date)} · {t(`ev.actor.${e.actor}`)}
                {showInvoice && inv && <> · <Link to={`/invoices/${inv.id}`} className="font-medium text-brand hover:underline">{inv.number || t('status.draft')}</Link></>}
                {e.detail.balanceAfter != null && <> · {t('common.balance')}: {money(e.detail.balanceAfter)}</>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
