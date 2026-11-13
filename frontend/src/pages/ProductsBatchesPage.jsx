import { useMemo, useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, FileDown, FlaskConical, Package, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { del, downloadFile, errMsg, get, post, put } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { cx, expiryInfo, fmtDate, fmtDateTime, fmtNum, localToday, useLoad } from '../utils'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { Chips, EmptyState, ErrorBanner, Field, PageHeader, PageLoader, Spinner, Tabs } from '../components/ui'

const today = localToday

/* ---------------------------------------------------------------- progress bar */
function ProgressBar({ p }) {
  const pct = p.percent_complete
  const color = p.failed > 0 ? 'bg-red-500' : pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'
  return (
    <div className="min-w-[110px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {p.mandatory_tested}/{p.mandatory_total} mandatory
        {p.failed > 0 && <span className="ml-1 font-semibold text-red-600">· {p.failed} OOS</span>}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- product modal */
function ProductModal({ product, onClose, onSaved }) {
  const toast = useToast()
  const editing = !!product?.id
  const [form, setForm] = useState({
    product_code: product?.product_code || '',
    name: product?.name || '',
    dosage_form: product?.dosage_form || 'Tablet',
    active_ingredient: product?.active_ingredient || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (editing) {
        await put(`/api/products/${product.id}`, { name: form.name, dosage_form: form.dosage_form, active_ingredient: form.active_ingredient })
      } else {
        await post('/api/products', form)
      }
      toast.success(editing ? 'Product updated' : 'Product registered')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit product' : 'Register product'}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product code">
            <input className="input uppercase" value={form.product_code} onChange={set('product_code')} required minLength={2} disabled={editing} placeholder="PCM-500" />
          </Field>
          <Field label="Dosage form">
            <select className="input" value={form.dosage_form} onChange={set('dosage_form')}>
              {['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Cream', 'Suspension', 'Drops', 'Powder'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Product name">
          <input className="input" value={form.name} onChange={set('name')} required minLength={2} placeholder="Paracetamol 500mg Tablets" />
        </Field>
        <Field label="Active ingredient">
          <input className="input" value={form.active_ingredient} onChange={set('active_ingredient')} required minLength={2} placeholder="Paracetamol" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="!text-white" />} Save product</button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------ test spec modal */
function SpecModal({ product, spec, onClose, onSaved }) {
  const toast = useToast()
  const editing = !!spec?.id
  const [form, setForm] = useState({
    test_name: spec?.test_name || '',
    min_limit: spec?.min_limit ?? '',
    max_limit: spec?.max_limit ?? '',
    unit: spec?.unit || '',
    mandatory: spec?.mandatory ?? true,
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const body = { ...form, min_limit: Number(form.min_limit), max_limit: Number(form.max_limit) }
    try {
      if (editing) await put(`/api/tests/definitions/${spec.id}`, body)
      else await post('/api/tests/definitions', { ...body, product_id: product.id })
      toast.success(editing ? 'Specification updated' : 'Specification added')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit test specification' : 'Add test specification'} subtitle={product.name}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Test name">
          <input className="input" value={form.test_name} onChange={set('test_name')} required placeholder="Assay, Dissolution, pH, Microbial Limit…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Min limit">
            <input type="number" step="any" className="input" value={form.min_limit} onChange={set('min_limit')} required />
          </Field>
          <Field label="Max limit">
            <input type="number" step="any" className="input" value={form.max_limit} onChange={set('max_limit')} required />
          </Field>
          <Field label="Unit">
            <input className="input" value={form.unit} onChange={set('unit')} required placeholder="% / pH / CFU/g" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={form.mandatory} onChange={set('mandatory')} />
          Mandatory for batch release
        </label>
        {editing && <p className="text-xs text-slate-500">Limits are locked once results have been recorded against a specification.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="!text-white" />} Save</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- batch modal */
function BatchModal({ products, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({
    batch_number: '',
    product_id: products[0]?.id || '',
    manufacturing_date: today(),
    expiry_date: '',
    quantity: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post('/api/batches', { ...form, product_id: Number(form.product_id), quantity: Number(form.quantity) })
      toast.success('Batch registered and placed in quarantine')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Register batch" subtitle="New batches start in QUARANTINED status until testing begins.">
      <form onSubmit={save} className="space-y-4">
        <Field label="Product">
          <select className="input" value={form.product_id} onChange={set('product_id')} required>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.product_code} – {p.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch number">
            <input className="input uppercase" value={form.batch_number} onChange={set('batch_number')} required minLength={3} placeholder="PCM-2611-010" />
          </Field>
          <Field label="Quantity (units)">
            <input type="number" min="1" className="input" value={form.quantity} onChange={set('quantity')} required />
          </Field>
          <Field label="Manufacturing date">
            <input type="date" max={today()} className="input" value={form.manufacturing_date} onChange={set('manufacturing_date')} required />
          </Field>
          <Field label="Expiry date">
            <input type="date" min={form.manufacturing_date} className="input" value={form.expiry_date} onChange={set('expiry_date')} required />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="!text-white" />} Register batch</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- batch detail */
function BatchDetail({ batchId, onClose, onChanged }) {
  const { can, user } = useAuth()
  const toast = useToast()
  const { data: b, loading, error, reload } = useLoad(() => get(`/api/batches/${batchId}`), [batchId])
  const [busy, setBusy] = useState(false)
  const [reject, setReject] = useState(false)
  const [remarks, setRemarks] = useState('')

  const act = async (status, extra = {}) => {
    setBusy(true)
    try {
      await post(`/api/batches/${batchId}/status`, { status, ...extra })
      toast.success(status === 'APPROVED' ? 'Batch approved and released' : status === 'REJECTED' ? 'Batch rejected' : 'Status updated')
      setReject(false)
      setRemarks('')
      reload()
      onChanged()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const isQA = can('QA_OFFICER')
  const final = b && (b.status === 'APPROVED' || b.status === 'REJECTED')

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={b ? b.batch_number : 'Batch'}
      subtitle={b ? `${b.product_name} · ${b.dosage_form}` : undefined}
    >
      {loading && !b ? (
        <PageLoader />
      ) : error ? (
        <ErrorBanner message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Status', <StatusBadge key="s" value={b.status} />],
              ['Quantity', `${b.quantity.toLocaleString()} units`],
              ['Manufactured', fmtDate(b.manufacturing_date)],
              ['Expiry', <span key="e" className={cx(b.is_expired && 'font-semibold text-red-600')}>{fmtDate(b.expiry_date)} · {expiryInfo(b.days_to_expiry).text}</span>],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</p>
                <div className="mt-1 text-sm font-medium text-slate-900">{v}</div>
              </div>
            ))}
          </div>

          {/* QA release panel */}
          {!final && (
            <div className={cx('rounded-xl border p-4', b.blockers.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cx('flex items-center gap-2 text-sm font-bold', b.blockers.length ? 'text-amber-900' : 'text-emerald-900')}>
                    {b.blockers.length ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    {b.blockers.length ? 'Release criteria not met' : 'All release criteria met – ready for QA release'}
                  </p>
                  {b.blockers.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-900">
                      {b.blockers.map((x) => <li key={x}>{x}</li>)}
                    </ul>
                  )}
                </div>
                {isQA && b.status === 'TESTING' && !reject && (
                  <div className="flex gap-2">
                    <button className="btn btn-success" disabled={busy || b.blockers.length > 0} onClick={() => act('APPROVED')}>
                      <CheckCircle2 className="h-4 w-4" /> Approve & release
                    </button>
                    <button className="btn btn-danger" disabled={busy} onClick={() => setReject(true)}>
                      <Ban className="h-4 w-4" /> Reject
                    </button>
                  </div>
                )}
                {isQA && b.status === 'QUARANTINED' && !reject && (
                  <button className="btn btn-danger" disabled={busy} onClick={() => setReject(true)}>
                    <Ban className="h-4 w-4" /> Reject
                  </button>
                )}
              </div>
              {reject && (
                <div className="mt-3 space-y-2">
                  <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason for rejection (required)…" />
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => setReject(false)}>Cancel</button>
                    <button className="btn btn-danger btn-sm" disabled={busy || remarks.trim().length < 5} onClick={() => act('REJECTED', { reason: remarks.trim() })}>
                      Confirm rejection
                    </button>
                  </div>
                </div>
              )}
              {!isQA && <p className="mt-2 text-xs text-slate-500">Only QA Officers can approve or reject batches.</p>}
            </div>
          )}

          {/* test progress */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
              <ClipboardList className="h-4 w-4 text-brand-600" /> Test progress ({b.progress.mandatory_tested}/{b.progress.mandatory_total} mandatory)
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="tbl">
                <thead>
                  <tr><th>Test</th><th>Specification</th><th>Latest result</th><th>Status</th><th>Verified</th><th /></tr>
                </thead>
                <tbody>
                  {b.tests.map(({ definition: d, result: r, status }) => (
                    <tr key={d.id}>
                      <td>
                        <p className="font-medium text-slate-900">{d.test_name}</p>
                        <p className="text-[11px] text-slate-500">{d.mandatory ? 'Mandatory' : 'Optional'}</p>
                      </td>
                      <td className="text-slate-600">{fmtNum(d.min_limit)} – {fmtNum(d.max_limit)} {d.unit}</td>
                      <td className={cx('font-semibold', r?.auto_status === 'FAIL' && 'text-red-600')}>{r ? `${fmtNum(r.measured_value, 4)} ${d.unit}` : '—'}</td>
                      <td>{status === 'PENDING' ? <span className="badge bg-slate-100 text-slate-500">Not tested</span> : <StatusBadge value={status} />}</td>
                      <td className="text-xs text-slate-500">{r?.verified_by_name || (r ? 'Pending' : '—')}</td>
                      <td>
                        {r?.report_blob_url && (
                          <button className="btn btn-ghost btn-sm" title="Download report" onClick={() => downloadFile(r.report_blob_url).catch((e) => toast.error(errMsg(e)))}>
                            <FileDown className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {b.tests.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500">No test specifications defined for this product.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><FlaskConical className="h-4 w-4 text-brand-600" /> Samples ({b.samples.length})</h4>
              {b.samples.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No samples registered yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {b.samples.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="mono font-semibold">{s.sample_code}</span>
                      <span className="flex items-center gap-2"><span className="text-xs text-slate-500">{fmtDateTime(s.collected_at)}</span><StatusBadge value={s.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><AlertTriangle className="h-4 w-4 text-red-500" /> Deviations ({b.deviations.length})</h4>
              {b.deviations.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No deviations raised.</p>
              ) : (
                <ul className="space-y-1.5">
                  {b.deviations.map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span><span className="mono font-semibold">{d.deviation_code}</span> <span className="text-xs text-slate-500">{d.test_name}</span></span>
                      <span className="flex gap-1.5"><StatusBadge value={d.severity} /><StatusBadge value={d.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ====================================================================== page */
export default function ProductsBatchesPage() {
  const { can } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('batches')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [showBatch, setShowBatch] = useState(false)
  const [productModal, setProductModal] = useState(null) // {} for new, product for edit
  const [specModal, setSpecModal] = useState(null) // { product, spec }
  const [expanded, setExpanded] = useState(null)

  const batches = useLoad(() => get('/api/batches'), [])
  const products = useLoad(() => get('/api/products'), [])
  const specs = useLoad(() => get('/api/tests/definitions'), [])

  const canManage = can('QC_OFFICER', 'QA_OFFICER')
  const canSpec = can('QC_OFFICER')

  const filtered = useMemo(() => {
    const list = batches.data || []
    const needle = q.trim().toLowerCase()
    return list.filter(
      (b) =>
        (statusFilter === 'ALL' || b.status === statusFilter) &&
        (!needle || b.batch_number.toLowerCase().includes(needle) || b.product_name.toLowerCase().includes(needle)),
    )
  }, [batches.data, statusFilter, q])

  const counts = useMemo(() => {
    const c = { ALL: 0 }
    ;(batches.data || []).forEach((b) => {
      c.ALL += 1
      c[b.status] = (c[b.status] || 0) + 1
    })
    return c
  }, [batches.data])

  const refreshAll = () => {
    batches.reload()
    products.reload()
    specs.reload()
  }

  const deleteProduct = async (p) => {
    if (!window.confirm(`Delete product ${p.product_code}? This also removes its test specifications.`)) return
    try {
      await del(`/api/products/${p.id}`)
      toast.success('Product deleted')
      refreshAll()
    } catch (err) {
      toast.error(errMsg(err))
    }
  }

  const deleteSpec = async (s) => {
    if (!window.confirm(`Delete specification "${s.test_name}"?`)) return
    try {
      await del(`/api/tests/definitions/${s.id}`)
      toast.success('Specification deleted')
      specs.reload()
      products.reload()
    } catch (err) {
      toast.error(errMsg(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Products & Batches"
        subtitle="Register products and batches, track expiry, inspect test progress and release or reject batches."
        icon={Package}
        actions={
          canManage && (
            <>
              <button className="btn btn-secondary" onClick={() => setProductModal({})}><Plus className="h-4 w-4" /> Product</button>
              <button className="btn btn-primary" onClick={() => setShowBatch(true)} disabled={!products.data?.length}><Plus className="h-4 w-4" /> Register batch</button>
            </>
          )
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'batches', label: 'Batches', count: batches.data?.length },
          { id: 'products', label: 'Products & specifications', count: products.data?.length },
        ]}
      />

      {tab === 'batches' && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <Chips
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { id: 'ALL', label: 'All', count: counts.ALL },
                ...['QUARANTINED', 'TESTING', 'APPROVED', 'REJECTED'].map((s) => ({ id: s, label: s.charAt(0) + s.slice(1).toLowerCase(), count: counts[s] || 0 })),
              ]}
            />
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder="Search batch or product…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {batches.loading && !batches.data ? (
            <PageLoader />
          ) : batches.error ? (
            <div className="p-4"><ErrorBanner message={batches.error} onRetry={batches.reload} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No batches found" hint="Try another status filter or search term." icon={Package} />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl tbl-hover">
                <thead>
                  <tr><th>Batch</th><th>Product</th><th>Manufactured</th><th>Expiry</th><th>Qty</th><th>Test progress</th><th>Deviations</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const exp = expiryInfo(b.days_to_expiry)
                    return (
                      <tr key={b.id} onClick={() => setSelected(b.id)}>
                        <td className="mono font-semibold text-slate-900">{b.batch_number}</td>
                        <td>
                          <p className="font-medium text-slate-800">{b.product_name}</p>
                          <p className="text-xs text-slate-500">{b.product_code}</p>
                        </td>
                        <td className="whitespace-nowrap text-slate-600">{fmtDate(b.manufacturing_date)}</td>
                        <td className="whitespace-nowrap">
                          <p className="text-slate-600">{fmtDate(b.expiry_date)}</p>
                          <p className={cx('text-xs font-semibold', exp.tone === 'red' ? 'text-red-600' : exp.tone === 'amber' ? 'text-amber-600' : 'text-slate-400')}>{exp.text}</p>
                        </td>
                        <td className="text-slate-600">{b.quantity.toLocaleString()}</td>
                        <td><ProgressBar p={b.progress} /></td>
                        <td>
                          {b.progress.open_deviations > 0 ? (
                            <span className="badge bg-red-100 text-red-800">{b.progress.open_deviations} open</span>
                          ) : (
                            <span className="text-xs text-slate-400">None</span>
                          )}
                        </td>
                        <td><StatusBadge value={b.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-3">
          {products.loading && !products.data ? (
            <PageLoader />
          ) : (
            (products.data || []).map((p) => {
              const productSpecs = (specs.data || []).filter((s) => s.product_id === p.id)
              const open = expanded === p.id
              return (
                <div key={p.id} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpanded(open ? null : p.id)}>
                      <div className="rounded-lg bg-brand-50 p-2.5 text-brand-700"><FlaskConical className="h-5 w-5" /></div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500"><span className="mono">{p.product_code}</span> · {p.dosage_form} · {p.active_ingredient}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="badge bg-slate-100 text-slate-600">{p.batch_count} batches</span>
                      <span className="badge bg-brand-50 text-brand-700">{p.test_count} tests</span>
                      {canManage && <button className="btn btn-ghost btn-sm" onClick={() => setProductModal(p)} aria-label="Edit product"><Pencil className="h-4 w-4" /></button>}
                      {can() && p.batch_count === 0 && <button className="btn btn-ghost btn-sm text-red-600" onClick={() => deleteProduct(p)} aria-label="Delete product"><Trash2 className="h-4 w-4" /></button>}
                      <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(open ? null : p.id)}>{open ? 'Hide specs' : 'View specs'}</button>
                    </div>
                  </div>
                  {open && (
                    <div className="border-t border-slate-200 bg-slate-50/60 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">Test specifications</p>
                        {canSpec && <button className="btn btn-primary btn-sm" onClick={() => setSpecModal({ product: p })}><Plus className="h-3.5 w-3.5" /> Add test</button>}
                      </div>
                      {productSpecs.length === 0 ? (
                        <p className="rounded-lg bg-white p-4 text-sm text-slate-500">No specifications defined yet{canSpec ? ' – add the first test above.' : '.'}</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="tbl">
                            <thead><tr><th>Test</th><th>Min</th><th>Max</th><th>Unit</th><th>Required</th><th /></tr></thead>
                            <tbody>
                              {productSpecs.map((s) => (
                                <tr key={s.id}>
                                  <td className="font-medium text-slate-900">{s.test_name}</td>
                                  <td>{fmtNum(s.min_limit, 4)}</td>
                                  <td>{fmtNum(s.max_limit, 4)}</td>
                                  <td className="text-slate-500">{s.unit}</td>
                                  <td>{s.mandatory ? <span className="badge bg-brand-50 text-brand-700">Mandatory</span> : <span className="badge bg-slate-100 text-slate-500">Optional</span>}</td>
                                  <td className="text-right">
                                    {canSpec && (
                                      <>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setSpecModal({ product: p, spec: s })} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                                        <button className="btn btn-ghost btn-sm text-red-600" onClick={() => deleteSpec(s)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
          {products.data?.length === 0 && <div className="card"><EmptyState title="No products yet" hint="Register your first product to begin." /></div>}
        </div>
      )}

      {selected && <BatchDetail batchId={selected} onClose={() => setSelected(null)} onChanged={refreshAll} />}
      {showBatch && <BatchModal products={products.data || []} onClose={() => setShowBatch(false)} onSaved={refreshAll} />}
      {productModal && <ProductModal product={productModal} onClose={() => setProductModal(null)} onSaved={refreshAll} />}
      {specModal && <SpecModal product={specModal.product} spec={specModal.spec} onClose={() => setSpecModal(null)} onSaved={refreshAll} />}
    </div>
  )
}
