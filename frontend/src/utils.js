import { useCallback, useEffect, useRef, useState } from 'react'
import { errMsg } from './api/client'

export const cx = (...parts) => parts.filter(Boolean).join(' ')

/** 'YYYY-MM-DD' -> local date (avoids the UTC off-by-one of new Date('YYYY-MM-DD')). */
export function parseDate(value) {
  if (!value) return null
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtDate(value) {
  const d = parseDate(value)
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

/** The API returns naive UTC timestamps ("2026-11-12T08:30:00"); treat them as UTC, show them in local time. */
export function parseTs(iso) {
  if (!iso) return null
  const s = String(iso)
  return new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`)
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = parseTs(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits })
}

/** Today's date as YYYY-MM-DD in the user's local time zone. */
export function localToday() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const label = (s) => (s ? String(s).replaceAll('_', ' ') : '')

export function expiryInfo(daysToExpiry) {
  if (daysToExpiry <= 0) return { text: 'Expired', tone: 'red' }
  if (daysToExpiry <= 90) return { text: `${daysToExpiry} d left`, tone: 'amber' }
  if (daysToExpiry <= 365) return { text: `${Math.round(daysToExpiry / 30)} mo left`, tone: 'slate' }
  return { text: `${(daysToExpiry / 365).toFixed(1)} yr left`, tone: 'slate' }
}

/** Fetch helper: const { data, loading, error, reload } = useLoad(() => get('/api/x'), [dep]) */
export function useLoad(fn, deps = []) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((err) => alive && setState((s) => ({ data: s.data, loading: false, error: errMsg(err) })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

export function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
