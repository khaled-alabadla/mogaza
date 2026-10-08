import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireEditor, RequireSearchAccess } from './components/RouteGuards'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import MainLayout from './layouts/MainLayout'
// The login page is the usual entry point, so it stays in the main bundle (no extra round trip);
// every other page is its own chunk, downloaded the first time it is visited (see MainLayout's Suspense).
import LoginPage from './pages/LoginPage'

const loadDashboard = () => import('./pages/DashboardPage')
const DashboardPage = lazy(loadDashboard)
// Opening the site on the search page: download its code in parallel with the session check
// instead of after it (the route guard renders the page only once /auth/me has answered).
if (window.location.pathname === '/') loadDashboard()
const WaterSchedulePage = lazy(() => import('./pages/WaterSchedulePage'))
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<MainLayout />}>
              <Route
                index
                element={
                  <RequireSearchAccess>
                    <DashboardPage />
                  </RequireSearchAccess>
                }
              />
              <Route
                path="water"
                element={
                  <RequireSearchAccess>
                    <WaterSchedulePage />
                  </RequireSearchAccess>
                }
              />
              <Route
                path="complaints"
                element={
                  <RequireEditor>
                    <ComplaintsPage />
                  </RequireEditor>
                }
              />
              <Route
                path="users"
                element={
                  <RequireAdmin>
                    <UsersPage />
                  </RequireAdmin>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <RequireAdmin>
                    <AuditLogsPage />
                  </RequireAdmin>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
