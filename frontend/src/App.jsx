import { Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingState from './components/LoadingState'
import { RequireAdmin, RequireHome, RequirePermission } from './components/RouteGuards'
import { AuthProvider } from './context/AuthContext'
import { ContentProvider } from './context/ContentContext'
import { ToastProvider } from './context/ToastContext'
import MainLayout from './layouts/MainLayout'
// The login page is the usual entry point, so it stays in the main bundle (no extra round trip);
// every other page is its own chunk, downloaded the first time it is visited (see MainLayout's Suspense).
import LoginPage from './pages/LoginPage'
import { lazyPage } from './utils/lazyPage'

const loadHome = () => import('./pages/HomePage')
const HomePage = lazyPage(loadHome)
const loadDashboard = () => import('./pages/DashboardPage')
const DashboardPage = lazyPage(loadDashboard)
// Opening the site on the home / search page: download its code in parallel with the session check
// instead of after it (the route guard renders the page only once /auth/me has answered).
if (window.location.pathname === '/') loadHome().catch(() => {}) // a failure is handled when the page renders
if (window.location.pathname === '/search') loadDashboard().catch(() => {})
const WaterSchedulePage = lazyPage(() => import('./pages/WaterSchedulePage'))
const ComplaintsPage = lazyPage(() => import('./pages/ComplaintsPage'))
const InquiriesPage = lazyPage(() => import('./pages/InquiriesPage'))
const GuidePage = lazyPage(() => import('./pages/GuidePage'))
const CommitteesPage = lazyPage(() => import('./pages/CommitteesPage'))
const CircularsPage = lazyPage(() => import('./pages/CircularsPage'))
const UrgentComplaintsPage = lazyPage(() => import('./pages/UrgentComplaintsPage'))
const DailyReportPage = lazyPage(() => import('./pages/DailyReportPage'))
const ComplaintsReportPage = lazyPage(() => import('./pages/ComplaintsReportPage'))
const UsersPage = lazyPage(() => import('./pages/UsersPage'))
const AuditLogsPage = lazyPage(() => import('./pages/AuditLogsPage'))
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'))
// the developer's hidden control panel («/dashboard»): linked from nowhere
const DevPanelPage = lazyPage(() => import('./pages/DevPanelPage'))

/** A page that fails shows «تعذر عرض الصفحة» instead of a blank screen; another page tries again. */
function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ContentProvider>
          <ToastProvider>
            <RouteErrorBoundary>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/dashboard"
                  element={
                    <Suspense fallback={<LoadingState />}>
                      <DevPanelPage />
                    </Suspense>
                  }
                />
                {/* printable reports («تصدير PDF»): a bare A4 document, without the navbar / footer */}
                <Route
                  path="complaints/report"
                  element={
                    <RequirePermission perm="complaints.export">
                      <Suspense fallback={<LoadingState />}>
                        <ComplaintsReportPage kind="complaint" />
                      </Suspense>
                    </RequirePermission>
                  }
                />
                <Route
                  path="inquiries/report"
                  element={
                    <RequirePermission perm="inquiries.export">
                      <Suspense fallback={<LoadingState />}>
                        <ComplaintsReportPage kind="inquiry" />
                      </Suspense>
                    </RequirePermission>
                  }
                />
                <Route element={<MainLayout />}>
                  <Route
                    index
                    element={
                      <RequireHome>
                        <HomePage />
                      </RequireHome>
                    }
                  />
                  <Route
                    path="search"
                    element={
                      <RequirePermission perm="search.view">
                        <DashboardPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="water"
                    element={
                      <RequirePermission perm="water.view">
                        <WaterSchedulePage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="guide"
                    element={
                      <RequirePermission perm="guide.view">
                        <GuidePage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="committees"
                    element={
                      <RequirePermission perm="committees.view">
                        <CommitteesPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="circulars"
                    element={
                      <RequirePermission perm="circulars.view">
                        <CircularsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="daily-report"
                    element={
                      <RequirePermission perm="report.view">
                        <DailyReportPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="urgent"
                    element={
                      <RequirePermission perm="urgent.view">
                        <UrgentComplaintsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="complaints"
                    element={
                      <RequirePermission perm="complaints.view">
                        <ComplaintsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="inquiries"
                    element={
                      <RequirePermission perm="inquiries.view">
                        <InquiriesPage />
                      </RequirePermission>
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
            </RouteErrorBoundary>
          </ToastProvider>
        </ContentProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
