import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { perms: new Set(['urgent.view', 'urgent.edit', 'urgent.export']) }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (k) => auth.perms.has(k) }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../services/api', () => ({
  urgentApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    markResolved: vi.fn(),
    exportUrl: (params) => `/api/urgent-complaints/export/?${new URLSearchParams(params)}`,
  },
}))

const { urgentApi } = await import('../services/api')
const { default: UrgentComplaintsPage, ageText } = await import('../pages/UrgentComplaintsPage')
const { parseUrgentMessage } = await import('../utils/urgentMessage')

const MESSAGE = `شكوى رقم/56923
صرف صحي - طفح صرف صحي
الشيخ عجلين ـ شمال المسجد 70م.
المواطن/ أحمد محمد سالم
رقم الجوال: 0599000000

مقدمة منذ: 0 يوم

مركز خدمات الجمهور
بلدية غزة`

const ITEM = {
  id: 5,
  number: '12345',
  name: 'أحمد علي',
  category: 'انقطاع مياه',
  phone: '0599123456',
  age_days: 8,
  notes: 'عاجل جداً',
  status: 'unresolved',
  status_display: 'لم يتم الحل',
  created_at: '2026-10-20T10:00:00+03:00',
  created_by_name: 'محرر',
}
const page = (results, unresolved = results.length) => ({ count: results.length, results, next: null, previous: null, unresolved_count: unresolved })
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/urgent']}>
      <UrgentComplaintsPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['urgent.view', 'urgent.edit', 'urgent.export'])
  urgentApi.list.mockResolvedValue(page([ITEM]))
})

describe('ageText', () => {
  it('agrees in number', () => {
    expect([0, 1, 2, 3, 10, 11].map(ageText)).toEqual(['اليوم', 'منذ يوم', 'منذ يومين', 'منذ 3 أيام', 'منذ 10 أيام', 'منذ 11 يوماً'])
  })
})

describe('UrgentComplaintsPage', () => {
  it('opens on «لم يتم الحل» with the count, the age and an Excel link with the filters', async () => {
    renderPage()
    expect(await screen.findByText('انقطاع مياه')).toBeInTheDocument()
    expect(urgentApi.list.mock.calls[0][0]).toMatchObject({ status: 'unresolved', page: 1 })
    expect(screen.getByRole('tab', { name: /لم يتم الحل/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('منذ 8 أيام')).toBeInTheDocument()
    // every field is shown in the card (the number too); no «سُجّلت … بواسطة» line
    for (const label of ['رقم الشكوى', 'اسم مقدم الشكوى', 'نوع الشكوى', 'رقم الجوال', 'مقدمة منذ', 'العنوان']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('12345')).toBeInTheDocument()
    expect(screen.queryByText(/سُجّلت/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /تصدير Excel/ })).toHaveAttribute('href', '/api/urgent-complaints/export/?status=unresolved')
    await userEvent.click(screen.getByRole('tab', { name: 'الكل' }))
    expect(urgentApi.list.mock.calls.at(-1)[0]).not.toHaveProperty('status')
  })

  it('adds a complaint: «مقدمة منذ» is sent as a number of days', async () => {
    urgentApi.create.mockResolvedValue({})
    renderPage()
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getAllByRole('button', { name: /إضافة شكوى عاجلة/ })[0])
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إدخال البيانات يدوياً' }))
    await userEvent.type(within(dialog).getByLabelText(/^رقم الشكوى/), '777')
    await userEvent.type(within(dialog).getByLabelText(/^اسم مقدم الشكوى/), 'سعاد')
    await userEvent.type(within(dialog).getByLabelText(/مقدمة منذ/), '٣')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة الشكوى' }))
    expect(urgentApi.create.mock.calls[0][0]).toMatchObject({ number: '777', name: 'سعاد', submitted_days_ago: 3 })
  })

  it('pasting the message fills the form, to be checked and edited before saving', async () => {
    urgentApi.create.mockResolvedValue({})
    renderPage()
    await screen.findByText('12345')
    await userEvent.click(screen.getAllByRole('button', { name: /إضافة شكوى عاجلة/ })[0])
    const dialog = screen.getByRole('dialog')
    // not such a message: it says so and nothing is opened
    const message = within(dialog).getByLabelText('نص الشكوى')
    await userEvent.type(message, 'مرحبا')
    await userEvent.click(within(dialog).getByRole('button', { name: 'تعبئة الحقول' }))
    expect(within(dialog).getByText(/لم نتعرف على هذا النص/)).toBeInTheDocument()
    await userEvent.clear(message)
    await userEvent.click(message)
    await userEvent.paste(MESSAGE)
    await userEvent.click(within(dialog).getByRole('button', { name: 'تعبئة الحقول' }))
    expect(urgentApi.create).not.toHaveBeenCalled() // nothing is saved yet
    expect(within(dialog).getByLabelText(/رقم الشكوى/)).toHaveValue('56923')
    expect(within(dialog).getByLabelText(/اسم مقدم الشكوى/)).toHaveValue('أحمد محمد سالم')
    expect(within(dialog).getByLabelText(/مقدمة منذ/)).toHaveValue('0')
    await userEvent.type(within(dialog).getByLabelText(/اسم مقدم الشكوى/), ' معدل')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة الشكوى' }))
    expect(urgentApi.create.mock.calls[0][0]).toMatchObject({
      number: '56923',
      name: 'أحمد محمد سالم معدل',
      category: 'صرف صحي - طفح صرف صحي',
      phone: '0599000000',
      submitted_days_ago: 0,
      notes: 'الشيخ عجلين ـ شمال المسجد 70م.',
    })
  })

  it('marks a complaint as resolved', async () => {
    urgentApi.markResolved.mockResolvedValue({ updated: 1 })
    renderPage()
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getByRole('button', { name: 'تم الحل' }))
    expect(urgentApi.markResolved).toHaveBeenCalledWith([5], true)
  })

  it('hides editing and export without those permissions', async () => {
    auth.perms = new Set(['urgent.view'])
    renderPage()
    await screen.findByText('انقطاع مياه')
    expect(screen.queryByRole('button', { name: 'تم الحل' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /تصدير Excel/ })).not.toBeInTheDocument()
  })
})

describe('parseUrgentMessage', () => {
  it('reads every field of the message; the place goes to the notes, the signature nowhere', () => {
    expect(parseUrgentMessage(MESSAGE)).toEqual({
      number: '56923',
      category: 'صرف صحي - طفح صرف صحي',
      notes: 'الشيخ عجلين ـ شمال المسجد 70م.',
      name: 'أحمد محمد سالم',
      phone: '0599000000',
      submitted_days_ago: '0',
    })
  })

  it('Arabic digits, spaces and Windows line ends make no difference; what is missing is left out', () => {
    expect(parseUrgentMessage('شكوى رقم / ٥٦٩٢٣\r\n\r\nمياه - انقطاع مياه\r\nالمواطن: سعيد\r\nمقدمة منذ: ١٢ يوم')).toEqual({
      number: '56923',
      category: 'مياه - انقطاع مياه',
      name: 'سعيد',
      submitted_days_ago: '12',
    })
  })

  it('another text is not read', () => {
    expect(parseUrgentMessage('مرحبا، عندي شكوى')).toBeNull()
    expect(parseUrgentMessage('')).toBeNull()
  })
})
