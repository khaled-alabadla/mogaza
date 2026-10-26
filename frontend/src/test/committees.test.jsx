import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { perms: new Set(['committees.view', 'committees.edit']) }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (k) => auth.perms.has(k) }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../services/api', () => ({
  committeesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const { committeesApi } = await import('../services/api')
const { default: CommitteesPage } = await import('../pages/CommitteesPage')

const REPS = [
  { id: 1, name: 'محمد جابر عبد العال', committee: 'لجنة حي الشجاعية', phone: '0599419311' },
  { id: 2, name: 'عادل الجزار', committee: 'لجنة حي المنارة', phone: '' },
]
const page = (results) => ({ count: results.length, results, next: null, previous: null })
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/committees']}>
      <CommitteesPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['committees.view', 'committees.edit'])
  committeesApi.list.mockResolvedValue(page(REPS))
})

describe('CommitteesPage', () => {
  it('lists the representatives with callable phone numbers', async () => {
    renderPage()
    expect(await screen.findByText('محمد جابر عبد العال')).toBeInTheDocument()
    expect(screen.getByText('لجنة حي المنارة')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '0599419311' })).toHaveAttribute('href', 'tel:0599419311')
  })

  it('searches on the server', async () => {
    renderPage()
    await screen.findByText('محمد جابر عبد العال')
    await userEvent.type(screen.getByLabelText('البحث في لجان الأحياء'), 'المنارة')
    await vi.waitFor(() => expect(committeesApi.list.mock.calls.at(-1)[0]).toMatchObject({ search: 'المنارة', page: 1 }))
  })

  it('adds, edits and deletes a representative', async () => {
    committeesApi.create.mockResolvedValue({})
    committeesApi.update.mockResolvedValue({})
    committeesApi.remove.mockResolvedValue()
    renderPage()
    await screen.findByText('محمد جابر عبد العال')

    await userEvent.click(screen.getByRole('button', { name: /إضافة ممثل/ }))
    let dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^الاسم/), 'أحمد سالم')
    await userEvent.type(within(dialog).getByLabelText(/^اسم اللجنة/), 'لجنة حي النصر')
    await userEvent.type(within(dialog).getByLabelText(/^رقم الجوال/), '0599111222')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة الممثل' }))
    expect(committeesApi.create).toHaveBeenCalledWith({ name: 'أحمد سالم', committee: 'لجنة حي النصر', phone: '0599111222' })

    await userEvent.click(screen.getByRole('button', { name: 'تعديل عادل الجزار' }))
    dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^رقم الجوال/), '0599000000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    expect(committeesApi.update).toHaveBeenCalledWith(2, expect.objectContaining({ phone: '0599000000' }))

    await userEvent.click(screen.getByRole('button', { name: 'حذف عادل الجزار' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'حذف' }))
    expect(committeesApi.remove).toHaveBeenCalledWith(2)
  })

  it('viewers only read', async () => {
    auth.perms = new Set(['committees.view'])
    renderPage()
    await screen.findByText('محمد جابر عبد العال')
    expect(screen.queryByRole('button', { name: /إضافة ممثل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^تعديل/ })).not.toBeInTheDocument()
  })
})
