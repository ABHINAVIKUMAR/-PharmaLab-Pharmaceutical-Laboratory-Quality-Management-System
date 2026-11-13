import { AlertCircle, Inbox, Loader2 } from 'lucide-react'

export function Spinner({ className = '' }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-brand-600 ${className}`} />
}

export function PageLoader({ text = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
      <Spinner /> {text}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 rounded-xl bg-brand-600 p-2.5 text-white shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            value === t.id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`ml-2 rounded-full px-1.5 text-xs ${value === t.id ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            value === o.id
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700'
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
