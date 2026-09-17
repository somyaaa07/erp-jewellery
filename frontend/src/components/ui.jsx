// src/components/ui.jsx
// Small shared building blocks so every screen looks and behaves the same way.
// Nothing here is clever - it just stops each page from inventing its own layout,
// its own "Loading..." text and its own empty state.
import React from 'react';

/* ------------------------------------------------------------- formatting -- */

export function money(n, { decimals = 0 } = {}) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function grams(n, digits = 3) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(digits)} g`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Turns SCREAMING_SNAKE_CASE enums from the API into readable words.
export function titleCase(value) {
  if (!value) return '';
  return String(value)
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Pulls a readable message out of any axios error.
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (err.response?.data?.error) return err.response.data.error;
  if (err.response?.data?.message) return err.response.data.message;
  if (err.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. Make sure the backend is running on port 5000.';
  }
  return err.message || fallback;
}

/* ----------------------------------------------------------------- layout -- */

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, note, actions, children, bodyClass = '', className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {note && <p className="card-head-note">{note}</p>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => {
        const key = t.key ?? t;
        const label = t.label ?? t;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`tab ${active === key ? 'active' : ''}`}
            onClick={() => onChange(key)}
          >
            {label}
            {t.count !== undefined && <span className="tab-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ status bits -- */

const STATUS_TONE = {
  IN_STOCK: 'green',
  ACTIVE: 'green',
  RECEIVED: 'green',
  COMPLETED: 'green',
  CONFIRMED: 'green',
  PAID: 'green',
  SOLD: 'blue',
  RESERVED: 'yellow',
  IN_TRANSIT: 'yellow',
  PENDING: 'yellow',
  PARTIAL: 'yellow',
  IN_REPAIR: 'yellow',
  DRAFT: 'neutral',
  RETURNED: 'neutral',
  TRANSFERRED: 'neutral',
  DAMAGED: 'red',
  REJECTED: 'red',
  CANCELLED: 'red',
  UNPAID: 'red',
  RETAIL: 'blue',
  WHOLESALE: 'teal',
};

export function StatusBadge({ value, tone }) {
  if (!value) return <span className="muted">—</span>;
  const cls = tone || STATUS_TONE[String(value).toUpperCase()] || 'neutral';
  return <span className={`badge ${cls}`}>{titleCase(value)}</span>;
}

// An item belongs to exactly one channel, so this is a single badge, never two.
export function ChannelBadge({ channel }) {
  const value = channel === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
  return <span className={`badge ${value === 'WHOLESALE' ? 'teal' : 'blue'}`}>{titleCase(value)}</span>;
}

/* ---------------------------------------------------------------- states -- */

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state">
      <span className="spinner spinner-lg" />
      <p className="state-text" style={{ marginTop: 12 }}>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state">
      <p className="state-title">Could not load this data</p>
      <p className="state-text">{message}</p>
      {onRetry && (
        <div className="state-actions">
          <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', text, action }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {text && <p className="state-text">{text}</p>}
      {action && <div className="state-actions">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children }) {
  return (
    <div className={`alert alert-${tone}`}>
      <div>
        {title && <div className="alert-title">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Wraps any list/table area and shows exactly one of: loading, error, empty, content.
 * This is why a failed request now shows a clear message instead of a blank page.
 */
export function DataState({ loading, error, empty, emptyProps = {}, onRetry, children }) {
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState {...emptyProps} />;
  return children;
}

/* ----------------------------------------------------------------- modal -- */

export function Modal({ open, title, onClose, children, footer, size = '' }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function TableWrap({ children }) {
  return <div className="table-wrap">{children}</div>;
}
