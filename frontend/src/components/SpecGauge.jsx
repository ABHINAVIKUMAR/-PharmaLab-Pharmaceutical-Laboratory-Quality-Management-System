/** Visual spec-limit gauge: green zone = acceptable range, marker = measured value. */
export default function SpecGauge({ min, max, value }) {
  const span = max - min || Math.abs(max) || 1
  const lo = min - span * 0.5
  const hi = max + span * 0.5
  const pct = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))
  const hasValue = value !== null && value !== undefined && !Number.isNaN(value)
  const inSpec = hasValue && value >= min && value <= max

  return (
    <div className="select-none">
      <div className="relative h-3 rounded-full bg-red-100">
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-300"
          style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }}
        />
        {hasValue && (
          <div
            className={`absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-all duration-200 ${
              inSpec ? 'bg-emerald-700' : 'bg-red-600'
            }`}
            style={{ left: `${pct(value)}%` }}
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[11px] font-medium text-slate-500">
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(min)}%` }}>
          {min}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(max)}%` }}>
          {max}
        </span>
      </div>
    </div>
  )
}
