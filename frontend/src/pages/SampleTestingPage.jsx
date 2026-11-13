import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileDown,
  FileUp,
  FlaskConical,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { downloadFile, errMsg, get, post, uploadFile } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { cx, fmtDateTime, fmtNum, useLoad } from '../utils'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import SpecGauge from '../components/SpecGauge'
import FlagOosModal from '../components/FlagOosModal'
import { Chips, EmptyState, ErrorBanner, Field, PageHeader, PageLoader, Spinner } from '../components/ui'

/** Same rule as the server: PASS iff min_limit <= value <= max_limit (a missing limit is unbounded). */
function evaluate(value, min, max) {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) return null
  const n = Number(value)
  if (min !== null && min !== undefined && n < min) return 'FAIL'
  if (max !== null && max !== undefined && n > max) return 'FAIL'
  return 'PASS'
}

function limitText(d) {
  const lo = d.min_limit
  const hi = d.max_limit
  if (lo != null && hi != null) return `${fmtNum(lo, 4)} – ${fmtNum(hi, 4)} ${d.unit}`
  if (lo != null) return `≥ ${fmtNum(lo, 4)} ${d.unit}`
  return `≤ ${fmtNum(hi, 4)} ${d.unit}`
}

/* ------------------------------------------------------------ register sample modal */
function RegisterSampleModal({ onClose, onCreated }) {
  const toast = useToast()
  const batches = useLoad(() => get('/api/batches'), [])
  const [batchId, setBatchId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const open = (batches.data || []).filter((b) => b.status === 'QUARANTINED' || b.status === 'TESTING')

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { batch_id: Number(batchId) }
      if (code.trim()) body.sample_code = code.trim()
      const sample = await post('/api/samples', body)
      toast.success(`Sample ${sample.sample_code} registered`)
      onCreated(sample)
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Register sample" subtitle="Registering the first sample moves a quarantined batch into TESTING.">
      {batches.loading && !batches.data ? (
        <PageLoader />
      ) : (
        <form onSubmit={save} className="space-y-4">
          <Field label="Batch">
            <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
              <option value="">Select a batch…</option>
              {open.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_number} – {b.product_name} ({b.status.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sample code (optional)" hint="Leave blank to generate one automatically (SMP-YYYYMMDD-####).">
            <input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value)} minLength={3} maxLength={40} placeholder="SMP-…" />
          </Field>
          {open.length === 0 && <p className="text-sm text-amber-700">There are no batches awaiting testing. Register a batch first.</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !batchId}>
              {busy && <Spinner className="!text-white" />} Register sample
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------ result entry form (live feedback) */
function EntryForm({ sample, def, onSaved }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [value, setValue] = useState('')
  const [remarks, setRemarks] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const verdict = evaluate(value, def.min_limit, def.max_limit)
  const hasBothLimits = def.min_limit != null && def.max_limit != null

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await post('/api/tests/results', {
        sample_id: sample.id,
        test_definition_id: def.id,
        measured_value: Number(value),
        remarks: remarks.trim() || undefined,
      })
      let note = ''
      if (file) {
        try {
          await uploadFile(file, result.id)
        } catch (err) {
          note = ` (report upload failed: ${errMsg(err)})`
        }
      }
      if (result.auto_status === 'FAIL') toast.error(`${def.test_name}: OUT OF SPECIFICATION – flagged as OOS${note}`)
      else toast.success(`${def.test_name}: PASS${note}`)
      onSaved()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,200px)_1fr]">
        <Field label={`Measured value${def.unit ? ` (${def.unit})` : ''}`}>
          <input type="number" step="any" className={cx('input', verdict === 'FAIL' && '!border-red-400 !ring-red-200', verdict === 'PASS' && '!border-emerald-400 !ring-emerald-200')} value={value} onChange={(e) => setValue(e.target.value)} required placeholder="Enter value" />
        </Field>
        <Field label="Remarks (optional)">
          <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} placeholder="Instrument ID, observations…" />
        </Field>
      </div>

      {/* real-time spec evaluation */}
      <div className={cx('rounded-lg border px-4 py-3 transition', verdict === 'FAIL' ? 'border-red-200 bg-red-50' : verdict === 'PASS' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            {verdict === 'FAIL' && (
              <span className="flex items-center gap-1.5 text-red-700"><XCircle className="h-4 w-4" /> FAIL – outside specification ({limitText(def)})</span>
            )}
            {verdict === 'PASS' && (
              <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> PASS – within specification ({limitText(def)})</span>
            )}
            {verdict === null && <span className="text-slate-500">Specification: {limitText(def)} — enter a value to evaluate</span>}
          </p>
          {verdict && <StatusBadge value={verdict} />}
        </div>
        {hasBothLimits && (
          <div className="mt-3 px-1">
            <SpecGauge min={def.min_limit} max={def.max_limit} value={verdict === null ? null : Number(value)} />
          </div>
        )}
        {verdict === 'FAIL' && <p className="mt-2 text-xs text-red-700">Submitting will automatically flag this result as Out-of-Specification (OOS) for QC review.</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.txt,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" /> {file ? 'Change report' : 'Attach test report'}
          </button>
          {file && (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              <Paperclip className="h-3.5 w-3.5" /> {file.name}
              <button type="button" className="ml-1 text-slate-400 hover:text-red-600" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }} aria-label="Remove file">×</button>
            </span>
          )}
        </div>
        <button className="btn btn-primary" disabled={busy || verdict === null}>
          {busy ? <Spinner className="!text-white" /> : <BadgeCheck className="h-4 w-4" />} Submit result
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------ recorded result */
function ResultView({ result: r, onChanged, onFlag }) {
  const { user, can } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const isOwn = r.tested_by === user.id
  const canVerify = can('QC_OFFICER') && !r.verified_by && (!isOwn || user.role === 'ADMIN')
  const canAttach = can('QC_OFFICER', 'QA_OFFICER') || (can('LAB_TECHNICIAN') && isOwn)
  const canRaise = can('QC_OFFICER', 'QA_OFFICER') && r.is_oos && !r.deviation_id

  const verify = async () => {
    setBusy(true)
    try {
      await post(`/api/tests/results/${r.id}/verify`)
      toast.success('Result verified')
      onChanged()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const attach = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      await uploadFile(file, r.id)
      toast.success('Report attached')
      onChanged()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className={cx('text-2xl font-bold', r.is_oos ? 'text-red-600' : 'text-slate-900')}>{fmtNum(r.measured_value, 4)}</span>
          <span className="text-sm text-slate-500">{r.unit}</span>
          <StatusBadge value={r.auto_status} />
          {r.is_oos && <span className="badge bg-red-600 text-white">OOS</span>}
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Tested by <b className="text-slate-700">{r.tested_by_name}</b></p>
          <p>{fmtDateTime(r.tested_at)}</p>
        </div>
      </div>
      {r.min_limit != null && r.max_limit != null && (
        <div className="px-1"><SpecGauge min={r.min_limit} max={r.max_limit} value={r.measured_value} /></div>
      )}
      {r.remarks && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">“{r.remarks}”</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {r.verified_by ? (
            <span className="badge bg-emerald-100 text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" /> Verified by {r.verified_by_name}</span>
          ) : (
            <span className="badge bg-amber-100 text-amber-800">Awaiting QC verification</span>
          )}
          {r.deviation_code && <span className="badge bg-slate-100 text-slate-700">{r.deviation_code}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.report_blob_url && (
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(r.report_blob_url).catch((e) => toast.error(errMsg(e)))}>
              <FileDown className="h-4 w-4" /> Report
            </button>
          )}
          {canAttach && (
            <>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.txt,.docx" onChange={(e) => attach(e.target.files?.[0])} />
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <FileUp className="h-4 w-4" /> {r.report_blob_url ? 'Replace' : 'Attach report'}
              </button>
            </>
          )}
          {canVerify && (
            <button className="btn btn-success btn-sm" disabled={busy} onClick={verify}>
              <ShieldCheck className="h-4 w-4" /> Verify
            </button>
          )}
          {can('QC_OFFICER') && !r.verified_by && isOwn && user.role !== 'ADMIN' && (
            <span className="text-[11px] text-slate-400">You cannot verify your own result</span>
          )}
          {canRaise && (
            <button className="btn btn-danger btn-sm" onClick={() => onFlag(r)}>
              <AlertTriangle className="h-4 w-4" /> Raise deviation
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ sample detail */
function SampleDetail({ sampleId, onChanged }) {
  const { can } = useAuth()
  const { data: s, loading, error, reload } = useLoad(() => get(`/api/samples/${sampleId}`), [sampleId])
  const [flagging, setFlagging] = useState(null)

  if (loading && !s) return <PageLoader />
  if (error && !s) return <ErrorBanner message={error} onRetry={reload} />
  if (!s) return null

  const refresh = () => {
    reload()
    onChanged()
  }
  const byDef = Object.fromEntries(s.results.map((r) => [r.test_definition_id, r]))
  const final = s.batch_status === 'APPROVED' || s.batch_status === 'REJECTED'
  const canEnter = can('LAB_TECHNICIAN', 'QC_OFFICER') && !final
  const done = s.test_definitions.filter((d) => byDef[d.id]).length

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mono text-lg font-bold text-slate-900">{s.sample_code}</p>
            <p className="text-sm text-slate-600">
              Batch <b className="mono">{s.batch_number}</b> · {s.product_name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Collected by {s.collected_by_name} · {fmtDateTime(s.collected_at)}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge value={s.status} />
            <span className="text-xs text-slate-500">Batch: <StatusBadge value={s.batch_status} /></span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className={cx('h-full rounded-full', s.oos_count ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${s.test_definitions.length ? (done / s.test_definitions.length) * 100 : 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {done} of {s.test_definitions.length} tests recorded
            {s.oos_count > 0 && <span className="ml-1 font-semibold text-red-600">· {s.oos_count} OOS</span>}
          </p>
        </div>
        {final && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">This batch is {s.batch_status.toLowerCase()}; results can no longer be entered.</p>}
      </div>

      {s.test_definitions.length === 0 && (
        <div className="card"><EmptyState title="No test specifications" hint="A QC Officer must define test specifications for this product first." icon={FlaskConical} /></div>
      )}

      {s.test_definitions.map((d) => {
        const r = byDef[d.id]
        return (
          <div key={d.id} className={cx('card p-5', r?.is_oos && 'ring-1 ring-red-300')}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-semibold text-slate-900">{d.test_name}</h4>
                <p className="text-xs text-slate-500">Specification: {limitText(d)}</p>
              </div>
              {d.mandatory ? <span className="badge bg-brand-50 text-brand-700">Mandatory</span> : <span className="badge bg-slate-100 text-slate-500">Optional</span>}
            </div>
            {r ? (
              <ResultView result={r} onChanged={refresh} onFlag={setFlagging} />
            ) : canEnter ? (
              <EntryForm sample={s} def={d} onSaved={refresh} />
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {final ? 'No result was recorded.' : 'Not yet tested. Only Lab Technicians and QC Officers can enter results.'}
              </p>
            )}
          </div>
        )
      })}

      <FlagOosModal result={flagging} onClose={() => setFlagging(null)} onDone={refresh} />
    </div>
  )
}

/* ====================================================================== page */
export default function SampleTestingPage() {
  const { can } = useAuth()
  const samples = useLoad(() => get('/api/samples'), [])
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [q, setQ] = useState('')
  const [showRegister, setShowRegister] = useState(false)

  const list = samples.data || []
  const counts = useMemo(() => {
    const c = { ALL: list.length, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0 }
    list.forEach((s) => { c[s.status] = (c[s.status] || 0) + 1 })
    return c
  }, [list])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return list.filter(
      (s) =>
        (filter === 'ALL' || s.status === filter) &&
        (!needle || s.sample_code.toLowerCase().includes(needle) || s.batch_number.toLowerCase().includes(needle) || s.product_name.toLowerCase().includes(needle)),
    )
  }, [list, filter, q])

  const activeId = selected ?? filtered[0]?.id ?? null

  return (
    <div>
      <PageHeader
        title="Sample Testing"
        subtitle="Register samples, enter raw results and see instantly whether they conform to specification."
        icon={FlaskConical}
        actions={
          can('LAB_TECHNICIAN', 'QC_OFFICER') && (
            <button className="btn btn-primary" onClick={() => setShowRegister(true)}>
              <Plus className="h-4 w-4" /> Register sample
            </button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="card self-start overflow-hidden">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder="Search sample, batch, product…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'ALL', label: 'All', count: counts.ALL },
                { id: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS },
                { id: 'PENDING', label: 'Pending', count: counts.PENDING },
                { id: 'COMPLETED', label: 'Done', count: counts.COMPLETED },
              ]}
            />
          </div>
          {samples.loading && !samples.data ? (
            <PageLoader />
          ) : samples.error ? (
            <div className="p-4"><ErrorBanner message={samples.error} onRetry={samples.reload} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No samples" hint="Register a sample to start entering test results." icon={FlaskConical} />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setSelected(s.id)} className={cx('w-full px-4 py-3 text-left transition hover:bg-slate-50', activeId === s.id && 'bg-brand-50 hover:bg-brand-50')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono font-semibold text-slate-900">{s.sample_code}</span>
                      <StatusBadge value={s.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{s.batch_number} · {s.product_name}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {s.result_count} result{s.result_count === 1 ? '' : 's'}
                      {s.oos_count > 0 && <span className="ml-1.5 font-semibold text-red-600">{s.oos_count} OOS</span>}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {activeId ? (
            <SampleDetail key={activeId} sampleId={activeId} onChanged={samples.reload} />
          ) : (
            <div className="card"><EmptyState title="Select a sample" hint="Choose a sample on the left, or register a new one." icon={FlaskConical} /></div>
          )}
        </div>
      </div>

      {showRegister && <RegisterSampleModal onClose={() => setShowRegister(false)} onCreated={(s) => { setSelected(s.id); setFilter('ALL'); samples.reload() }} />}
    </div>
  )
}
