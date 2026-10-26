import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useRef, useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from '../components/Modal'
import { firstAllowedPath, visibleLinks, visibleSections } from '../components/navLinks'
import PageHeader from '../components/PageHeader'
import SearchInput from '../components/SearchInput'
import { checkPermission, permissionsOf } from '../context/permissions'
import useDismiss from '../hooks/useDismiss'

const auth = {}
function resetAuth(extra = {}) {
  for (const k of Object.keys(auth)) delete auth[k]
  Object.assign(
    auth,
    { loading: false, user: null, isAuthenticated: false, publicSearch: false, permissions: [], logout: vi.fn() },
    extra,
  )
}
resetAuth()
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

const { default: UserMenu } = await import('../components/UserMenu')
const { default: MainLayout } = await import('../layouts/MainLayout')
const { RequirePermission } = await import('../components/RouteGuards')

describe('visibleLinks', () => {
  const paths = (state) => visibleLinks(state).map((l) => l.to)
  const viewer = { isAuthenticated: true, permissions: ['search.view', 'water.view'] }

  it('follows the permission keys, the admin flag and public search', () => {
    expect(paths({ isAuthenticated: false, publicSearch: false })).toEqual([])
    expect(paths({ isAuthenticated: false, publicSearch: true })).toEqual(['/', '/water'])
    expect(paths(viewer)).toEqual(['/', '/water'])
    expect(paths({ isAuthenticated: true, permissions: ['inquiries.view'] })).toEqual(['/inquiries'])
    expect(paths({ isAuthenticated: true, permissions: ['guide.view'] })).toEqual(['/guide'])
    expect(paths({ isAuthenticated: true, permissions: [] })).toEqual([])
    expect(paths({ isAuthenticated: true, isAdmin: true, permissions: [] })).toEqual([
      '/',
      '/water',
      '/guide',
      '/committees',
      '/urgent',
      '/complaints',
      '/inquiries',
      '/daily-report',
      '/users',
      '/audit-logs',
    ])
  })

  it('uses auth.can when given, and groups the links in sections', () => {
    const can = (perm) => perm === 'complaints.view'
    expect(paths({ isAuthenticated: true, can })).toEqual(['/complaints'])
    expect(visibleSections(viewer).map((s) => s.title)).toEqual(['الخدمات'])
    expect(visibleSections({ isAuthenticated: true, isAdmin: true }).map((s) => s.links.length)).toEqual([4, 4, 2])
    expect(firstAllowedPath({ isAuthenticated: true, permissions: ['inquiries.view'] })).toBe('/inquiries')
    expect(firstAllowedPath({ isAuthenticated: true, permissions: [] })).toBeNull()
  })
})

describe('checkPermission', () => {
  it('accepts any of several keys; anonymous visitors only get the public pages', () => {
    const user = { isAuthenticated: true, permissions: ['complaints.view'] }
    expect(checkPermission(user, ['inquiries.view', 'complaints.view'])).toBe(true)
    expect(checkPermission(user, 'complaints.edit')).toBe(false)
    const visitor = { isAuthenticated: false, publicSearch: true }
    expect(checkPermission(visitor, 'water.view')).toBe(true)
    expect(checkPermission(visitor, 'search.edit')).toBe(false)
    expect(checkPermission({ ...visitor, publicSearch: false }, 'search.view')).toBe(false)
  })

  it('derives keys from the older flags when the server sends no permissions', () => {
    expect(permissionsOf(null)).toEqual([])
    expect(permissionsOf({ can_edit: false })).toEqual(['search.view', 'water.view'])
    expect(permissionsOf({ can_edit: true })).toContain('inquiries.export')
    expect(permissionsOf({ permissions: ['water.view'] })).toEqual(['water.view'])
  })
})

describe('RequirePermission', () => {
  beforeEach(() => resetAuth({ user: { username: 'u' }, isAuthenticated: true }))
  const guarded = (perm, text) => (
    <RequirePermission perm={perm}>
      <p>{text}</p>
    </RequirePermission>
  )
  const renderAt = (path) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>صفحة الدخول</p>} />
          <Route path="/" element={guarded('search.view', 'صفحة البحث')} />
          <Route path="/water" element={guarded('water.view', 'صفحة المياه')} />
          <Route path="/inquiries" element={guarded(['inquiries.view', 'inquiries.edit'], 'صفحة الاستفسارات')} />
        </Routes>
      </MemoryRouter>,
    )

  it('renders the page when allowed', () => {
    auth.permissions = ['search.view']
    renderAt('/')
    expect(screen.getByText('صفحة البحث')).toBeInTheDocument()
  })

  it('sends the user to the first page they may open (no loop when "/" is not allowed)', () => {
    auth.permissions = ['inquiries.view']
    renderAt('/')
    expect(screen.getByText('صفحة الاستفسارات')).toBeInTheDocument()
  })

  it('shows «لا تملك صلاحية» when no page is allowed', () => {
    auth.permissions = []
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'لا تملك صلاحية' })).toBeInTheDocument()
  })

  it('lets anonymous visitors open the public pages when public search is on', () => {
    resetAuth({ publicSearch: true })
    renderAt('/water')
    expect(screen.getByText('صفحة المياه')).toBeInTheDocument()
  })

  it('sends signed-out visitors to the login page for the other pages', () => {
    resetAuth({ publicSearch: true })
    renderAt('/inquiries')
    expect(screen.getByText('صفحة الدخول')).toBeInTheDocument()
  })
})

describe('MainLayout', () => {
  beforeEach(() =>
    resetAuth({
      user: { first_name: 'بلال', last_name: 'قنوع', username: 'b', role_display: 'مشاهد' },
      isAuthenticated: true,
      permissions: ['search.view', 'water.view', 'inquiries.view'],
    }),
  )
  const renderLayout = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<p>محتوى البحث</p>} />
            <Route path="water" element={<p>محتوى المياه</p>} />
            <Route path="inquiries" element={<p>محتوى الاستفسارات</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

  it('lists only the allowed sections in the sidebar', () => {
    renderLayout()
    const nav = screen.getAllByRole('navigation', { name: 'القائمة الرئيسية' })[0]
    expect(within(nav).getByRole('link', { name: 'جدول المياه' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'الاستفسارات' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'الشكاوى' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'المستخدمون' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'البحث عن المواقع' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens the mobile drawer and closes it on Escape, the backdrop, the close button and navigation', async () => {
    renderLayout()
    const toggle = screen.getByRole('button', { name: 'فتح القائمة' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    const drawer = screen.getByRole('dialog', { name: 'القائمة الرئيسية' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(drawer).getByRole('button', { name: 'إغلاق القائمة' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
    expect(document.body.style.overflow).toBe('')

    await userEvent.click(toggle)
    await userEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'إغلاق القائمة' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'جدول المياه' }))
    expect(screen.getByText('محتوى المياه')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('collapses the desktop sidebar to icons and remembers it', async () => {
    window.localStorage.removeItem('sidebar-collapsed')
    const { unmount } = renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'طي القائمة' }))
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('1')
    unmount()
    renderLayout()
    expect(screen.getByRole('button', { name: 'توسيع القائمة' })).toHaveAttribute('aria-pressed', 'true')
    window.localStorage.removeItem('sidebar-collapsed')
  })

  it('has no sidebar nor menu button for signed-out visitors without public search', () => {
    resetAuth()
    renderLayout()
    expect(screen.queryByRole('navigation', { name: 'القائمة الرئيسية' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'فتح القائمة' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument()
  })
})

function Popup() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const toggleRef = useRef(null)
  const ref = useRef(null)
  useDismiss(open, close, ref, toggleRef)
  return (
    <>
      <button ref={toggleRef} type="button" onClick={() => setOpen((o) => !o)}>
        فتح
      </button>
      {open && <div ref={ref}>القائمة</div>}
      <p>خارج</p>
    </>
  )
}

describe('useDismiss', () => {
  it('closes on an outside press and on Escape (focus back on the toggle), not on the toggle itself', async () => {
    render(<Popup />)
    const toggle = screen.getByRole('button', { name: 'فتح' })
    await userEvent.click(toggle)
    await userEvent.click(screen.getByText('القائمة'))
    expect(screen.getByText('القائمة')).toBeInTheDocument()
    await userEvent.click(screen.getByText('خارج'))
    expect(screen.queryByText('القائمة')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    await userEvent.click(toggle) // the toggle still toggles
    expect(screen.queryByText('القائمة')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    screen.getByText('خارج').focus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('القائمة')).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })
})

describe('Modal', () => {
  it('is labelled by its title, focuses the first field, traps Tab and closes on Escape', async () => {
    const onClose = vi.fn()
    render(
      <Modal open title="تعديل" onClose={onClose}>
        <input aria-label="الاسم" />
        <button type="button">حفظ</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'تعديل' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText('الاسم')).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'حفظ' })).toHaveFocus()
    await userEvent.tab() // wraps around to the close button (first focusable)
    expect(screen.getByRole('button', { name: 'إغلاق' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'حفظ' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the focus where it is when the parent re-renders', async () => {
    const { rerender } = render(
      <Modal open title="تعديل" onClose={() => {}}>
        <input aria-label="الأول" />
        <input aria-label="الثاني" />
      </Modal>,
    )
    screen.getByLabelText('الثاني').focus()
    rerender(
      <Modal open title="تعديل" onClose={() => {}}>
        <input aria-label="الأول" />
        <input aria-label="الثاني" />
      </Modal>,
    )
    expect(screen.getByLabelText('الثاني')).toHaveFocus()
  })
})

describe('PageHeader / SearchInput', () => {
  it('renders the title, subtitle and actions', () => {
    render(
      <PageHeader title="جدول توزيع المياه" subtitle="حسب توجيهات المواطنين">
        <button type="button">طباعة</button>
      </PageHeader>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'جدول توزيع المياه' })).toBeInTheDocument()
    expect(screen.getByText('حسب توجيهات المواطنين')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeInTheDocument()
  })

  it('labels the search field and forwards its props', async () => {
    const onChange = vi.fn()
    render(<SearchInput label="بحث في المستخدمين" value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'بحث في المستخدمين' }), 'a')
    expect(onChange).toHaveBeenCalled()
  })
})

describe('UserMenu', () => {
  beforeEach(() => resetAuth())
  const renderMenu = () =>
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )

  it('shows nothing clickable while the session is being checked', () => {
    auth.loading = true
    renderMenu()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers sign-in to visitors', () => {
    renderMenu()
    expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument()
  })

  it('opens the account menu with the keyboard and moves with the arrow keys', async () => {
    auth.user = { first_name: 'بلال', last_name: 'قنوع', username: 'b', role_display: 'محرر' }
    renderMenu()
    const button = screen.getByRole('button', { name: 'حساب بلال قنوع' })
    expect(button).toHaveTextContent('ب')
    await userEvent.click(button)
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })
})
