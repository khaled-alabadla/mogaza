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
  neighborhoodsApi: { list: vi.fn() },
}))

const { complaintsApi, neighborhoodsApi } = await import('../services/api')
const { default: ComplaintsPage } = await import('../pages/ComplaintsPage')

const COMPLAINT = {
  id: 7,
  kind: 'complaint',
  kind_display: 'شكوى',
  hide_identity: true,
  national_id: '401234567',
  name: 'محمد أحمد',
  phone: '0599123456',
  point: '12',
  building_number: '5A',
  street_number: '1050',
  subscription: '',
  category: 'انقطاع مياه',
  channel: 'whatsapp',
  channel_display: 'واتساب',
  area: 'الدرج',
  address: '',
  details: 'السطر الأول\nالسطر الثاني',
  status: 'pending',
  status_display: 'بانتظار الرفع',
  created_at: '2026-10-08T10:00:00+03:00',
  created_by_name: 'محرر',
}

const page = (results) => ({ count: results.length, results, next: null, previous: null, pending_count: results.length })

beforeEach(() => {
  vi.clearAllMocks()
  complaintsApi.list.mockResolvedValue(page([COMPLAINT]))
  neighborhoodsApi.list.mockResolvedValue([{ id: 1, name: 'الدرج' }, { id: 2, name: 'الزيتون' }])
})

describe('ComplaintsPage', () => {
  it('opens on complaints and shows only the filled-in details', async () => {
    render(<ComplaintsPage />)
    expect(await screen.findByText('انقطاع مياه')).toBeInTheDocument()
    expect(complaintsApi.list.mock.calls[0][0]).toMatchObject({ kind: 'complaint', upload: 'pending', page: 1 })
    for (const text of ['محمد أحمد', '401234567', '0599123456', '5A', 'واتساب', 'الدرج']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByText('بيانات صاحب الشكوى مخفية')).toBeInTheDocument()
    expect(screen.queryByText('اشتراك')).not.toBeInTheDocument() // empty fields are not listed
    expect(screen.getByText(/السطر الأول/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^إضافة شكوى/ })).toBeInTheDocument()
  })

  it('the complaint form has the requested fields and sends kind=complaint', async () => {
    complaintsApi.create.mockResolvedValue({})
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getAllByRole('button', { name: /إضافة شكوى/ })[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'إضافة شكوى جديدة' })).toBeInTheDocument()
    for (const label of ['رقم النقطة', 'اشتراك', 'المنطقة', 'تفاصيل الشكوى']) {
      expect(within(dialog).getByLabelText(new RegExp(label))).toBeInTheDocument()
    }
    for (const removed of ['مقدم الشكوى', 'سبب الاستثناء', 'عنوان الطلب', 'رقم الإيصال']) {
      expect(within(dialog).queryByLabelText(new RegExp(removed))).not.toBeInTheDocument()
    }
    // «المصدر» is a list with the three channels
    const source = within(dialog).getByLabelText(/^المصدر/)
    expect([...source.options].map((o) => o.textContent)).toEqual(['— اختر المصدر —', 'اتصال هاتفي', 'فيسبوك', 'واتساب'])
    await userEvent.selectOptions(source, 'facebook')
    await userEvent.click(within(dialog).getByLabelText('إخفاء بيانات صاحب الشكوى'))
    await userEvent.type(within(dialog).getByLabelText(/^رقم الجوال/), '0569000000')
    await userEvent.type(within(dialog).getByLabelText(/^مبنى/), '5A')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة شكوى' }))
    const sent = complaintsApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({
      kind: 'complaint',
      hide_identity: true,
      channel: 'facebook',
      phone: '0569000000',
      building_number: '5A',
      national_id: '',
    })
    expect(sent).not.toHaveProperty('submitter_type')
  })

  it('the inquiries tab has its own list and form', async () => {
    complaintsApi.create.mockResolvedValue({})
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    complaintsApi.list.mockResolvedValue(page([]))
    await userEvent.click(screen.getByRole('tab', { name: 'الاستفسارات' }))
    expect(complaintsApi.list.mock.calls.at(-1)[0]).toMatchObject({ kind: 'inquiry', page: 1 })
    expect(await screen.findByText('لا توجد استفسارات بانتظار الرفع')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /تصدير Excel/ })).toHaveAttribute(
      'href',
      '/api/complaints/export/?kind=inquiry&upload=pending',
    )

    await userEvent.click(screen.getAllByRole('button', { name: /إضافة استفسار/ })[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'إضافة استفسار جديد' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/رقم النقطة/)).not.toBeInTheDocument() // complaint-only fields hidden
    expect(within(dialog).queryByLabelText(/اشتراك/)).not.toBeInTheDocument()
    await userEvent.selectOptions(within(dialog).getByLabelText(/^المصدر/), 'phone')
    await userEvent.type(within(dialog).getByLabelText(/نوع الاستفسار/), 'فاتورة')
    await userEvent.type(within(dialog).getByLabelText(/^الحي/), 'الزيتون')
    await userEvent.type(within(dialog).getByLabelText(/نص الاستفسار/), 'متى موعد المياه؟')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة استفسار' }))
    const sent = complaintsApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({ kind: 'inquiry', category: 'فاتورة', channel: 'phone', area: 'الزيتون', details: 'متى موعد المياه؟' })
    expect(sent).not.toHaveProperty('point')
  })

  it('shows the server error for an empty record', async () => {
    complaintsApi.create.mockRejectedValueOnce({
      response: { status: 400, data: { non_field_errors: ['أدخل بيانات الشكوى أو الاستفسار: حقل واحد على الأقل.'] } },
    })
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getAllByRole('button', { name: /إضافة شكوى/ })[0])
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة شكوى' }))
    expect(await within(dialog).findByText('أدخل بيانات الشكوى أو الاستفسار: حقل واحد على الأقل.')).toBeInTheDocument()
  })

  it('marks selected records as uploaded', async () => {
    complaintsApi.markUploaded.mockResolvedValue({ updated: 1 })
    render(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getByLabelText('تحديد شكوى محمد أحمد'))
    await userEvent.click(screen.getByRole('button', { name: /تعليم المحدد/ }))
    expect(complaintsApi.markUploaded).toHaveBeenCalledWith([7], true)
  })
})
