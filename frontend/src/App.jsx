import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import LoadingState from './components/LoadingState'
import { RequireAdmin, RequirePermission } from './components/RouteGuards'
import { AuthProvider } from './context/AuthContext'
import { ContentProvider } from './context/ContentContext'
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
const InquiriesPage = lazy(() => import('./pages/InquiriesPage'))
const GuidePage = lazy(() => import('./pages/GuidePage'))
const UrgentComplaintsPage = lazy(() => import('./pages/UrgentComplaintsPage'))
const DailyReportPage = lazy(() => import('./pages/DailyReportPage'))
const ComplaintsReportPage = lazy(() => import('./pages/ComplaintsReportPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
// the developer's hidden control panel («/dashboard»): linked from nowhere
const DevPanelPage = lazy(() => import('./pages/DevPanelPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ContentProvider>
          <ToastProvider>
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
          </ToastProvider>
        </ContentProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
