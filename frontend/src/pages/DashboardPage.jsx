import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, FlaskConical, Package, RefreshCw, Siren, Target } from 'lucide-react'
import { get } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { cx, expiryInfo, fmtDate, fmtDateTime, fmtNum, useLoad } from '../utils'
import KpiCard from '../components/KpiCard'
import StatusBadge from '../components/StatusBadge'
import FlagOosModal from '../components/FlagOosModal'
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../components/ui'

const STATUS_COLORS = { QUARANTINED: '#f59e0b', TESTING: '#3b82f6', APPROVED: '#10b981', REJECTED: '#ef4444' }
const SEVERITY_COLORS = { MINOR: 'bg-slate-400', MAJOR: 'bg-orange-500', CRITICAL: 'bg-red-600' }

function ChartCard({ title, subtitle, children, className }) {
  return (
    <div className={cx('card p-5', className)}>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, can } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useLoad(() => get('/api/analytics/dashboard'), [])
  const [flagging, setFlagging] = useState(null)

  if (loading && !data) return <PageLoader text="Loading quality analytics…" />
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />
  if (!data) return null

  const { kpis, batches_by_status, trend, tests_by_product, failed_by_product, capa_summary } = data
  const statusData = batches_by_status.filter((s) => s.count > 0)
  const capaTotal = capa_summary.open_on_time + capa_summary.overdue + capa_summary.completed + capa_summary.verified
  const capaSegments = [
    { key: 'overdue', label: 'Overdue', value: capa_summary.overdue, color: 'bg-red-500' },
    { key: 'open_on_time', label: 'Open (on time)', value: capa_summary.open_on_time, color: 'bg-amber-400' },
    { key: 'completed', label: 'Awaiting QA verification', value: capa_summary.completed, color: 'bg-blue-500' },
    { key: 'verified', label: 'Verified', value: capa_summary.verified, color: 'bg-emerald-500' },
  ]
  const trendData = trend.map((d) => ({ ...d, label: d.date.slice(5) }))
  const canRaise = can('QC_OFFICER', 'QA_OFFICER')

  return (
    <div>
      <PageHeader
        title="Quality Analytics"
        subtitle={`Welcome back, ${user.full_name.split(' ')[0] === 'Dr.' ? user.full_name : user.full_name.split(' ')[0]} — here is the current quality position of the laboratory.`}
        icon={ClipboardCheck}
        actions={
          <button className="btn btn-secondary" onClick={reload}>
            <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </button>
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active batches" value={kpis.active_batches} hint={`${kpis.total_batches} batches in total`} icon={Package} tone="blue" onClick={() => navigate('/batches')} />
        <KpiCard
          label="Test pass rate"
          value={`${fmtNum(kpis.pass_rate, 1)}%`}
          hint={`${kpis.failed_tests} of ${kpis.total_tests} results failed`}
          icon={Target}
          tone={kpis.pass_rate >= 95 ? 'green' : kpis.pass_rate >= 85 ? 'amber' : 'red'}
        />
        <KpiCard label="Open deviations" value={kpis.open_deviations} hint="Not yet closed by QA" icon={Siren} tone={kpis.open_deviations ? 'red' : 'green'} onClick={() => navigate('/deviations')} />
        <KpiCard
          label="Overdue CAPAs"
          value={kpis.overdue_capas}
          hint={`${kpis.open_capas} CAPAs open in total`}
          icon={CalendarClock}
          tone={kpis.overdue_capas ? 'red' : 'green'}
          alert={kpis.overdue_capas > 0}
          onClick={() => navigate('/deviations')}
        />
      </div>

      {/* charts row 1 */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Batch status distribution" subtitle="All registered batches">
          {statusData.length === 0 ? (
            <EmptyState title="No batches yet" />
          ) : (
            <div className="relative h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="count" nameKey="status" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none">
                    {statusData.map((s) => (
                      <Cell key={s.status} fill={STATUS_COLORS[s.status]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend verticalAlign="bottom" iconType="circle" formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 top-[88px] -translate-y-1/2 text-center">
                <p className="text-3xl font-bold text-slate-900">{kpis.total_batches}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">batches</p>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Pass vs. fail trend" subtitle="Test results recorded per day · last 30 days" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ left: -20, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" interval={4} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend verticalAlign="top" align="right" iconType="circle" formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                <Bar dataKey="pass" name="Pass" stackId="r" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="fail" name="Fail (OOS)" stackId="r" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* charts row 2 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Failed tests by product" subtitle="Out-of-specification results">
          {failed_by_product.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No failed tests" hint="Every recorded result is within specification." />
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={failed_by_product} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="product" width={140} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="failed" name="Failed tests" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Results by product" subtitle="Pass vs. fail">
          {tests_by_product.length === 0 ? (
            <EmptyState title="No results yet" />
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tests_by_product} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="product" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => v.split(' ')[0]} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="passed" name="Pass" stackId="p" fill="#10b981" />
                  <Bar dataKey="failed" name="Fail" stackId="p" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="CAPA compliance" subtitle={`${capaTotal} corrective / preventive actions`}>
          {capaTotal === 0 ? (
            <EmptyState title="No CAPAs yet" />
          ) : (
            <div>
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                {capaSegments.map((s) => s.value > 0 && <div key={s.key} className={s.color} style={{ width: `${(s.value / capaTotal) * 100}%` }} title={`${s.label}: ${s.value}`} />)}
              </div>
              <ul className="mt-4 space-y-2">
                {capaSegments.map((s) => (
                  <li key={s.key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className={cx('h-2.5 w-2.5 rounded-full', s.color)} /> {s.label}
                    </span>
                    <span className="font-semibold text-slate-900">{s.value}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Open deviations by severity</p>
                <div className="flex gap-2">
                  {data.open_deviations_by_severity.map((s) => (
                    <div key={s.severity} className="flex flex-1 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className={cx('h-2 w-2 rounded-full', SEVERITY_COLORS[s.severity])} />
                      <span className="text-xs text-slate-600">{s.severity.charAt(0) + s.severity.slice(1).toLowerCase()}</span>
                      <span className="ml-auto text-sm font-bold text-slate-900">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* OOS alerts + expiring */}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Recent OOS alerts
              </h3>
              <p className="text-xs text-slate-500">Latest out-of-specification test results</p>
            </div>
          </div>
          {data.recent_oos.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No OOS results" hint="All recorded test results conform to their specifications." />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Specification</th>
                    <th>Tested</th>
                    <th>Deviation</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_oos.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <p className="mono font-semibold text-slate-900">{r.batch_number}</p>
                        <p className="text-xs text-slate-500">{r.product_name}</p>
                      </td>
                      <td>{r.test_name}</td>
                      <td className="font-semibold text-red-600">
                        {fmtNum(r.measured_value, 3)} <span className="text-xs font-normal text-slate-500">{r.unit}</span>
                      </td>
                      <td className="text-slate-600">
                        {fmtNum(r.min_limit)} – {fmtNum(r.max_limit)}
                      </td>
                      <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.tested_at)}</td>
                      <td>
                        {r.deviation_code ? (
                          <button className="badge bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => navigate('/deviations')}>
                            {r.deviation_code}
                          </button>
                        ) : canRaise ? (
                          <button className="btn btn-danger btn-sm" onClick={() => setFlagging(r)}>
                            Raise deviation
                          </button>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-800">Awaiting QC</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <FlaskConical className="h-4 w-4 text-amber-500" /> Expiry watch
            </h3>
            <p className="text-xs text-slate-500">Batches expiring within 90 days</p>
          </div>
          {data.expiring_batches.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing expiring soon" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.expiring_batches.map((b) => {
                const info = expiryInfo(b.days_to_expiry)
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="mono truncate font-semibold text-slate-900">{b.batch_number}</p>
                      <p className="truncate text-xs text-slate-500">{b.product_name} · exp {fmtDate(b.expiry_date)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge value={b.status} />
                      <span className={cx('text-xs font-semibold', info.tone === 'red' ? 'text-red-600' : 'text-amber-600')}>{info.text}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <FlagOosModal result={flagging} onClose={() => setFlagging(null)} onDone={reload} />
    </div>
  )
}
