/**
 * Small presentational building blocks shared across every page.
 */

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Alert({ type = 'error', children, onDismiss }) {
  if (!children) return null;
  const styles = {
    error: 'border-danger-100 bg-danger-50 text-danger-600',
    success: 'border-success-100 bg-success-50 text-success-600',
    info: 'border-brand-100 bg-brand-50 text-brand-700',
    warning: 'border-warn-100 bg-warn-50 text-warn-700',
  }[type];

  return (
    <div className={`mb-4 flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${styles}`}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="font-bold opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-4">
      <div>
        <h1 className="font-mono text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, sublabel, accent = 'neutral' }) {
  const accents = {
    neutral: 'text-ink-900',
    green: 'text-success-500',
    red: 'text-danger-500',
    blue: 'text-brand-600',
  };
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold tabular-nums ${accents[accent]}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-ink-500">{sublabel}</p>}
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="py-10 text-center text-sm text-ink-500">{children}</div>;
}

export function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600',
    green: 'bg-success-100 text-success-600',
    red: 'bg-danger-100 text-danger-600',
    amber: 'bg-warn-100 text-warn-700',
    blue: 'bg-brand-100 text-brand-700',
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Simple centered modal used by the admin CRUD forms. */
export function Modal({ title, onClose, children, footer }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-ink-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h2 className="font-mono text-lg font-semibold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink-400 hover:text-ink-700">
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
