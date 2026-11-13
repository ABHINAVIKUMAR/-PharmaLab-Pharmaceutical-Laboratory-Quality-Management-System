const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
}

export default function KpiCard({ label, value, hint, icon: Icon, tone = 'brand', onClick, alert }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`card relative w-full p-5 text-left transition ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''} ${
        alert ? 'ring-2 ring-red-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && (
          <div className={`rounded-xl p-2.5 ${TONES[tone] || TONES.brand}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Wrapper>
  )
}
