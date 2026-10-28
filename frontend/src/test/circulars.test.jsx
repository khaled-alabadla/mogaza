import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { perms: new Set(['circulars.view', 'circulars.edit']) }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (k) => auth.perms.has(k) }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../services/api', () => ({
  circularsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const { circularsApi } = await import('../services/api')
const { default: CircularsPage } = await import('../pages/CircularsPage')

const CIRCULAR = {
  id: 1,
  title: 'أعمدة الكهرباء',
  body: 'يمكن توجيه المواطنين لمقر شركة الكهرباء.\nأو رقم العلاقات العامة: 0595322040',
  pinned: true,
  updated_at: '2026-10-26T10:00:00+03:00',
}
const page = (results) => ({ count: results.length, results, next: null, previous: null })
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/circulars']}>
      <CircularsPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['circulars.view', 'circulars.edit'])
  circularsApi.list.mockResolvedValue(page([CIRCULAR]))
})

describe('CircularsPage', () => {
  it('shows a circular with its phone number as a call link and the pinned mark', async () => {
    renderPage()
    expect(await screen.findByText('أعمدة الكهرباء')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '0595322040' })).toHaveAttribute('href', 'tel:0595322040')
    expect(screen.getByText('مثبّت')).toBeInTheDocument()
  })

  it('opens on the circular asked for (from the home page), marked', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <MemoryRouter initialEntries={['/circulars?open=1']}>
        <CircularsPage />
      </MemoryRouter>,
    )
    const card = (await screen.findByText('أعمدة الكهرباء')).closest('li')
    expect(card).toHaveAttribute('aria-current', 'true')
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
  })

  it('*text* between stars shows in bold, like WhatsApp (a phone inside stays a call link)', async () => {
    circularsApi.list.mockResolvedValue(
      page([{ ...CIRCULAR, body: 'وجّه المواطن *فوراً* إلى *الرقم 0595322040* ولا تنسَ 5 * 3 أو * هذا *' }]),
    )
    renderPage()
    const bold = await screen.findByText('فوراً')
    expect(bold.tagName).toBe('STRONG')
    expect(bold.textContent).not.toContain('*')
    const link = screen.getByRole('link', { name: '0595322040' })
    expect(link.closest('strong')).not.toBeNull()
    // a lone star, or stars around spaces, stay as they are
    expect(document.querySelectorAll('li strong')).toHaveLength(2)
    expect(screen.getByText(/5 \* 3 أو \* هذا \*/)).toBeInTheDocument()
  })

  it('adds a pinned circular and searches', async () => {
    circularsApi.create.mockResolvedValue({})
    renderPage()
    await screen.findByText('أعمدة الكهرباء')
    await userEvent.click(screen.getByRole('button', { name: /إضافة تعميم/ }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^العنوان/), 'المياه')
    await userEvent.type(within(dialog).getByLabelText(/^نص التعميم/), 'وجّه المواطن إلى دائرة المياه.')
    await userEvent.click(within(dialog).getByLabelText('تثبيت التعميم في أعلى الصفحة'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة التعميم' }))
    expect(circularsApi.create).toHaveBeenCalledWith({ title: 'المياه', body: 'وجّه المواطن إلى دائرة المياه.', pinned: true })
    await userEvent.type(screen.getByLabelText('البحث في التعميمات'), 'كهرباء')
    await vi.waitFor(() => expect(circularsApi.list.mock.calls.at(-1)[0]).toMatchObject({ search: 'كهرباء' }))
  })

  it('edits and deletes; viewers only read', async () => {
    circularsApi.remove.mockResolvedValue()
    renderPage()
    await screen.findByText('أعمدة الكهرباء')
    await userEvent.click(screen.getByRole('button', { name: 'حذف أعمدة الكهرباء' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'حذف' }))
    expect(circularsApi.remove).toHaveBeenCalledWith(1)
  })

  it('hides editing for viewers', async () => {
    auth.perms = new Set(['circulars.view'])
    renderPage()
    await screen.findByText('أعمدة الكهرباء')
    expect(screen.queryByRole('button', { name: /إضافة تعميم/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^تعديل/ })).not.toBeInTheDocument()
  })
})
