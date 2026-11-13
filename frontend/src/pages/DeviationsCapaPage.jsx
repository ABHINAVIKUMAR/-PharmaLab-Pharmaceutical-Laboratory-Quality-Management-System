import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Columns3,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  Table2,
  UserCheck,
} from 'lucide-react'
import { errMsg, get, post, put } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { cx, fmtDate, fmtDateTime, fmtNum, label, localToday, parseTs, useLoad } from '../utils'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { Chips, EmptyState, ErrorBanner, Field, PageHeader, PageLoader, Spinner, Tabs } from '../components/ui'

const COLUMNS = [
  { id: 'OPEN', title: 'Open', hint: 'Newly raised', accent: 'border-red-400' },
  { id: 'INVESTIGATING', title: 'Investigating', hint: 'Root-cause analysis', accent: 'border-amber-400' },
  { id: 'CAPA_IN_PROGRESS', title: 'CAPA in progress', hint: 'Actions being executed', accent: 'border-blue-400' },
  { id: 'CLOSED', title: 'Closed', hint: 'Verified & closed by QA', accent: 'border-emerald-400' },
]

const ageDays = (iso) => Math.max(0, Math.floor((Date.now() - parseTs(iso).getTime()) / 86400000))

/* ------------------------------------------------------------ raise deviation modal */
function NewDeviationModal({ onClose, onCreated }) {
  const toast = useToast()
  const batches = useLoad(() => get('/api/batches'), [])
  const [form, setForm] = useState({ batch_id: '', severity: 'MAJOR', description: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const dev = await post('/api/deviations', { ...form, batch_id: Number(form.batch_id), description: form.description.trim() })
      toast.success(`Deviation ${dev.deviation_code} raised`)
      onCreated(dev)
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Raise deviation" subtitle="Record a quality event that is not tied to a specific failed test (OOS results are raised from the test result).">
      <form onSubmit={save} className="space-y-4">
        <Field label="Batch">
          <select className="input" value={form.batch_id} onChange={set('batch_id')} required>
            <option value="">Select a batch…</option>
            {(batches.data || []).map((b) => (
              <option key={b.id} value={b.id}>{b.batch_number} – {b.product_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Severity">
          <select className="input" value={form.severity} onChange={set('severity')}>
            <option value="MINOR">Minor – no impact on product quality</option>
            <option value="MAJOR">Major – potential impact on quality</option>
            <option value="CRITICAL">Critical – patient safety / compliance impact</option>
          </select>
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[110px]" value={form.description} onChange={set('description')} required minLength={5} maxLength={2000} placeholder="What happened, where and when? Who/what is affected?" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={busy}>{busy ? <Spinner className="!text-white" /> : <AlertTriangle className="h-4 w-4" />} Raise deviation</button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------ complete CAPA modal */
function CompleteCapaModal({ capa, onClose, onDone }) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post(`/api/capas/${capa.id}/complete`, { completion_notes: notes.trim() })
      toast.success('CAPA marked as completed – awaiting QA verification')
      onDone()
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Complete CAPA" subtitle={`${capa.deviation_code} · ${capa.action_type.toLowerCase()} action`}>
      <form onSubmit={save} className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{capa.action_plan}</p>
        <Field label="Completion notes / evidence" hint="Describe what was done and reference supporting records (min. 5 characters).">
          <textarea className="input min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} required minLength={5} maxLength={2000} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="!text-white" />} Mark completed</button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------ assign CAPA form */
function CapaForm({ deviationId, onDone }) {
  const toast = useToast()
  const assignees = useLoad(() => get('/api/auth/assignees'), [])
  const [form, setForm] = useState({ action_plan: '', action_type: 'CORRECTIVE', assigned_to: '', due_date: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post('/api/capas', { ...form, deviation_id: deviationId, assigned_to: Number(form.assigned_to), action_plan: form.action_plan.trim() })
      toast.success('CAPA assigned')
      setForm({ action_plan: '', action_type: 'CORRECTIVE', assigned_to: '', due_date: '' })
      onDone()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 p-4">
      <p className="text-sm font-bold text-slate-900">Assign a new CAPA</p>
      <Field label="Action plan">
        <textarea className="input min-h-[70px]" value={form.action_plan} onChange={set('action_plan')} required minLength={5} maxLength={2000} placeholder="Describe the corrective / preventive action…" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type">
          <select className="input" value={form.action_type} onChange={set('action_type')}>
            <option value="CORRECTIVE">Corrective</option>
            <option value="PREVENTIVE">Preventive</option>
          </select>
        </Field>
        <Field label="Assign to">
          <select className="input" value={form.assigned_to} onChange={set('assigned_to')} required>
            <option value="">Select…</option>
            {(assignees.data || []).map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <input type="date" className="input" min={localToday()} value={form.due_date} onChange={set('due_date')} required />
        </Field>
      </div>
      <div className="flex justify-end">
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? <Spinner className="!text-white" /> : <Plus className="h-4 w-4" />} Assign CAPA</button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------ CAPA actions (shared) */
function CapaActions({ capa, onChanged, size = 'btn-sm' }) {
  const { user, can } = useAuth()
  const toast = useToast()
  const [completing, setCompleting] = useState(false)
  const [busy, setBusy] = useState(false)

  const canComplete = capa.status === 'OPEN' && (capa.assigned_to === user.id || can('QA_OFFICER'))
  const canVerify = capa.status === 'COMPLETED' && can('QA_OFFICER')

  const verify = async () => {
    setBusy(true)
    try {
      await post(`/api/capas/${capa.id}/verify`)
      toast.success('CAPA verified')
      onChanged()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {canComplete && (
          <button className={cx('btn btn-primary', size)} onClick={() => setCompleting(true)}>
            <CheckCircle2 className="h-4 w-4" /> Complete
          </button>
        )}
        {canVerify && (
          <button className={cx('btn btn-success', size)} disabled={busy} onClick={verify}>
            <ShieldCheck className="h-4 w-4" /> Verify
          </button>
        )}
      </div>
      {completing && <CompleteCapaModal capa={capa} onClose={() => setCompleting(false)} onDone={onChanged} />}
    </>
  )
}

function CapaStatus({ capa }) {
  if (capa.is_overdue) return <StatusBadge value="OVERDUE" text={`Overdue ${capa.days_overdue} d`} />
  return <StatusBadge value={capa.status} kind="capa" text={capa.status === 'COMPLETED' ? 'Awaiting verification' : undefined} />
}

/* ------------------------------------------------------------ deviation detail modal */
function DeviationModal({ deviationId, onClose, onChanged }) {
  const { can } = useAuth()
  const toast = useToast()
  const { data: d, loading, error, reload } = useLoad(() => get(`/api/deviations/${deviationId}`), [deviationId])
  const [rootCause, setRootCause] = useState(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    reload()
    onChanged()
  }

  const update = async (body, okMsg) => {
    setBusy(true)
    try {
      await put(`/api/deviations/${deviationId}`, body)
      toast.success(okMsg)
      setRootCause(null)
      refresh()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const closed = d?.status === 'CLOSED'
  const canWork = can('QC_OFFICER', 'QA_OFFICER') && !closed
  const rc = rootCause ?? d?.root_cause ?? ''
  const dirty = d && rc !== (d.root_cause ?? '')

  return (
    <Modal open onClose={onClose} size="lg" title={d ? d.deviation_code : 'Deviation'} subtitle={d ? `${d.batch_number} · ${d.product_name}` : undefined}>
      {loading && !d ? (
        <PageLoader />
      ) : error && !d ? (
        <ErrorBanner message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={d.status} />
            <StatusBadge value={d.severity} />
            <span className="text-xs text-slate-500">Raised by {d.raised_by_name} · {fmtDateTime(d.created_at)}</span>
            {d.closed_at && <span className="text-xs text-emerald-700">Closed {fmtDateTime(d.closed_at)}</span>}
          </div>

          <div>
            <p className="label">Description</p>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{d.description}</p>
          </div>

          {d.test_result && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Linked OOS result</p>
              <p className="mt-1">
                {d.test_result.test_name}: <b>{fmtNum(d.test_result.measured_value, 4)} {d.test_result.unit}</b> · specification{' '}
                {fmtNum(d.test_result.min_limit, 4)} – {fmtNum(d.test_result.max_limit, 4)} {d.test_result.unit} · sample {d.test_result.sample_code}
              </p>
            </div>
          )}

          {/* investigation */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="label !mb-0">Root cause / investigation</p>
              {d.status === 'OPEN' && canWork && (
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => update({ status: 'INVESTIGATING' }, 'Investigation started')}>
                  <Search className="h-4 w-4" /> Start investigation
                </button>
              )}
            </div>
            <textarea className="input min-h-[90px]" value={rc} onChange={(e) => setRootCause(e.target.value)} disabled={!canWork} maxLength={2000} placeholder={canWork ? 'Document the root cause (required before closure)…' : 'No root cause documented.'} />
            {canWork && dirty && (
              <div className="mt-2 flex justify-end gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setRootCause(null)}>Discard</button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => update({ root_cause: rc }, 'Root cause saved')}>Save root cause</button>
              </div>
            )}
          </div>

          {/* CAPAs */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><ListChecks className="h-4 w-4 text-brand-600" /> CAPAs ({d.capas.length})</h4>
            {d.capas.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No corrective / preventive actions assigned yet.</p>
            ) : (
              <ul className="space-y-2">
                {d.capas.map((c) => (
                  <li key={c.id} className={cx('rounded-xl border p-3', c.is_overdue ? 'border-red-300 bg-red-50/50' : 'border-slate-200')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className={cx('badge', c.action_type === 'CORRECTIVE' ? 'bg-orange-100 text-orange-800' : 'bg-sky-100 text-sky-800')}>{label(c.action_type)}</span>
                          <CapaStatus capa={c} />
                        </p>
                        <p className="mt-1.5 text-sm text-slate-800">{c.action_plan}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> {c.assigned_to_name}</span>
                          <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Due {fmtDate(c.due_date)}</span>
                          {c.verified_by_name && <span className="text-emerald-700">Verified by {c.verified_by_name}</span>}
                        </p>
                        {c.completion_notes && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">{c.completion_notes}</p>}
                      </div>
                      <CapaActions capa={c} onChanged={refresh} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {can('QA_OFFICER') && !closed && <CapaForm deviationId={d.id} onDone={refresh} />}
          {!can('QA_OFFICER') && !closed && <p className="text-xs text-slate-500">Only QA Officers can assign CAPAs and close deviations.</p>}

          {can('QA_OFFICER') && !closed && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">
                A deviation can be closed once the root cause is documented and every CAPA is <b>verified</b>.
              </p>
              <button className="btn btn-success" disabled={busy} onClick={() => update({ status: 'CLOSED' }, 'Deviation closed')}>
                <ClipboardCheck className="h-4 w-4" /> Close deviation
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------ kanban + table */
function DeviationCard({ d, onOpen }) {
  return (
    <button onClick={() => onOpen(d.id)} className="card w-full p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="mono font-semibold text-slate-900">{d.deviation_code}</span>
        <StatusBadge value={d.severity} />
      </div>
      <p className="mt-1 text-xs font-medium text-slate-600">{d.batch_number} · {d.product_name}</p>
      <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{d.description}</p>
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>{d.status === 'CLOSED' ? `Closed` : `${ageDays(d.created_at)} d old`}</span>
        {d.capa_total > 0 && (
          <span className={cx('badge', d.capa_overdue ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600')}>
            {d.capa_overdue ? `${d.capa_overdue} overdue · ` : ''}{d.capa_total} CAPA
          </span>
        )}
      </div>
    </button>
  )
}

function Board({ items, onOpen }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const cards = items.filter((d) => d.status === col.id)
        return (
          <div key={col.id} className={cx('rounded-xl border-t-4 bg-slate-200/50 p-3', col.accent)}>
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-bold text-slate-800">{col.title}</p>
                <p className="text-[11px] text-slate-500">{col.hint}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm">{cards.length}</span>
            </div>
            <div className="space-y-2.5">
              {cards.map((d) => <DeviationCard key={d.id} d={d} onOpen={onOpen} />)}
              {cards.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">Nothing here</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DeviationTable({ items, onOpen }) {
  return (
    <div className="card overflow-x-auto">
      <table className="tbl tbl-hover">
        <thead>
          <tr><th>Code</th><th>Batch</th><th>Severity</th><th>Description</th><th>Raised</th><th>CAPAs</th><th>Status</th></tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id} onClick={() => onOpen(d.id)}>
              <td className="mono font-semibold text-slate-900">{d.deviation_code}</td>
              <td>
                <p className="mono font-medium text-slate-800">{d.batch_number}</p>
                <p className="text-xs text-slate-500">{d.product_name}</p>
              </td>
              <td><StatusBadge value={d.severity} /></td>
              <td className="max-w-xs"><p className="line-clamp-2 text-slate-600">{d.description}</p></td>
              <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(d.created_at)}<br />{d.raised_by_name}</td>
              <td>
                {d.capa_total === 0 ? <span className="text-xs text-slate-400">None</span> : (
                  <span className={cx('badge', d.capa_overdue ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700')}>{d.capa_overdue ? `${d.capa_overdue} overdue` : `${d.capa_total - d.capa_open}/${d.capa_total} done`}</span>
                )}
              </td>
              <td><StatusBadge value={d.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------ CAPA tracker tab */
function CapaTracker({ onOpenDeviation }) {
  const { user } = useAuth()
  const { data, loading, error, reload } = useLoad(() => get('/api/capas'), [])
  const [filter, setFilter] = useState('ALL')
  const [mine, setMine] = useState(false)

  const all = data || []
  const scoped = mine ? all.filter((c) => c.assigned_to === user.id) : all
  const counts = {
    ALL: scoped.length,
    OVERDUE: scoped.filter((c) => c.is_overdue).length,
    OPEN: scoped.filter((c) => c.status === 'OPEN' && !c.is_overdue).length,
    COMPLETED: scoped.filter((c) => c.status === 'COMPLETED').length,
    VERIFIED: scoped.filter((c) => c.status === 'VERIFIED').length,
  }
  const rows = scoped.filter((c) =>
    filter === 'ALL' ? true : filter === 'OVERDUE' ? c.is_overdue : filter === 'OPEN' ? c.status === 'OPEN' && !c.is_overdue : c.status === filter,
  )

  if (loading && !data) return <PageLoader />
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'ALL', label: 'All', count: counts.ALL },
            { id: 'OVERDUE', label: 'Overdue', count: counts.OVERDUE },
            { id: 'OPEN', label: 'Open', count: counts.OPEN },
            { id: 'COMPLETED', label: 'Awaiting verification', count: counts.COMPLETED },
            { id: 'VERIFIED', label: 'Verified', count: counts.VERIFIED },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Assigned to me
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No CAPAs match" hint="Try another filter." icon={ListChecks} />
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Deviation</th><th>Action</th><th>Type</th><th>Assignee</th><th>Due</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={cx(c.is_overdue && 'bg-red-50/50')}>
                  <td>
                    <button className="mono font-semibold text-brand-700 hover:underline" onClick={() => onOpenDeviation(c.deviation_id)}>{c.deviation_code}</button>
                    <p className="text-xs text-slate-500">{c.batch_number}</p>
                  </td>
                  <td className="max-w-sm"><p className="line-clamp-2 text-slate-700">{c.action_plan}</p></td>
                  <td><span className={cx('badge', c.action_type === 'CORRECTIVE' ? 'bg-orange-100 text-orange-800' : 'bg-sky-100 text-sky-800')}>{label(c.action_type)}</span></td>
                  <td className="whitespace-nowrap text-slate-600">{c.assigned_to_name}</td>
                  <td className={cx('whitespace-nowrap', c.is_overdue ? 'font-semibold text-red-600' : 'text-slate-600')}>{fmtDate(c.due_date)}</td>
                  <td><CapaStatus capa={c} /></td>
                  <td className="text-right"><CapaActions capa={c} onChanged={reload} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ====================================================================== page */
export default function DeviationsCapaPage() {
  const { can } = useAuth()
  const devs = useLoad(() => get('/api/deviations'), [])
  const [tab, setTab] = useState('deviations')
  const [view, setView] = useState('board')
  const [status, setStatus] = useState('ALL')
  const [severity, setSeverity] = useState('ALL')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [showNew, setShowNew] = useState(false)

  const list = devs.data || []
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return list.filter(
      (d) =>
        (status === 'ALL' || d.status === status) &&
        (severity === 'ALL' || d.severity === severity) &&
        (!needle || [d.deviation_code, d.batch_number, d.product_name, d.description].some((v) => v?.toLowerCase().includes(needle))),
    )
  }, [list, status, severity, q])

  const count = (s) => list.filter((d) => d.status === s).length

  return (
    <div>
      <PageHeader
        title="Deviations & CAPA"
        subtitle="Investigate out-of-specification deviations, assign corrective and preventive actions, and track deadlines."
        icon={AlertTriangle}
        actions={can('QC_OFFICER', 'QA_OFFICER') && <button className="btn btn-danger" onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> Raise deviation</button>}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'deviations', label: 'Deviations', count: list.length },
          { id: 'capas', label: 'CAPA tracker' },
        ]}
      />

      {tab === 'deviations' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Chips
                value={status}
                onChange={setStatus}
                options={[
                  { id: 'ALL', label: 'All', count: list.length },
                  ...COLUMNS.map((c) => ({ id: c.id, label: c.title, count: count(c.id) })),
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-52">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input className="input pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="input !w-auto" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity filter">
                <option value="ALL">All severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="MAJOR">Major</option>
                <option value="MINOR">Minor</option>
              </select>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                <button className={cx('rounded-md p-1.5', view === 'board' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100')} onClick={() => setView('board')} aria-label="Board view"><Columns3 className="h-4 w-4" /></button>
                <button className={cx('rounded-md p-1.5', view === 'table' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100')} onClick={() => setView('table')} aria-label="Table view"><Table2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {devs.loading && !devs.data ? (
            <PageLoader />
          ) : devs.error ? (
            <ErrorBanner message={devs.error} onRetry={devs.reload} />
          ) : view === 'board' ? (
            <Board items={filtered} onOpen={setOpenId} />
          ) : filtered.length === 0 ? (
            <div className="card"><EmptyState title="No deviations found" hint="Adjust the filters, or raise a deviation from an OOS result." icon={CheckCircle2} /></div>
          ) : (
            <DeviationTable items={filtered} onOpen={setOpenId} />
          )}
        </>
      )}

      {tab === 'capas' && <CapaTracker onOpenDeviation={setOpenId} />}

      {openId && <DeviationModal deviationId={openId} onClose={() => setOpenId(null)} onChanged={devs.reload} />}
      {showNew && <NewDeviationModal onClose={() => setShowNew(false)} onCreated={(d) => { devs.reload(); setOpenId(d.id) }} />}
    </div>
  )
}
