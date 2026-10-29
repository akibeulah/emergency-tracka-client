// Shared with facility-client/src/components/ui.tsx. Keep the two files identical.
//
// Small building blocks over the mockup classes (theme/mockup-base.css). Every
// status is an icon plus a word, never colour alone (architecture §7).

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

// ─── Status pill ─────────────────────────────────────────────────────────

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'muted';

const TONE_ICON: Record<Tone, IconName> = {
  success: 'checkCircle',
  warning: 'clock',
  danger: 'xCircle',
  neutral: 'alert',
  muted: 'dots',
};

export function Pill({ tone, icon, children }: { tone: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`pill pill-${tone}`}>
      <Icon name={icon ?? TONE_ICON[tone]} size={13} />
      {children}
    </span>
  );
}

// ─── Banners ─────────────────────────────────────────────────────────────

const BANNER_ICON: Record<'info' | 'warning' | 'danger' | 'success', IconName> = {
  info: 'alert',
  warning: 'alert',
  danger: 'xCircle',
  success: 'checkCircle',
};

export function Banner({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={BANNER_ICON[tone]} size={18} />
      <span>
        {title && <strong>{title}</strong>}
        {children}
      </span>
    </div>
  );
}

/** Marks anything shown from example data. Never present example data as real. */
export function ExampleTag({ children = 'Example data' }: { children?: ReactNode }) {
  return (
    <span className="pill pill-muted example-tag">
      <Icon name="file" size={13} />
      {children}
    </span>
  );
}

// ─── Page furniture ──────────────────────────────────────────────────────

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={c.label} className="row" style={{ gap: 6 }}>
          {i > 0 && <Icon name="chevronRight" size={13} />}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="web-h1">{title}</h1>
        {sub && <div className="web-sub">{sub}</div>}
      </div>
      {actions && <div className="row page-head__actions">{actions}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="registry-empty">{children}</div>;
}

// ─── Switch ──────────────────────────────────────────────────────────────

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────

export function Modal({
  title,
  sub,
  onClose,
  large,
  children,
  footer,
}: {
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  large?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${large ? ' modal--lg' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal__head">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────

type ToastFn = (message: string, icon?: IconName) => void;
const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; icon: IconName } | null>(null);
  const timer = useRef<number>();
  const show = useCallback<ToastFn>((message, icon = 'checkCircle') => {
    setToast({ message, icon });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast toast--web${toast ? ' open' : ''}`} role="status" aria-live="polite">
        {toast && <Icon name={toast.icon} />}
        {toast?.message}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ─── Formatting ──────────────────────────────────────────────────────────

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Prices travel as kobo (integers); people read naira. */
export function fmtNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}
