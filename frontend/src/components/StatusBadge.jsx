import { label } from '../utils'

const STYLES = {
  // batch
  QUARANTINED: 'bg-amber-100 text-amber-800 ring-amber-200',
  TESTING: 'bg-blue-100 text-blue-800 ring-blue-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 ring-red-200',
  // sample
  PENDING: 'bg-slate-100 text-slate-700 ring-slate-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 ring-blue-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  // result
  PASS: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  FAIL: 'bg-red-100 text-red-800 ring-red-200',
  // severity
  MINOR: 'bg-slate-100 text-slate-700 ring-slate-200',
  MAJOR: 'bg-orange-100 text-orange-800 ring-orange-200',
  CRITICAL: 'bg-red-600 text-white ring-red-700',
  // deviation
  OPEN: 'bg-red-100 text-red-800 ring-red-200',
  INVESTIGATING: 'bg-amber-100 text-amber-800 ring-amber-200',
  CAPA_IN_PROGRESS: 'bg-blue-100 text-blue-800 ring-blue-200',
  CLOSED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  // capa
  VERIFIED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  OVERDUE: 'bg-red-600 text-white ring-red-700',
  // roles
  ADMIN: 'bg-violet-100 text-violet-800 ring-violet-200',
  QA_OFFICER: 'bg-brand-100 text-brand-800 ring-brand-200',
  QC_OFFICER: 'bg-sky-100 text-sky-800 ring-sky-200',
  LAB_TECHNICIAN: 'bg-slate-100 text-slate-700 ring-slate-200',
  // misc
  ACTIVE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  INACTIVE: 'bg-slate-200 text-slate-600 ring-slate-300',
}

// Capa "OPEN" is amber (pending work) while deviation "OPEN" is red; allow overriding the palette.
const CAPA_OPEN = 'bg-amber-100 text-amber-800 ring-amber-200'
const CAPA_COMPLETED = 'bg-blue-100 text-blue-800 ring-blue-200'

export default function StatusBadge({ value, kind, text }) {
  let style = STYLES[value] || 'bg-slate-100 text-slate-700 ring-slate-200'
  if (kind === 'capa' && value === 'OPEN') style = CAPA_OPEN
  if (kind === 'capa' && value === 'COMPLETED') style = CAPA_COMPLETED
  return <span className={`badge ring-1 ring-inset ${style}`}>{text || label(value)}</span>
}
