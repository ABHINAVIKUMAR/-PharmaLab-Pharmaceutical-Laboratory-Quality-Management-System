import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, TOKEN_KEY, USER_KEY } from '../api/client'

const AuthContext = createContext(null)

export const ROLE_LABEL = {
  LAB_TECHNICIAN: 'Lab Technician',
  QC_OFFICER: 'QC Officer',
  QA_OFFICER: 'QA Officer',
  ADMIN: 'Administrator',
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)
  const [ready, setReady] = useState(false)

  // Validate a stored token on first load
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setUser(null)
      setReady(true)
      return
    }
    api
      .get('/api/auth/me')
      .then((res) => {
        setUser(res.data)
        localStorage.setItem(USER_KEY, JSON.stringify(res.data))
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        setUser(null)
      })
      .finally(() => setReady(true))
  }, [])

  // The axios interceptor fires this when the API answers 401
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('pharmalab:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pharmalab:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, res.data.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  /** can('QC_OFFICER') -> true for QC and for ADMIN (admin has full access). */
  const can = useCallback(
    (...roles) => !!user && (user.role === 'ADMIN' || roles.includes(user.role)),
    [user],
  )

  const value = useMemo(() => ({ user, ready, login, logout, can }), [user, ready, login, logout, can])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
