import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Search, User } from 'lucide-react';
import { balanceOf, statusOf } from '../services/invoices.js';
import { useStore } from '../store-context.js';
import { StatusBadge } from './ui.jsx';
import { cx } from '../utils/cx.js';

// Find a customer or invoice from anywhere. "/" or Ctrl/Cmd+K focuses it.
export function SearchBox({ className, autoFocus, onDone }) {
  const { t, state, today, money, customer } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const id = useId();

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const needle = q.trim().toLowerCase();
  const results = needle ? [
    ...state.customers.filter((c) => `${c.name} ${c.contactName} ${c.gstin} ${c.phone}`.toLowerCase().includes(needle))
      .slice(0, 4).map((c) => ({ key: c.id, to: `/customers/${c.id}`, icon: User, title: c.name, sub: [c.contactName, c.gstin].filter(Boolean).join(' · ') })),
    ...state.invoices.filter((i) => `${i.number ?? ''} ${customer(i.customerId)?.name}`.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
      .map((i) => ({ key: i.id, to: `/invoices/${i.id}`, icon: FileText, title: i.number || t('status.draft'), sub: customer(i.customerId)?.name, amount: balanceOf(state, i) || i.totalPaise, status: statusOf(state, i, today) })),
  ] : [];

  const go = (r) => { navigate(r.to); setQ(''); setOpen(false); input.current?.blur(); onDone?.(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); onDone?.(); }
  };
  const show = open && needle;

  return (
    <div className={cx('relative', className)}>
      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
      <input ref={input} type="search" role="combobox" aria-expanded={!!show} aria-controls={id} aria-autocomplete="list" autoFocus={autoFocus}
        aria-activedescendant={show && results[active] ? `${id}-${active}` : undefined} aria-label={t('search.label')}
        placeholder={t('search.placeholder')} value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKeyDown}
        className="min-h-10 w-full rounded-xl border border-line bg-white pl-9 pr-12 text-sm shadow-[var(--shadow-card)] placeholder:text-faint focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-xs text-faint lg:block">/</kbd>
      {show && (
        <ul id={id} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
          {results.length === 0 ? <li className="px-3 py-3 text-sm text-muted">{t('search.none')}</li> : results.map((r, i) => (
            <li key={r.key} id={`${id}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); go(r); }} onMouseEnter={() => setActive(i)}
              className={cx('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2', i === active && 'bg-paper')}>
              <r.icon size={16} className="shrink-0 text-faint" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.title}</span>{r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}</span>
              {r.status && <span className="flex shrink-0 items-center gap-2"><span className="num text-sm">{money(r.amount)}</span><StatusBadge status={r.status} /></span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
