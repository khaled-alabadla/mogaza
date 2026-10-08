import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from '../components/Modal'
import { visibleLinks } from '../components/navLinks'
import PageHeader from '../components/PageHeader'
import SearchInput from '../components/SearchInput'
import useDismiss from '../hooks/useDismiss'

const auth = { loading: false, user: null, logout: vi.fn() }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

const { default: UserMenu } = await import('../components/UserMenu')

describe('visibleLinks', () => {
  const paths = (state) => visibleLinks(state).map((l) => l.to)
  it('follows the search-access, editor and admin rules', () => {
    expect(paths({ isAuthenticated: false, publicSearch: false })).toEqual([])
    expect(paths({ isAuthenticated: false, publicSearch: true })).toEqual(['/', '/water'])
    expect(paths({ isAuthenticated: true })).toEqual(['/', '/water'])
    expect(paths({ isAuthenticated: true, canEdit: true })).toEqual(['/', '/water', '/complaints'])
    expect(paths({ isAuthenticated: true, isAdmin: true, canEdit: true })).toEqual([
      '/',
      '/water',
      '/complaints',
      '/users',
      '/audit-logs',
    ])
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
  beforeEach(() => {
    auth.loading = false
    auth.user = null
  })
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
