import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { Field, Spinner } from './ui'
import { errMsg, post } from '../api/client'
import { useToast } from '../context/ToastContext'
import { fmtNum } from '../utils'

/** One-click deviation creation for an Out-of-Specification result. */
export default function FlagOosModal({ result, onClose, onDone }) {
  const toast = useToast()
  const [severity, setSeverity] = useState('MAJOR')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSeverity('MAJOR')
    setDescription('')
  }, [result?.id])

  if (!result) return null

  const submit = async () => {
    setBusy(true)
    try {
      const dev = await post(`/api/tests/results/${result.id}/flag-oos`, {
        severity,
        description: description.trim() || undefined,
      })
      toast.success(`Deviation ${dev.deviation_code} raised`)
      onDone?.(dev)
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Raise deviation for OOS result"
      subtitle={`${result.batch_number} · ${result.test_name}`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>
            {busy ? <Spinner className="!text-white" /> : <AlertTriangle className="h-4 w-4" />} Raise deviation
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <p className="font-semibold">Out of specification</p>
        <p className="mt-0.5">
          {result.test_name} measured <b>{fmtNum(result.measured_value, 4)} {result.unit}</b> — specification is{' '}
          {fmtNum(result.min_limit, 4)} to {fmtNum(result.max_limit, 4)} {result.unit}.
        </p>
      </div>
      <div className="space-y-4">
        <Field label="Severity">
          <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="MINOR">Minor – no impact on product quality</option>
            <option value="MAJOR">Major – potential impact on quality</option>
            <option value="CRITICAL">Critical – patient safety / compliance impact</option>
          </select>
        </Field>
        <Field label="Description (optional)" hint="Leave blank to auto-generate a description from the result.">
          <textarea className="input min-h-[90px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
      </div>
    </Modal>
  )
}
