import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { useStore } from '../store-context.js';
import { formatINR } from '../utils/money.js';
import { cx } from '../utils/cx.js';
import { useCountUp } from '../hooks/useCountUp.js';

export function Page({ title, subtitle, actions, children, eyebrow }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pb-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">{eyebrow}</div>}
          <h1 className="text-[1.65rem] font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="stagger space-y-6">{children}</div>
    </div>
  );
}

const TONES = {
  danger: 'border-danger/25 bg-danger-soft', warn: 'border-warn/25 bg-warn-soft', ok: 'border-ok/25 bg-ok-soft',
  scenario: 'border-scenario/25 bg-scenario-soft', brand: 'border-brand/20 bg-brand-soft',
};

export function Card({ title, hint, actions, children, className, tone, icon: Icon, padded = true }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border shadow-[var(--shadow-card)]', TONES[tone] || 'border-line bg-card', padded && 'p-4 sm:p-5', className)}>
      {(title || actions) && (
        <div className={cx('mb-4 flex flex-wrap items-start justify-between gap-2', !padded && 'px-4 pt-4 sm:px-5 sm:pt-5')}>
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-muted"><Icon size={17} aria-hidden="true" /></span>}
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
              {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const BTN = {
  primary: 'bg-ink text-white border-ink hover:bg-ink/90 shadow-sm',
  brand: 'bg-brand text-white border-brand hover:bg-brand/90 shadow-sm',
  secondary: 'bg-white text-ink border-line hover:bg-paper hover:border-ink/15 shadow-[var(--shadow-card)]',
  danger: 'bg-white text-danger border-danger/30 hover:bg-danger-soft',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-ink/5',
  scenario: 'bg-scenario text-white border-scenario hover:bg-scenario/90 shadow-sm',
  // On the dark hero card.
  light: 'bg-white text-ink border-white hover:bg-white/90 shadow-sm',
  glass: 'bg-white/10 text-white border-white/20 hover:bg-white/15',
};
const btnClass = (variant, className) => cx('inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-xl border px-4 text-[0.95rem] font-medium transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50', BTN[variant], className);

export function Button({ variant = 'secondary', className, icon: Icon, children, ...props }) {
  return <button type="button" className={btnClass(variant, className)} {...props}>{Icon && <Icon size={17} aria-hidden="true" />}{children}</button>;
}
export function ButtonLink({ variant = 'secondary', className, icon: Icon, children, ...props }) {
  return <Link className={btnClass(variant, className)} {...props}>{Icon && <Icon size={17} aria-hidden="true" />}{children}</Link>;
}

const STATUS_TONE = { draft: 'muted', sent: 'muted', 'due-soon': 'warn', overdue: 'danger', 'part-paid': 'brand', paid: 'ok', disputed: 'scenario' };

export function StatusBadge({ status }) {
  const { t } = useStore();
  return <Badge tone={STATUS_TONE[status]} dot>{t(`status.${status}`)}</Badge>;
}

const BADGE = {
  danger: 'bg-danger-soft text-danger ring-danger/20', warn: 'bg-warn-soft text-warn ring-warn/20', ok: 'bg-ok-soft text-ok ring-ok/20',
  scenario: 'bg-scenario-soft text-scenario ring-scenario/20', brand: 'bg-brand-soft text-brand ring-brand/20', muted: 'bg-paper text-muted ring-line',
};
export function Badge({ className, children, tone = 'muted', dot }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium ring-1 ring-inset', BADGE[tone], className)}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}

// Shows the display currency; the exact INR value is always available on hover/long-press.
// Money that rolls to its new value (and up from zero on first view when fromZero is set).
export function CountMoney({ paise, fromZero, ...props }) {
  return <Money paise={useCountUp(paise, { fromZero })} {...props} />;
}

export function Money({ paise, className, tone, exact }) {
  const { money, currency } = useStore();
  const tones = { danger: 'text-danger', ok: 'text-ok', scenario: 'text-scenario', muted: 'text-muted' };
  return <span className={cx('num', tones[tone], className)} title={currency !== 'INR' ? formatINR(paise, { exact: true }) : undefined}>{money(paise, { exact })}</span>;
}

export function Stat({ label, value, tip, to, tone, sub, icon: Icon }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-medium text-muted">{label}{tip && <Tip text={tip} />}</span>
        {Icon && <Icon size={17} className="shrink-0 text-faint" aria-hidden="true" />}
      </div>
      <div className={cx('mt-2 text-2xl font-semibold tracking-tight', tone === 'danger' && 'text-danger', tone === 'ok' && 'text-ok')}>{value}</div>
      {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
    </>
  );
  const cls = 'block rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-card)] transition';
  return to ? <Link to={to} className={cx(cls, 'hover:-translate-y-0.5 hover:border-ink/15 hover:shadow-md')}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Tip({ text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button type="button" aria-label={text} aria-describedby={open ? id : undefined} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        onBlur={() => setOpen(false)} className="relative inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-faint before:absolute before:-inset-2.5 hover:bg-ink/5 hover:text-ink">ⓘ</button>
      {open && <span role="tooltip" id={id} className="animate-fade absolute left-0 top-7 z-30 w-64 rounded-xl border border-line bg-white p-3 text-sm font-normal leading-snug text-ink shadow-[var(--shadow-pop)]">{text}</span>}
    </span>
  );
}

export function Field({ label, error, hint, children, className }) {
  const id = useId();
  const child = children({ id, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-e` : hint ? `${id}-h` : undefined });
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink/80">{label}</label>
      {child}
      {hint && !error && <p id={`${id}-h`} className="text-sm text-muted">{hint}</p>}
      {error && <p id={`${id}-e`} className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

export const inputCls = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-white px-3.5 py-2 text-base shadow-[var(--shadow-card)] transition placeholder:text-faint hover:border-ink/20 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 aria-[invalid=true]:border-danger disabled:bg-paper';

export function Empty({ children, icon: Icon }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
      {Icon && <Icon size={20} className="text-faint" aria-hidden="true" />}{children}
    </div>
  );
}

export function Notice({ tone = 'warn', children, className, icon: Icon }) {
  const tones = { warn: 'border-warn/25 bg-warn-soft text-warn', danger: 'border-danger/25 bg-danger-soft text-danger', ok: 'border-ok/25 bg-ok-soft text-ok', info: 'border-line bg-white text-ink', scenario: 'border-scenario/25 bg-scenario-soft text-scenario' };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-2 rounded-xl border p-3 text-sm', tones[tone], className)}>
      {Icon && <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />}<div className="min-w-0">{children}</div>
    </div>
  );
}

export function Disclosure({ summary, children, className }) {
  return (
    <details className={cx('group rounded-xl border border-line bg-white', className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-sm font-medium">
        {summary}<span aria-hidden="true" className="text-faint transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-line p-3.5">{children}</div>
    </details>
  );
}

// Native <dialog>: focus trap, Escape and backdrop come from the browser.
export function Dialog({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  const { t } = useStore();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby={`${title}-h`}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-0 text-ink shadow-[var(--shadow-pop)]">
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={`${title}-h`} className="text-lg font-semibold tracking-tight">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t('app.close')} className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-ink/5"><X size={18} /></button>
          </div>
          <div className="space-y-3">{children}</div>
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Segmented({ value, onChange, options, label, size = 'md', dark }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-xl p-1', dark ? 'bg-white/10' : 'bg-ink/5')}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.label} title={o.label} onClick={() => onChange(o.value)}
          className={cx('rounded-lg font-medium transition', size === 'sm' ? 'min-h-9 min-w-9 px-2.5 text-sm pointer-coarse:min-h-11 pointer-coarse:min-w-11' : 'min-h-10 px-3 text-sm pointer-coarse:min-h-11',
            value === o.value ? (dark ? 'bg-white text-night shadow-sm' : 'bg-white text-ink shadow-sm') : (dark ? 'text-white/75 hover:text-white' : 'text-muted hover:text-ink'))}>
          {o.short ?? o.label}
        </button>
      ))}
    </div>
  );
}

export function ScoreBar({ score }) {
  const tone = score >= 60 ? 'bg-danger' : score >= 35 ? 'bg-warn' : 'bg-faint';
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/8"><div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.min(100, score)}%` }} /></div>
      <span className="num text-xs font-semibold text-muted">{Math.round(score)}</span>
    </div>
  );
}
