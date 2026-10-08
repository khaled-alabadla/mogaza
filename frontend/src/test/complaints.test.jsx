import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../services/api', () => ({
  complaintsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    markUploaded: vi.fn(),
    exportUrl: (params) => `/api/complaints/export/?${new URLSearchParams(params)}`,
  },
}))

const { complaintsApi } = await import('../services/api')
const { default: ComplaintsPage } = await import('../pages/ComplaintsPage')

const COMPLAINT = {
  id: 7,
  kind: 'complaint',
  kind_display: 'شكوى',
  national_id: '401234567',
  name: 'محمد أحمد',
  phone: '0599123456',
  point: 'نقطة الرمال',
  building_number: '5A',
  street_number: '1050',
  category: 'انقطاع مياه',
  address: 'تل الهوا',
  status: 'pending',
  status_display: 'بانتظار الرفع',
  created_at: '2026-10-08T10:00:00+03:00',
  created_by_name: 'محرر',
}

beforeEach(() => {
  vi.clearAllMocks()
  complaintsApi.list.mockResolvedValue({ count: 1, results: [COMPLAINT], next: null, previous: null, pending_count: 1 })
})

describe('ComplaintsPage', () => {
  it('lists pending complaints with all their details', async () => {
    render(<ComplaintsPage />)
    expect(await screen.findByText('انقطاع مياه')).toBeInTheDocument()
    expect(complaintsApi.list.mock.calls[0][0]).toMatchObject({ upload: 'pending', page: 1 })
    for (const text of ['محمد أحمد', '401234567', '0599123456', 'نقطة الرمال', '5A', '1050', 'تل الهوا']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: /بانتظار الرفع/ })).toHaveTextContent('1')
  })

  it('records a new complaint with the form', async () => {
    complaintsApi.create.mockResolvedValue({})
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getAllByRole('button', { name: /تسجيل شكوى/ })[0])
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/نوع الشكوى/), 'تسرب مياه')
    await userEvent.type(within(dialog).getByLabelText(/رقم الهوية/), '402222222')
    await userEvent.type(within(dialog).getByLabelText(/^الاسم/), 'سعيد')
    await userEvent.type(within(dialog).getByLabelText(/رقم الجوال/), '0569000000')
    await userEvent.type(within(dialog).getByLabelText(/رقم المبنى/), '5A')
    await userEvent.click(within(dialog).getByRole('button', { name: 'تسجيل الشكوى' }))
    expect(complaintsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'complaint',
        category: 'تسرب مياه',
        national_id: '402222222',
        name: 'سعيد',
        phone: '0569000000',
        building_number: '5A',
      }),
    )
  })

  it('accepts a complaint with only some fields, and shows the server error for an empty one', async () => {
    complaintsApi.create
      .mockRejectedValueOnce({ response: { status: 400, data: { non_field_errors: ['أدخل بيانات الشكوى: حقل واحد على الأقل.'] } } })
      .mockResolvedValueOnce({})
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getAllByRole('button', { name: /تسجيل شكوى/ })[0])
    const dialog = screen.getByRole('dialog')
    // no field is marked as required except the kind
    expect(within(dialog).getByLabelText(/رقم الهوية/)).not.toHaveAccessibleName(/\*/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'تسجيل الشكوى' }))
    expect(await within(dialog).findByText('أدخل بيانات الشكوى: حقل واحد على الأقل.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/رقم الجوال/), '0599123456')
    await userEvent.click(within(dialog).getByRole('button', { name: 'تسجيل الشكوى' }))
    expect(complaintsApi.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'complaint', phone: '0599123456', national_id: '', name: '' }),
    )
  })

  it('marks selected complaints as uploaded', async () => {
    complaintsApi.markUploaded.mockResolvedValue({ updated: 1 })
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getByLabelText('تحديد شكوى محمد أحمد'))
    await userEvent.click(screen.getByRole('button', { name: /تعليم المحدد/ }))
    expect(complaintsApi.markUploaded).toHaveBeenCalledWith([7], true)
  })

  it('switches tabs and builds the export link from the filters', async () => {
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    expect(screen.getByRole('link', { name: /تصدير Excel/ })).toHaveAttribute('href', '/api/complaints/export/?upload=pending')
    await userEvent.click(screen.getByRole('tab', { name: 'تم الرفع' }))
    expect(complaintsApi.list.mock.calls.at(-1)[0]).toMatchObject({ upload: 'uploaded' })
    expect(screen.getByRole('link', { name: /تصدير Excel/ })).toHaveAttribute('href', '/api/complaints/export/?upload=uploaded')
  })
})
