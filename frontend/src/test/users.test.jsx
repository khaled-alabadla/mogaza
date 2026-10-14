import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { user: { id: 1 }, refresh: vi.fn(), can: () => true, isAdmin: true }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../services/api', () => ({
  usersApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  authApi: { permissions: vi.fn() },
}))

const { usersApi, authApi } = await import('../services/api')
const { default: UsersPage } = await import('../pages/UsersPage')

const CATALOG = {
  permissions: [
    { key: 'search.view', label: 'عرض', group: 'البحث' },
    { key: 'search.edit', label: 'تعديل', group: 'البحث' },
    { key: 'complaints.view', label: 'عرض', group: 'الشكاوى' },
    { key: 'complaints.edit', label: 'تعديل', group: 'الشكاوى' },
    { key: 'complaints.export', label: 'تصدير', group: 'الشكاوى' },
  ],
  role_defaults: {
    admin: ['search.view', 'search.edit', 'complaints.view', 'complaints.edit', 'complaints.export'],
    editor: ['search.view', 'search.edit', 'complaints.view', 'complaints.edit'],
    viewer: ['search.view'],
  },
}

const USERS = [
  { id: 1, username: 'admin', role: 'admin', is_active: true, permissions: CATALOG.role_defaults.admin },
  { id: 2, username: 'viewer1', role: 'viewer', is_active: true, permissions: ['search.view'] },
  { id: 3, username: 'custom1', role: 'viewer', is_active: true, permissions: ['search.view', 'complaints.view'] },
]

const box = (name) => screen.getByRole('checkbox', { name })
const checkedKeys = () =>
  CATALOG.permissions.filter((p) => box(`${p.group}: ${p.label}`).checked).map((p) => p.key)

beforeEach(() => {
  vi.clearAllMocks()
  usersApi.list.mockResolvedValue({ count: USERS.length, results: USERS, next: null, previous: null })
  authApi.permissions.mockResolvedValue(CATALOG)
})

async function openNewUser() {
  render(<UsersPage />)
  await screen.findByText('@custom1')
  await userEvent.click(screen.getByRole('button', { name: /مستخدم جديد/ }))
  return screen.getByRole('dialog')
}

describe('UsersPage permissions', () => {
  it('marks only users whose permissions differ from their role', async () => {
    render(<UsersPage />)
    await screen.findByText('@custom1')
    const badges = screen.getAllByText(/صلاحيات مخصّصة/)
    expect(badges).toHaveLength(1)
    expect(badges[0].closest('li')).toHaveTextContent('@custom1')
  })

  it('uses the server flag uses_role_defaults when present', async () => {
    usersApi.list.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        { ...USERS[1], uses_role_defaults: false },
        { ...USERS[2], uses_role_defaults: true },
      ],
    })
    render(<UsersPage />)
    await screen.findByText('@custom1')
    const badges = screen.getAllByText(/صلاحيات مخصّصة/)
    expect(badges).toHaveLength(1)
    expect(badges[0].closest('li')).toHaveTextContent('@viewer1')
  })

  it('a new user starts from the role defaults; changing the role resets them', async () => {
    const dialog = await openNewUser()
    expect(within(dialog).getByText('الصلاحيات')).toBeInTheDocument()
    expect(checkedKeys()).toEqual(['search.view'])
    await userEvent.selectOptions(within(dialog).getByLabelText('الدور'), 'editor')
    expect(checkedKeys()).toEqual(CATALOG.role_defaults.editor)
    await userEvent.selectOptions(within(dialog).getByLabelText('الدور'), 'viewer')
    expect(checkedKeys()).toEqual(['search.view'])
  })

  it('the admin role has everything, locked', async () => {
    usersApi.create.mockResolvedValue({})
    const dialog = await openNewUser()
    await userEvent.selectOptions(within(dialog).getByLabelText('الدور'), 'admin')
    expect(within(dialog).getByText(/مدير النظام يملك كل الصلاحيات/)).toBeInTheDocument()
    for (const p of CATALOG.permissions) {
      expect(box(`${p.group}: ${p.label}`)).toBeChecked()
      expect(box(`${p.group}: ${p.label}`)).toBeDisabled()
    }
    await userEvent.type(within(dialog).getByLabelText(/اسم المستخدم/), 'boss')
    await userEvent.type(within(dialog).getByLabelText(/^كلمة المرور/), '123456')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المستخدم' }))
    expect(usersApi.create.mock.calls[0][0]).toMatchObject({ role: 'admin', password: '123456' })
    expect(usersApi.create.mock.calls[0][0]).not.toHaveProperty('permissions')
  })

  it('edit / export tick their «عرض»; unticking «عرض» drops them; the list is sent', async () => {
    usersApi.create.mockResolvedValue({})
    const dialog = await openNewUser()
    await userEvent.click(box('الشكاوى: تصدير'))
    expect(box('الشكاوى: عرض')).toBeChecked()
    await userEvent.click(box('الشكاوى: تعديل'))
    await userEvent.click(box('الشكاوى: عرض'))
    expect(box('الشكاوى: تعديل')).not.toBeChecked()
    expect(box('الشكاوى: تصدير')).not.toBeChecked()

    await userEvent.click(box('الشكاوى: تصدير'))
    await userEvent.click(box('كل صلاحيات البحث'))
    expect(box('البحث: تعديل')).toBeChecked()

    expect(within(dialog).getByText('كلمة المرور: 6 أحرف أو أرقام على الأقل.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/اسم المستخدم/), 'clerk')
    await userEvent.type(within(dialog).getByLabelText(/^كلمة المرور/), '123456')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المستخدم' }))
    expect(usersApi.create.mock.calls[0][0]).toMatchObject({
      username: 'clerk',
      role: 'viewer',
      permissions: ['search.view', 'search.edit', 'complaints.view', 'complaints.export'],
    })
  })

  it('editing a user prefills their permissions; their role defaults are sent as null', async () => {
    usersApi.update.mockResolvedValue({})
    render(<UsersPage />)
    await screen.findByText('@custom1')
    const row = screen.getByText('@custom1').closest('li')
    await userEvent.click(within(row).getByRole('button', { name: /تعديل/ }))
    const dialog = screen.getByRole('dialog')
    expect(checkedKeys()).toEqual(['search.view', 'complaints.view'])
    await userEvent.click(box('الشكاوى: عرض')) // back to the viewer defaults
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    expect(usersApi.update).toHaveBeenCalledWith(3, expect.objectContaining({ permissions: null }))
  })

  it('without the permissions list the form still works (and sends no permissions)', async () => {
    authApi.permissions.mockRejectedValue(new Error('offline'))
    usersApi.create.mockResolvedValue({})
    const dialog = await openNewUser()
    expect(within(dialog).queryByText('الصلاحيات')).not.toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/اسم المستخدم/), 'clerk')
    await userEvent.type(within(dialog).getByLabelText(/^كلمة المرور/), '123456')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المستخدم' }))
    expect(usersApi.create.mock.calls[0][0]).not.toHaveProperty('permissions')
  })
})
