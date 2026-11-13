import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Download, Lock, RefreshCw, ScrollText, Search } from 'lucide-react'
import { errMsg, get } from '../api/client'
import { useToast } from '../context/ToastContext'
import { cx, downloadCsv, fmtDateTime, label, useLoad } from '../utils'
import StatusBadge from '../components/StatusBadge'
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../components/ui'

const PAGE_SIZE = 25

const fmtVal = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Field-level before/after comparison of an audit entry. */
function Changes({ entry }) {
  const oldV = entry.old_value || {}
  const newV = entry.new_value || {}
  const keys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])]
  const rows = keys.filter((k) => JSON.stringify(oldV[k]) !== JSON.stringify(newV[k]))
  if (rows.length === 0) return <p className="text-xs text-slate-500">No field-level data recorded for this event.</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
          <th className="w-48 py-1 pr-3 font-semibold">Field</th>
          <th className="py-1 pr-3 font-semibold">Before</th>
          <th className="py-1 font-semibold">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((k) => (
          <tr key={k} className="border-t border-slate-200 align-top">
            <td className="mono py-1.5 pr-3 text-slate-600">{k}</td>
            <td className="mono break-all py-1.5 pr-3 text-red-700">{fmtVal(oldV[k])}</td>
            <td className="mono break-all py-1.5 text-emerald-700">{fmtVal(newV[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AuditTrailPage() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const params = () => ({
    q: debouncedQ || undefined,
    entity_type: entityType || undefined,
    action: action || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  })

  const { data, loading, error, reload } = useLoad(
    () => get('/api/audit', { ...params(), limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [debouncedQ, entityType, action, dateFrom, dateTo, page],
  )

  const exportCsv = async () => {
    try {
      const res = await get('/api/audit', { ...params(), limit: 500, offset: 0 })
      downloadCsv('pharmalab-audit-trail.csv', [
        ['Timestamp (UTC)', 'User', 'Email', 'Role', 'Action', 'Entity', 'Entity ID', 'Before', 'After'],
        ...res.items.map((a) => [a.timestamp, a.user_name, a.user_email, a.user_role, a.action, a.entity_type, a.entity_id, JSON.stringify(a.old_value ?? ''), JSON.stringify(a.new_value ?? '')]),
      ])
      toast.success(`Exported ${res.items.length} entries`)
    } catch (err) {
      toast.error(errMsg(err))
    }
  }

  const resetFilters = () => {
    setQ('')
    setDebouncedQ('')
    setEntityType('')
    setAction('')
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }
  const filterChange = (setter) => (e) => {
    setter(e.target.value)
    setPage(0)
  }

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = q || entityType || action || dateFrom || dateTo

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        subtitle="Immutable, timestamped record of every create, update, approval and login (21 CFR Part 11 inspired)."
        icon={ScrollText}
        actions={
          <>
            <button className="btn btn-secondary" onClick={reload}><RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} /> Refresh</button>
            <button className="btn btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
        <Lock className="h-4 w-4 text-brand-600" />
        Audit records are append-only: the application and the database block any update or deletion of log entries.
      </div>

      <div className="card overflow-hidden">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search user, action, entity, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input" value={entityType} onChange={filterChange(setEntityType)} aria-label="Entity type">
            <option value="">All entities</option>
            {(data?.facets.entity_types || []).map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
          <select className="input" value={action} onChange={filterChange(setAction)} aria-label="Action">
            <option value="">All actions</option>
            {(data?.facets.actions || []).map((a) => <option key={a} value={a}>{label(a)}</option>)}
          </select>
          <input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={filterChange(setDateFrom)} aria-label="From date" />
          <input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={filterChange(setDateTo)} aria-label="To date" />
          <button className="btn btn-ghost" disabled={!hasFilters} onClick={resetFilters}>Clear</button>
        </div>

        {loading && !data ? (
          <PageLoader text="Loading audit trail…" />
        ) : error && !data ? (
          <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>
        ) : data.items.length === 0 ? (
          <EmptyState title="No audit entries match" hint="Adjust or clear the filters." icon={ScrollText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th /><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th></tr>
              </thead>
              <tbody>
                {data.items.map((a) => {
                  const open = expanded === a.id
                  return (
                    <Fragment key={a.id}>
                      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(open ? null : a.id)}>
                        <td className="w-8"><ChevronDown className={cx('h-4 w-4 text-slate-400 transition', open && 'rotate-180')} /></td>
                        <td className="whitespace-nowrap text-slate-600">{fmtDateTime(a.timestamp)}</td>
                        <td>
                          <p className="font-medium text-slate-800">{a.user_name}</p>
                          {a.user_role && <StatusBadge value={a.user_role} />}
                        </td>
                        <td>
                          <span className={cx('mono font-semibold', /FAILED|REJECT|OOS|DELETED/.test(a.action) ? 'text-red-600' : /APPROVED|VERIFIED|CLOSED/.test(a.action) ? 'text-emerald-700' : 'text-slate-800')}>{a.action}</span>
                        </td>
                        <td className="text-slate-600">
                          {label(a.entity_type)}
                          {a.entity_id != null && <span className="mono ml-1 text-slate-400">#{a.entity_id}</span>}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50">
                          <td />
                          <td colSpan={4} className="!py-3">
                            <div className="mb-2 text-xs text-slate-500">
                              Log ID <span className="mono">{a.id}</span>{a.user_email && <> · {a.user_email}</>} · {a.timestamp} UTC
                            </div>
                            <Changes entry={a} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
          <span>{total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'}</span>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Prev</button>
            <span className="text-xs">Page {page + 1} of {pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
