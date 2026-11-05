import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    markUploaded: vi.fn(),
    exportUrl: (params) => `/api/complaints/export/?${new URLSearchParams(params)}`,
  },
}))

const { complaintsApi } = await import('../services/api')
const { default: ComplaintsPage } = await import('../pages/ComplaintsPage')
const { default: ComplaintFormPage } = await import('../pages/ComplaintFormPage')
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
    expect(screen.getByText('منطقة قديمة')).toBeInTheDocument()
    expect(screen.getByText('بيانات صاحب الشكوى مخفية')).toBeInTheDocument()
    expect(screen.queryByText('اشتراك')).not.toBeInTheDocument() // empty fields are not listed
    expect(screen.getByText(/السطر الأول/)).toBeInTheDocument()
    // adding is its own page: the list only links to it
    expect(screen.getAllByRole('link', { name: /إضافة شكوى/ })[0]).toHaveAttribute('href', '/complaints/new')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: /إضافة شكوى/ })).not.toBeInTheDocument()
    for (const name of [/تعديل/, /حذف/, /^تم الرفع$/]) {
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
  it('has its own list and the form of the main system, with its lists and required fields', async () => {
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
    const area = await within(dialog).findByLabelText(/^الحي/)
    const submit = within(dialog).getByRole('button', { name: 'إضافة الاستفسار' })
    await userEvent.click(submit)
    for (const message of ['الاسم مطلوب.', 'نوع الاستفسار مطلوب.', 'المصدر مطلوب.', 'الحي مطلوب.', 'نص الاستفسار مطلوب.']) {
      expect(await within(dialog).findByText(message)).toBeInTheDocument()
    }
    expect(within(dialog).queryByText('رقم الهوية مطلوب.')).not.toBeInTheDocument()
    expect(complaintsApi.create).not.toHaveBeenCalled()
    // the main system's lists; typing part of a name narrows them
    await userEvent.type(area, 'مسجد الشهداء')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('الزيتون - مسجد الشهداء')
    await choose(area, 'الزيتون - مسجد الشهداء')
    await choose(within(dialog).getByLabelText(/^نوع الاستفسار/), 'مياه - استفسار مياه')
    await choose(within(dialog).getByLabelText(/^المصدر/), 'زيارة')
    await userEvent.type(within(dialog).getByLabelText(/^الاسم/), 'سارة')
    await userEvent.type(within(dialog).getByLabelText(/نص الاستفسار/), 'متى موعد المياه؟')
    await userEvent.click(submit)
    const sent = complaintsApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({
      kind: 'inquiry',
      national_id: '',
      name: 'سارة',
      category: 'مياه - استفسار مياه',
      channel: 'visit',
      area: 'الزيتون - مسجد الشهداء',
      details: 'متى موعد المياه؟',
    })
    expect(sent).not.toHaveProperty('point')
  }, 15000)

  it('a record by the hidden account (no creator name) shows no «بواسطة»', async () => {
    complaintsApi.list.mockResolvedValue(page([{ ...INQUIRY, created_by_name: null, uploaded_by_name: null }]))
    renderAt(<InquiriesPage />)
    await screen.findByText('حي قديم')
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument()
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
  })

  it('keeps a stored «الحي» that is not in the list when editing', async () => {
    complaintsApi.list.mockResolvedValue(page([INQUIRY]))
    complaintsApi.update.mockResolvedValue({})
    renderAt(<InquiriesPage />)
    expect(await screen.findByText('حي قديم')).toBeInTheDocument() // the card shows the stored name
    expect(screen.getByText('تطبيق البلدية')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }))
    const dialog = screen.getByRole('dialog')
    const area = await within(dialog).findByLabelText(/^الحي/)
    expect(area).toHaveValue('حي قديم')
    expect((await optionsOf(area)).slice(0, 2)).toEqual(['حي قديم', 'البلاخية'])
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument() // Escape closes the list, not the dialog
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    expect(complaintsApi.update.mock.calls[0][1]).toMatchObject({ area: 'حي قديم', channel: 'app' })
  })

  it('a stored «الحي» can\u2019t be emptied, one that was never filled in can stay empty', async () => {
    complaintsApi.list.mockResolvedValue(page([INQUIRY]))
    complaintsApi.update.mockResolvedValue({})
    renderAt(<InquiriesPage />)
    await screen.findByText('حي قديم')
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }))
    const dialog = screen.getByRole('dialog')
    const area = await within(dialog).findByLabelText(/^الحي/)
    await userEvent.click(within(area.parentElement).getByRole('button', { name: 'مسح الاختيار' }))
    expect(area).toHaveValue('')
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    expect(await within(dialog).findByText('الحي مطلوب.')).toBeInTheDocument()
    expect(complaintsApi.update).not.toHaveBeenCalled()
  })

  it('uses the inquiries rights', async () => {
    auth.perms = new Set(['inquiries.view', 'complaints.edit', 'complaints.export'])
    complaintsApi.list.mockResolvedValue(page([INQUIRY]))
    renderAt(<InquiriesPage />)
    await screen.findByText('حي قديم')
    expect(screen.queryByRole('button', { name: /إضافة استفسار/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /تصدير/ })).not.toBeInTheDocument()
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
      'رقم النقطة',
      'رقم الجوال',
      'مبنى',
      'الشارع',
      'اشتراك',
      'نوع الشكوى',
      'المصدر',
      'المنطقة',
      'العنوان',
      'التفاصيل',
      'الحالة',
      'تاريخ التسجيل',
    ])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    const first = within(rows[0])
      .getAllByRole('cell')
      .map((td) => td.textContent)
    expect(first.slice(0, 15)).toEqual([
      '1',
      'نعم',
      '401234567',
      'محمد أحمد',
      '12',
      '0599123456',
      '5A',
      '1050',
      '',
      'انقطاع مياه',
      'واتساب',
      'منطقة قديمة',
      '',
      'السطر الأول\nالسطر الثاني',
      'بانتظار الرفع',
    ])
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

describe('ComplaintFormPage («إضافة شكوى»)', () => {
  const renderForm = (url = '/complaints/new') =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/complaints" element={<p>قائمة الشكاوى</p>} />
          <Route path="/complaints/new" element={<ComplaintFormPage />} />
          <Route path="/complaints/:id/edit" element={<ComplaintFormPage />} />
        </Routes>
      </MemoryRouter>,
    )
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'حفظ الشكوى' }))

  it('has the fields of the main system, none of its draft / transfer / attachment parts', async () => {
    renderForm()
    expect(screen.getByRole('heading', { name: 'إضافة شكوى' })).toBeInTheDocument()
    for (const label of [
      'إخفاء بيانات صاحب الشكوى',
      'مقدم الشكوى',
      'رقم الهوية',
      'الاسم',
      'رقم النقطة',
      'رقم الجوال',
      'مبنى',
      'الشارع',
      'اشتراك',
      'نوع الشكوى',
      'المصدر',
      'المنطقة',
      'العنوان',
      'رمز الإيصال',
      'رقم الإيصال',
      'سبب الاستثناء',
      'عنوان الطلب',
      'التفاصيل',
    ]) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument()
    }
    for (const gone of [/مسودة/, /تحويل/, /المرفقات/]) expect(screen.queryByText(gone)).not.toBeInTheDocument()
    // for show only: nobody can fill these in
    for (const label of ['مقدم الشكوى', 'رمز الإيصال', 'رقم الإيصال', 'سبب الاستثناء', 'عنوان الطلب']) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeDisabled()
    }
    expect(await optionsOf(screen.getByLabelText(/^نوع الشكوى/))).toContain('مياه - انقطاع مياه')
    expect(await optionsOf(screen.getByLabelText(/^المنطقة/))).toContain('الشيخ رضوان - مدرسة الزهاوي')
  })

  it('asks for the required fields, then saves and goes to the list', async () => {
    complaintsApi.create.mockResolvedValue({ id: 1 })
    renderForm()
    await submit()
    for (const message of ['رقم الهوية مطلوب.', 'الاسم مطلوب.', 'نوع الشكوى مطلوب.', 'التفاصيل مطلوب.']) {
      expect(await screen.findByText(message)).toBeInTheDocument()
    }
    expect(complaintsApi.create).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/^رقم الهوية/), '401234567')
    await userEvent.type(screen.getByLabelText(/^الاسم/), 'محمد')
    await choose(screen.getByLabelText(/^نوع الشكوى/), 'مياه - غير ذلك')
    await userEvent.type(screen.getByLabelText(/^التفاصيل/), 'منذ يومين')
    await submit()
    await screen.findByText('قائمة الشكاوى')
    const sent = complaintsApi.create.mock.calls[0][0]
    for (const shownOnly of ['submitter_type', 'receipt_prefix', 'receipt_number', 'exception_reason', 'title']) {
      expect(sent).not.toHaveProperty(shownOnly)
    }
    expect(sent).toMatchObject({
      kind: 'complaint',
      national_id: '401234567',
      name: 'محمد',
      category: 'مياه - غير ذلك',
      details: 'منذ يومين',
      channel: '',
      area: '',
    })
  }, 15000)

  it('a type with a ready text fills «التفاصيل», without replacing what was written by hand', async () => {
    renderForm()
    const details = screen.getByLabelText(/^التفاصيل/)
    await choose(screen.getByLabelText(/^نوع الشكوى/), 'مياه - انقطاع مياه')
    expect(details.value).toBe(
      'السيد/ م.م.ع المياه والصرف الصحي حفظه الله\nوردتنا شكوى بخصوص انقطاع مياه في العنوان المرفق، نرجو الإيعاز لعمل اللازم.\nمع التحية والتقدير\nقسم المعلومات والشكاوى',
    )
    // another type: its text replaces the ready one; a type without one leaves it empty
    await choose(screen.getByLabelText(/^نوع الشكوى/), 'صحة - كلاب ضالة')
    expect(details.value).toContain('كلاب ضالة')
    await choose(screen.getByLabelText(/^نوع الشكوى/), 'مياه - غير ذلك')
    expect(details).toHaveValue('')
    // text written by hand stays
    await userEvent.type(details, 'نص كتبته')
    await choose(screen.getByLabelText(/^نوع الشكوى/), 'مياه - انقطاع مياه')
    expect(details).toHaveValue('نص كتبته')
  }, 15000)

  it('edits a complaint on the same page; a stored type not in the lists is kept', async () => {
    complaintsApi.get.mockResolvedValue(COMPLAINT)
    complaintsApi.update.mockResolvedValue(COMPLAINT)
    renderForm('/complaints/7/edit')
    expect(await screen.findByRole('heading', { name: 'تعديل الشكوى' })).toBeInTheDocument()
    expect(complaintsApi.get.mock.calls[0][0]).toBe('7')
    expect(await screen.findByDisplayValue('انقطاع مياه')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))
    await screen.findByText('قائمة الشكاوى')
    expect(complaintsApi.update.mock.calls[0][1]).toMatchObject({ category: 'انقطاع مياه', area: 'منطقة قديمة' })
  })
})
