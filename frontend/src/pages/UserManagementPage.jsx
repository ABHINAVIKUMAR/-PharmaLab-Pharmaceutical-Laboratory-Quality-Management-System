import { useState } from 'react'
import { KeyRound, Pencil, Plus, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { errMsg, get, post, put } from '../api/client'
import { ROLE_LABEL, useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { fmtDateTime, useLoad } from '../utils'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { EmptyState, ErrorBanner, Field, PageHeader, PageLoader, Spinner } from '../components/ui'

const ROLES = Object.keys(ROLE_LABEL)

const ROLE_HELP = {
  LAB_TECHNICIAN: 'Registers samples, enters raw results, uploads test reports.',
  QC_OFFICER: 'Defines specifications, verifies results, raises OOS deviations.',
  QA_OFFICER: 'Manages deviations & CAPA, approves or rejects batches.',
  ADMIN: 'Full system access, user management and audit log.',
}

function UserModal({ target, onClose, onSaved }) {
  const toast = useToast()
  const { user: me } = useAuth()
  const editing = !!target?.id
  const isSelf = editing && target.id === me.id
  const [form, setForm] = useState({
    full_name: target?.full_name || '',
    email: target?.email || '',
    password: '',
    role: target?.role || 'LAB_TECHNICIAN',
    is_active: target?.is_active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (editing) {
        const body = { full_name: form.full_name.trim(), role: form.role, is_active: form.is_active }
        if (form.password) body.password = form.password
        await put(`/api/auth/users/${target.id}`, body)
        toast.success('User updated')
      } else {
        await post('/api/auth/users', { full_name: form.full_name.trim(), email: form.email.trim(), password: form.password, role: form.role })
        toast.success('User created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit user' : 'Add user'} subtitle={editing ? target.email : 'Create an account and assign a role.'}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Full name">
          <input className="input" value={form.full_name} onChange={set('full_name')} required minLength={2} maxLength={120} />
        </Field>
        {!editing && (
          <Field label="Email">
            <input type="email" className="input" value={form.email} onChange={set('email')} required />
          </Field>
        )}
        <Field label={editing ? 'Reset password (optional)' : 'Password'} hint="8–72 characters.">
          <input type="password" className="input" value={form.password} onChange={set('password')} required={!editing} minLength={8} maxLength={72} autoComplete="new-password" />
        </Field>
        <Field label="Role" hint={ROLE_HELP[form.role]}>
          <select className="input" value={form.role} onChange={set('role')} disabled={isSelf}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        {editing && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={form.is_active} onChange={set('is_active')} disabled={isSelf} />
            Account is active
          </label>
        )}
        {isSelf && <p className="text-xs text-slate-500">You cannot change the role or deactivate your own account.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="!text-white" />} {editing ? 'Save changes' : 'Create user'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function UserManagementPage() {
  const { user: me } = useAuth()
  const { data, loading, error, reload } = useLoad(() => get('/api/auth/users'), [])
  const [modal, setModal] = useState(null)

  const users = data || []
  const countBy = (r) => users.filter((u) => u.role === r).length

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        subtitle="Create accounts, assign roles and deactivate access. Every change is written to the audit trail."
        icon={Users}
        actions={<button className="btn btn-primary" onClick={() => setModal({})}><UserPlus className="h-4 w-4" /> Add user</button>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="card p-4">
            <div className="flex items-center justify-between">
              <StatusBadge value={r} text={ROLE_LABEL[r]} />
              <span className="text-2xl font-bold text-slate-900">{countBy(r)}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading && !data ? (
          <PageLoader />
        ) : error && !data ? (
          <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>
        ) : users.length === 0 ? (
          <EmptyState title="No users" icon={Users} action={<button className="btn btn-primary" onClick={() => setModal({})}><Plus className="h-4 w-4" /> Add user</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>User</th><th>Role</th><th>Status</th><th>Created</th><th /></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-semibold text-slate-900">
                        {u.full_name} {u.id === me.id && <span className="badge ml-1 bg-brand-50 text-brand-700"><ShieldCheck className="h-3 w-3" /> You</span>}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td><StatusBadge value={u.role} text={ROLE_LABEL[u.role]} /></td>
                    <td><StatusBadge value={u.is_active ? 'ACTIVE' : 'INACTIVE'} text={u.is_active ? 'Active' : 'Deactivated'} /></td>
                    <td className="whitespace-nowrap text-slate-500">{fmtDateTime(u.created_at)}</td>
                    <td className="text-right">
                      <button className="btn btn-secondary btn-sm" onClick={() => setModal(u)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button className="btn btn-ghost btn-sm" title="Reset password" onClick={() => setModal(u)} aria-label="Reset password"><KeyRound className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <UserModal target={modal} onClose={() => setModal(null)} onSaved={reload} />}
    </div>
  )
}
