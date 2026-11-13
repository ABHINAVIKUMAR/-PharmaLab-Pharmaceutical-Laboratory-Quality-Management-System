import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { ROLE_LABEL, useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../demo'
import { errMsg } from '../api/client'
import StatusBadge from './StatusBadge'

const NAV = [
  { to: '/', label: 'Quality Dashboard', icon: LayoutDashboard, end: true },
  { to: '/batches', label: 'Products & Batches', icon: Package },
  { to: '/testing', label: 'Sample Testing', icon: FlaskConical },
  { to: '/deviations', label: 'Deviations & CAPA', icon: AlertTriangle },
  { to: '/audit', label: 'Audit Trail', icon: ScrollText, roles: ['ADMIN'] },
  { to: '/users', label: 'Users & Roles', icon: Users, roles: ['ADMIN'] },
]

export default function Layout() {
  const { user, logout, login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const isDemo = user?.email?.endsWith('@pharmalab.io')
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))

  const switchRole = async (email) => {
    if (!email || email === user.email) return
    try {
      const next = await login(email, DEMO_PASSWORD)
      toast.success(`Switched to ${ROLE_LABEL[next.role]}`)
      navigate('/')
    } catch (err) {
      toast.error(errMsg(err))
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="rounded-xl bg-brand-500 p-2 text-white shadow-lg shadow-brand-900/40">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-bold leading-tight tracking-tight text-white">PharmaLab</p>
          <p className="text-[11px] font-medium uppercase tracking-widest text-brand-300">Quality Management</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        {isDemo && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Demo · switch role</p>
            <select
              value={user.email}
              onChange={(e) => switchRole(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-navy-800 px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {DEMO_ACCOUNTS.map((a) => (
                <option key={a.email} value={a.email}>
                  {a.title} – {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {user.full_name
              .split(' ')
              .filter((p) => !p.endsWith('.'))
              .slice(0, 2)
              .map((p) => p[0])
              .join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
            <p className="truncate text-xs text-slate-400">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              GxP-regulated workspace · all actions are audited
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
              <Activity className="h-3.5 w-3.5 text-emerald-500" /> System online
            </span>
            <StatusBadge value={user.role} text={ROLE_LABEL[user.role]} />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
