import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  FlaskConical,
  Lock,
  Mail,
  ScrollText,
  ShieldCheck,
  User,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../demo'
import { errMsg, post } from '../api/client'
import { Spinner } from '../components/ui'
import StatusBadge from '../components/StatusBadge'

const FEATURES = [
  { icon: BadgeCheck, text: 'Automatic PASS / FAIL evaluation against test specifications' },
  { icon: AlertTriangle, text: 'One-click OOS deviations with full CAPA tracking' },
  { icon: ShieldCheck, text: 'Role-based access control for every QC workflow' },
  { icon: ScrollText, text: 'Immutable, 21 CFR Part 11-inspired audit trail' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const signIn = async (email, password) => {
    setBusy(true)
    setError('')
    try {
      await login(email, password)
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (mode === 'login') return signIn(form.email, form.password)
    setBusy(true)
    setError('')
    try {
      await post('/api/auth/register', form)
      await login(form.email, form.password)
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-brand-500 p-2.5 shadow-lg shadow-black/30">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight">PharmaLab</p>
            <p className="text-[11px] font-medium uppercase tracking-widest text-brand-300">Laboratory QMS</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            From batch registration to release —<span className="text-brand-300"> every result traceable.</span>
          </h1>
          <p className="mt-4 text-slate-300">
            A secure cloud-based platform for pharmaceutical batches, laboratory test results, quality deviations,
            corrective actions and quality analytics.
          </p>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="rounded-lg bg-white/10 p-2 text-brand-300">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">React · FastAPI · PostgreSQL / Azure SQL · Azure Blob Storage</p>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="rounded-xl bg-brand-600 p-2.5 text-white">
              <FlaskConical className="h-5 w-5" />
            </div>
            <p className="text-xl font-bold text-slate-900">PharmaLab QMS</p>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create a technician account'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'login'
              ? 'Use your laboratory credentials, or pick a demo role below.'
              : 'New accounts start as Lab Technician; an administrator can change the role later.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="full_name">Full name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input id="full_name" className="input pl-9" value={form.full_name} onChange={set('full_name')} required minLength={2} placeholder="Jane Doe" />
                </div>
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input id="email" type="email" className="input pl-9" value={form.email} onChange={set('email')} required placeholder="you@pharmalab.io" autoComplete="username" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  className="input pl-9"
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
              {busy ? <Spinner className="!text-white" /> : null}
              {mode === 'login' ? 'Sign in' : 'Create account'}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            {mode === 'login' ? 'No account yet?' : 'Already registered?'}{' '}
            <button
              className="font-semibold text-brand-700 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
              }}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>

          {/* demo role switcher */}
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Demo accounts · one-click sign in</p>
              <span className="text-[11px] text-slate-400">password: {DEMO_PASSWORD}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setForm((f) => ({ ...f, email: a.email, password: DEMO_PASSWORD }))
                    setMode('login')
                    signIn(a.email, DEMO_PASSWORD)
                  }}
                  className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
                >
                  <StatusBadge value={a.role} text={a.title} />
                  <p className="mt-2 text-sm font-semibold text-slate-800">{a.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{a.blurb}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
