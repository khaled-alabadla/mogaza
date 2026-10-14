import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ALL_PERMS = [
  'complaints.view',
  'complaints.edit',
  'complaints.export',
  'inquiries.view',
  'inquiries.edit',
  'inquiries.export',
]
const auth = { perms: new Set(ALL_PERMS), can: (key) => auth.perms.has(key) }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
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
const { default: InquiriesPage } = await import('../pages/InquiriesPage')
const { default: ComplaintsReportPage } = await import('../pages/ComplaintsReportPage')

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
  area: 'منطقة قديمة',
  address: '',
  details: 'السطر الأول\nالسطر الثاني',
  status: 'pending',
  status_display: 'بانتظار الرفع',
  created_at: '2026-10-08T10:00:00+03:00',
  created_by_name: 'محرر',
}

const INQUIRY = {
  id: 9,
  kind: 'inquiry',
  kind_display: 'استفسار',
  hide_identity: false,
  national_id: '',
  name: 'سارة',
  phone: '0567000000',
  category: 'فاتورة',
  channel: 'app',
  channel_display: 'تطبيق البلدية',
  area: 'حي قديم',
  details: 'متى موعد المياه؟',
  status: 'uploaded',
  status_display: 'تم الرفع',
  created_at: '2026-10-09T10:00:00+03:00',
}

/** Open a searchable select and return its option labels. */
async function optionsOf(input) {
  await userEvent.click(input)
  return screen.getAllByRole('option').map((o) => o.textContent)
}
/** Pick an option of a searchable select by typing part of it and clicking it. */
async function choose(input, label) {
  await userEvent.clear(input)
  await userEvent.type(input, label.slice(0, 3))
  await userEvent.click(screen.getByRole('option', { name: label }))
}

const page = (results) => ({ count: results.length, results, next: null, previous: null, pending_count: results.length })

const renderAt = (element, url = '/') => render(<MemoryRouter initialEntries={[url]}>{element}</MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(ALL_PERMS)
  complaintsApi.list.mockResolvedValue(page([COMPLAINT]))
  neighborhoodsApi.list.mockResolvedValue([{ id: 1, name: 'الدرج' }, { id: 2, name: 'الزيتون' }])
})

describe('ComplaintsPage («الشكاوى»)', () => {
  it('lists complaints only and shows the filled-in details', async () => {
    renderAt(<ComplaintsPage />)
    expect(await screen.findByText('انقطاع مياه')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'الشكاوى' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'الاستفسارات' })).not.toBeInTheDocument() // no more kind tabs
    expect(complaintsApi.list.mock.calls[0][0]).toMatchObject({ kind: 'complaint', upload: 'pending', page: 1 })
    for (const text of ['محمد أحمد', '401234567', '0599123456', '5A', 'واتساب']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.queryByText('منطقة قديمة')).not.toBeInTheDocument() // «المنطقة» is gone from complaints
    expect(screen.getByText('بيانات صاحب الشكوى مخفية')).toBeInTheDocument()
    expect(screen.queryByText('اشتراك')).not.toBeInTheDocument() // empty fields are not listed
    expect(screen.getByText(/السطر الأول/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^إضافة شكوى/ })).toBeInTheDocument()
  })

  it('the complaint form has the requested fields, the 8 channels and sends kind=complaint', async () => {
    complaintsApi.create.mockResolvedValue({})
    renderAt(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getAllByRole('button', { name: /إضافة شكوى/ })[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'إضافة شكوى جديدة' })).toBeInTheDocument()
    for (const label of ['رقم النقطة', 'العنوان', 'تفاصيل الشكوى']) {
      expect(within(dialog).getByLabelText(new RegExp(label))).toBeInTheDocument()
    }
    for (const removed of ['اشتراك', 'المنطقة', 'الحي', 'مقدم الشكوى', 'سبب الاستثناء', 'رقم الإيصال']) {
      expect(within(dialog).queryByLabelText(new RegExp(removed))).not.toBeInTheDocument()
    }
    const source = within(dialog).getByLabelText(/^المصدر/)
    expect(source).toHaveAttribute('role', 'combobox')
    expect(await optionsOf(source)).toEqual([
      'فيسبوك',
      'تويتر',
      'واتساب',
      'موقع البلدية',
      'اتصال هاتفي',
      'تطبيق البلدية',
      'زيارة',
      'انستقرام',
    ])
    await choose(source, 'انستقرام')
    await userEvent.click(within(dialog).getByLabelText('إخفاء بيانات صاحب الشكوى'))
    await userEvent.type(within(dialog).getByLabelText(/^رقم الجوال/), '0569000000')
    await userEvent.type(within(dialog).getByLabelText(/^مبنى/), '5A')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة شكوى' }))
    const sent = complaintsApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({
      kind: 'complaint',
      hide_identity: true,
      channel: 'instagram',
      phone: '0569000000',
      building_number: '5A',
      national_id: '',
    })
    expect(sent).not.toHaveProperty('area')
    expect(neighborhoodsApi.list).not.toHaveBeenCalled() // only inquiries need the neighborhoods
  })

  it('exports with the list filters (Excel link and PDF report link)', async () => {
    renderAt(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    expect(screen.getByRole('link', { name: /تصدير Excel/ })).toHaveAttribute(
      'href',
      '/api/complaints/export/?kind=complaint&upload=pending',
    )
    expect(screen.getByRole('link', { name: /تصدير PDF/ })).toHaveAttribute('href', '/complaints/report?upload=pending')
    await userEvent.click(screen.getByRole('tab', { name: 'الكل' }))
    await userEvent.type(screen.getByLabelText('البحث في الشكاوى'), 'مياه')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /تصدير Excel/ })).toHaveAttribute(
        'href',
        `/api/complaints/export/?${new URLSearchParams({ kind: 'complaint', search: 'مياه' })}`,
      ),
    )
    expect(screen.getByRole('link', { name: /تصدير PDF/ })).toHaveAttribute(
      'href',
      `/complaints/report?${new URLSearchParams({ search: 'مياه' })}`,
    )
  })

  it('shows the server error for an empty record', async () => {
    complaintsApi.create.mockRejectedValueOnce({
      response: { status: 400, data: { non_field_errors: ['أدخل بيانات الشكوى أو الاستفسار: حقل واحد على الأقل.'] } },
    })
    renderAt(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getAllByRole('button', { name: /إضافة شكوى/ })[0])
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة شكوى' }))
    expect(await within(dialog).findByText('أدخل بيانات الشكوى أو الاستفسار: حقل واحد على الأقل.')).toBeInTheDocument()
  })

  it('marks selected records as uploaded', async () => {
    complaintsApi.markUploaded.mockResolvedValue({ updated: 1 })
    renderAt(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    await userEvent.click(screen.getByLabelText('تحديد شكوى محمد أحمد'))
    await userEvent.click(screen.getByRole('button', { name: /تعليم المحدد/ }))
    expect(complaintsApi.markUploaded).toHaveBeenCalledWith([7], true)
  })

  it('without edit / export rights: read-only, no exports', async () => {
    auth.perms = new Set(['complaints.view'])
    renderAt(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    for (const name of [/إضافة شكوى/, /تعديل/, /حذف/, /^تم الرفع$/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByLabelText('تحديد شكوى محمد أحمد')).not.toBeInTheDocument()
    expect(screen.queryByText('تحديد الكل في هذه الصفحة')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /تصدير/ })).not.toBeInTheDocument()
  })

  it('export without edit: exports shown, editing hidden', async () => {
    auth.perms = new Set(['complaints.view', 'complaints.export'])
    renderAt(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    expect(screen.getByRole('link', { name: /تصدير Excel/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /إضافة شكوى/ })).not.toBeInTheDocument()
  })

  it('the inquiry rights do not open the complaints controls', async () => {
    auth.perms = new Set(['complaints.view', 'inquiries.edit', 'inquiries.export'])
    renderAt(<ComplaintsPage />)
    await screen.findByText('انقطاع مياه')
    expect(screen.queryByRole('button', { name: /إضافة شكوى/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /تصدير/ })).not.toBeInTheDocument()
  })
})

describe('InquiriesPage («الاستفسارات»)', () => {
  it('has its own list, form and «الحي» select of neighborhood names', async () => {
    complaintsApi.list.mockResolvedValue(page([]))
    complaintsApi.create.mockResolvedValue({})
    renderAt(<InquiriesPage />)
    expect(await screen.findByText('لا توجد استفسارات بانتظار الرفع')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'الاستفسارات' })).toBeInTheDocument()
    expect(complaintsApi.list.mock.calls[0][0]).toMatchObject({ kind: 'inquiry', page: 1 })
    expect(screen.getByRole('link', { name: /تصدير Excel/ })).toHaveAttribute(
      'href',
      '/api/complaints/export/?kind=inquiry&upload=pending',
    )
    expect(screen.getByRole('link', { name: /تصدير PDF/ })).toHaveAttribute('href', '/inquiries/report?upload=pending')

    await userEvent.click(screen.getAllByRole('button', { name: /إضافة استفسار/ })[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'إضافة استفسار جديد' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/رقم النقطة/)).not.toBeInTheDocument() // complaint-only fields hidden
    expect(within(dialog).queryByLabelText(/اشتراك/)).not.toBeInTheDocument()
    const area = within(dialog).getByLabelText(/^الحي/)
    expect(await optionsOf(area)).toEqual(['الدرج', 'الزيتون'])
    // typing part of a name narrows the list
    await userEvent.type(area, 'زيت')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['الزيتون'])
    await userEvent.keyboard('{Enter}')
    expect(area).toHaveValue('الزيتون')
    await choose(within(dialog).getByLabelText(/^المصدر/), 'زيارة')
    await userEvent.type(within(dialog).getByLabelText(/نوع الاستفسار/), 'فاتورة')
    await userEvent.type(within(dialog).getByLabelText(/نص الاستفسار/), 'متى موعد المياه؟')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة استفسار' }))
    const sent = complaintsApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({ kind: 'inquiry', category: 'فاتورة', channel: 'visit', area: 'الزيتون', details: 'متى موعد المياه؟' })
    expect(sent).not.toHaveProperty('point')
  })

  it('a record by the hidden account (no creator name) shows no «بواسطة»', async () => {
    complaintsApi.list.mockResolvedValue(page([{ ...INQUIRY, created_by_name: null, uploaded_by_name: null }]))
    renderAt(<InquiriesPage />)
    await screen.findByText('حي قديم')
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument()
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
  })

  it('keeps a stored «الحي» that is not in the neighborhoods list when editing', async () => {
    complaintsApi.list.mockResolvedValue(page([INQUIRY]))
    complaintsApi.update.mockResolvedValue({})
    renderAt(<InquiriesPage />)
    expect(await screen.findByText('حي قديم')).toBeInTheDocument() // the card shows the stored name
    expect(screen.getByText('تطبيق البلدية')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }))
    const dialog = screen.getByRole('dialog')
    const area = within(dialog).getByLabelText(/^الحي/)
    expect(area).toHaveValue('حي قديم')
    expect(await optionsOf(area)).toEqual(['حي قديم', 'الدرج', 'الزيتون'])
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument() // Escape closes the list, not the dialog
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    expect(complaintsApi.update.mock.calls[0][1]).toMatchObject({ area: 'حي قديم', channel: 'app' })
  })

  it('an emptied «الحي» is sent as an empty text', async () => {
    complaintsApi.list.mockResolvedValue(page([INQUIRY]))
    complaintsApi.update.mockResolvedValue({})
    renderAt(<InquiriesPage />)
    await screen.findByText('حي قديم')
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }))
    const dialog = screen.getByRole('dialog')
    const area = within(dialog).getByLabelText(/^الحي/)
    await userEvent.click(within(area.parentElement).getByRole('button', { name: 'مسح الاختيار' }))
    expect(area).toHaveValue('')
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    expect(complaintsApi.update.mock.calls[0][1]).toMatchObject({ area: '' })
  })

  it('uses the inquiries rights', async () => {
    auth.perms = new Set(['inquiries.view', 'complaints.edit', 'complaints.export'])
    complaintsApi.list.mockResolvedValue(page([INQUIRY]))
    renderAt(<InquiriesPage />)
    await screen.findByText('حي قديم')
    expect(screen.queryByRole('button', { name: /إضافة استفسار/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /تصدير/ })).not.toBeInTheDocument()
    expect(neighborhoodsApi.list).not.toHaveBeenCalled()
  })
})

describe('ComplaintsReportPage («تصدير PDF»)', () => {
  const print = vi.fn()
  beforeEach(() => {
    window.print = print
  })
  afterEach(() => {
    delete window.print
  })

  it('loads every page of matching records and prints a table with one column per field', async () => {
    const second = { ...COMPLAINT, id: 8, name: 'خالد', hide_identity: false, channel: 'phone', channel_display: 'اتصال هاتفي' }
    complaintsApi.list.mockImplementation(async (params) =>
      params.page === 1
        ? { count: 2, next: 'page2', previous: null, results: [COMPLAINT] }
        : { count: 2, next: null, previous: 'page1', results: [second] },
    )
    renderAt(<ComplaintsReportPage kind="complaint" />, '/complaints/report?upload=pending&search=مياه')
    const table = await screen.findByRole('table')
    expect(complaintsApi.list).toHaveBeenCalledTimes(2)
    expect(complaintsApi.list.mock.calls[0][0]).toEqual({
      kind: 'complaint',
      upload: 'pending',
      search: 'مياه',
      page: 1,
      page_size: 100,
    })
    expect(complaintsApi.list.mock.calls[1][0]).toMatchObject({ page: 2, page_size: 100 })

    expect(screen.getByRole('heading', { name: 'سجل الشكاوى' })).toBeInTheDocument()
    expect(screen.getByText('بلدية غزة')).toBeInTheDocument()
    expect(screen.getByText('قسم المعلومات والشكاوي')).toBeInTheDocument()
    expect(screen.getByText(/حالة الرفع: بانتظار الرفع/)).toHaveTextContent('عبارة البحث: «مياه»')
    expect(screen.getByText('تم إنشاء التقرير من نظام قسم المعلومات والشكاوي')).toBeInTheDocument()

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual([
      'م',
      'إخفاء الهوية',
      'رقم الهوية',
      'الاسم',
      'رقم الجوال',
      'رقم النقطة',
      'مبنى',
      'الشارع',
      'نوع الشكوى',
      'المصدر',
      'العنوان',
      'تفاصيل الشكوى',
      'الحالة',
      'تاريخ التسجيل',
    ])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    const first = within(rows[0])
      .getAllByRole('cell')
      .map((td) => td.textContent)
    expect(first.slice(0, 12)).toEqual([
      '1',
      'نعم',
      '401234567',
      'محمد أحمد',
      '0599123456',
      '12',
      '5A',
      '1050',
      'انقطاع مياه',
      'واتساب',
      '',
      'السطر الأول\nالسطر الثاني',
    ])
    expect(first[12]).toBe('بانتظار الرفع')
    expect(within(rows[1]).getByText('اتصال هاتفي')).toBeInTheDocument()
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1)) // the print dialog opens by itself
  })

  it('the inquiries report has the inquiry columns', async () => {
    complaintsApi.list.mockResolvedValue({ count: 1, next: null, previous: null, results: [INQUIRY] })
    renderAt(<ComplaintsReportPage kind="inquiry" />, '/inquiries/report')
    const table = await screen.findByRole('table')
    expect(screen.getByRole('heading', { name: 'سجل الاستفسارات' })).toBeInTheDocument()
    expect(screen.getByText('حالة الرفع: الكل')).toBeInTheDocument()
    expect(complaintsApi.list.mock.calls[0][0]).toEqual({ kind: 'inquiry', page: 1, page_size: 100 })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual([
      'م',
      'رقم الهوية',
      'الاسم',
      'رقم الجوال',
      'نوع الاستفسار',
      'المصدر',
      'الحي',
      'نص الاستفسار',
      'الحالة',
      'تاريخ التسجيل',
    ])
    expect(within(table).getByText('تطبيق البلدية')).toBeInTheDocument()
    expect(within(table).getByText('حي قديم')).toBeInTheDocument()
  })
})
