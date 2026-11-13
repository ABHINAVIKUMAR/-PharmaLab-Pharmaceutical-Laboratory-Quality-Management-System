import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import { PageLoader } from './components/ui'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProductsBatchesPage from './pages/ProductsBatchesPage'
import SampleTestingPage from './pages/SampleTestingPage'
import DeviationsCapaPage from './pages/DeviationsCapaPage'
import AuditTrailPage from './pages/AuditTrailPage'
import UserManagementPage from './pages/UserManagementPage'

function Protected({ roles }) {
  const { user, ready } = useAuth()
  if (!ready) return <PageLoader text="Checking your session…" />
  if (!user) return <Navigate to="/login" replace />
  if (roles && user.role !== 'ADMIN' && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <Outlet />
}

function LoginRoute() {
  const { user, ready } = useAuth()
  if (!ready) return <PageLoader />
  return user ? <Navigate to="/" replace /> : <LoginPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="batches" element={<ProductsBatchesPage />} />
          <Route path="testing" element={<SampleTestingPage />} />
          <Route path="deviations" element={<DeviationsCapaPage />} />
          <Route element={<Protected roles={['ADMIN']} />}>
            <Route path="audit" element={<AuditTrailPage />} />
            <Route path="users" element={<UserManagementPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
