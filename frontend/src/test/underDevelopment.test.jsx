import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { loading: false, isAuthenticated: true, isSuperuser: false, can: () => true }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
const toast = { success: vi.fn(), error: vi.fn() }
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }))
const content = vi.hoisted(() => ({ value: {} }))
vi.mock('../services/api', () => ({
  contentApi: {
    all: vi.fn(async () => content.value),
    save: vi.fn(async () => ({})),
  },
}))

const { contentApi } = await import('../services/api')
const { ContentProvider } = await import('../context/ContentContext')
const { RequirePermission } = await import('../components/RouteGuards')

const renderAt = (path) =>
  render(
    <ContentProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>الرئيسية</p>} />
          <Route
            path="/map"
            element={
              <RequirePermission perm="water.view">
                <p>صفحة الخريطة</p>
              </RequirePermission>
            }
          />
          <Route
            path="/water"
            element={
              <RequirePermission perm="water.view">
                <p>صفحة المياه</p>
              </RequirePermission>
            }
          />
        </Routes>
      </MemoryRouter>
    </ContentProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  auth.isSuperuser = false
  content.value = { 'site.wip_pages': ['/map'] }
})

describe('«قيد التطوير»', () => {
  it('everyone else — even an administrator — sees the «under development» screen instead of the page', async () => {
    renderAt('/map')
    expect(await screen.findByRole('heading', { name: 'الصفحة قيد التطوير' })).toBeInTheDocument()
    expect(screen.queryByText('صفحة الخريطة')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'العودة إلى الرئيسية' }))
    expect(screen.getByText('الرئيسية')).toBeInTheDocument()
  })

  it('the other pages are untouched', async () => {
    renderAt('/water')
    await screen.findByText('صفحة المياه')
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('الصفحة قيد التطوير')).not.toBeInTheDocument()
  })

  it('the developer sees the page, with a notice', async () => {
    auth.isSuperuser = true
    renderAt('/map')
    expect(await screen.findByText(/تظهر لك فقط/)).toBeInTheDocument()
    expect(screen.getByText('صفحة الخريطة')).toBeInTheDocument()
  })
})

describe('«الصفحات قيد التطوير» in the developer dashboard', () => {
  it('a switch per page saves the list', async () => {
    auth.isSuperuser = true
    auth.user = { is_superuser: true, username: 'dev' }
    content.value = {}
    const { default: DevPanelPage } = await import('../pages/DevPanelPage')
    render(
      <ContentProvider>
        <MemoryRouter initialEntries={['/dashboard?tab=manage']}>
          <DevPanelPage />
        </MemoryRouter>
      </ContentProvider>,
    )
    const mapSwitch = await screen.findByRole('switch', { name: 'الخريطة قيد التطوير' })
    expect(mapSwitch).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(mapSwitch)
    expect(contentApi.save).toHaveBeenCalledWith('site.wip_pages', ['/map'])
    expect(await screen.findByRole('switch', { name: 'الخريطة قيد التطوير' })).toHaveAttribute('aria-checked', 'true')
  })
})
