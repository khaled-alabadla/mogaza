import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WaterRowForm, { parseAreas } from '../components/WaterRowForm'
import { normalizeArabic } from '../utils/arabic'

const auth = { edit: true, can: (key) => (key === 'water.edit' ? auth.edit : key === 'water.view') }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../services/api', () => ({
  waterTableApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const { waterTableApi } = await import('../services/api')
const { default: WaterSchedulePage } = await import('../pages/WaterSchedulePage')

const area = (id, name, source) => ({
  id,
  name,
  source,
  source_display: { mekorot: 'خط ماكروت', wells: 'الآبار المحلية', '': 'غير مصنّف' }[source],
})

const TABLE = {
  today: 2,
  today_display: 'الاثنين',
  results: [
    { id: 1, days: [0, 3], note: '', area_list: [area(11, 'النديم', 'mekorot'), area(12, 'عين جالوت', 'wells')] },
    { id: 2, days: [2, 6], note: '', area_list: [area(21, 'الدرج', 'mekorot'), area(22, 'مدرسة موسى بن نصير', '')] },
  ],
}

const renderPage = (url = '/water?by=schedule') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <WaterSchedulePage />
    </MemoryRouter>,
  )
/** The table row (li) that shows these days. */
const rowOf = (days) => screen.getByText(days).closest('li')

describe('parseAreas / normalizeArabic', () => {
  it('splits on new lines, slashes and Arabic commas, trims and de-duplicates', () => {
    expect(parseAreas(' النديم / عين جالوت\nنادي الزيتون،  النديم \n\n')).toEqual(['النديم', 'عين جالوت', 'نادي الزيتون'])
  })
  it('folds Arabic spelling variants', () => {
    expect(normalizeArabic('مدرسة موسى')).toBe(normalizeArabic('مدرسه موسي'))
    expect(normalizeArabic('أبو خضرة')).toBe('ابو خضره')
  })
})

describe('WaterRowForm', () => {
  it('requires at least one day and one address', async () => {
    const onSubmit = vi.fn()
    render(<WaterRowForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الموعد' }))
    expect(screen.getByText('اختر يوماً واحداً على الأقل.')).toBeInTheDocument()
    expect(screen.getByText('أدخل عنواناً واحداً على الأقل.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits sorted days and the addresses with their water source', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    render(<WaterRowForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'الأربعاء' }))
    await userEvent.click(screen.getByRole('button', { name: 'السبت' }))
    await userEvent.type(screen.getByLabelText('خط ماكروت'), 'الثلاثيني / الشفا')
    await userEvent.type(screen.getByLabelText('الآبار المحلية'), 'السدرة{enter}الشفا')
    await userEvent.type(screen.getByLabelText('غير مصنّف'), 'البندر')
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الموعد' }))
    expect(onSubmit).toHaveBeenCalledWith({
      days: [0, 4],
      areas: [
        { name: 'الثلاثيني', source: 'mekorot' },
        { name: 'الشفا', source: 'mekorot' }, // typed in two boxes: the first one wins
        { name: 'السدرة', source: 'wells' },
        { name: 'البندر', source: '' },
      ],
      note: '',
    })
  })

  it('prefills an existing row, each area in its source box', () => {
    render(<WaterRowForm row={TABLE.results[1]} onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'الاثنين' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'الأحد' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('خط ماكروت')).toHaveValue('الدرج')
    expect(screen.getByLabelText('الآبار المحلية')).toHaveValue('')
    expect(screen.getByLabelText('غير مصنّف')).toHaveValue('مدرسة موسى بن نصير')
  })
})

describe('WaterSchedulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    waterTableApi.list.mockResolvedValue(TABLE)
    auth.edit = true
  })

  it('renders the full table like the paper and marks today', async () => {
    renderPage()
    await screen.findByText('الدرج')
    expect(screen.getByRole('heading', { name: 'جدول توزيع المياه' })).toBeInTheDocument()
    expect(within(rowOf('السبت / الثلاثاء')).getByText('النديم')).toBeInTheDocument()
    expect(within(rowOf('السبت / الثلاثاء')).getByText('عين جالوت')).toBeInTheDocument()
    expect(within(rowOf('الاثنين / الجمعة')).getByText('تصل المياه اليوم')).toBeInTheDocument()
    expect(within(rowOf('السبت / الثلاثاء')).queryByText('تصل المياه اليوم')).not.toBeInTheDocument()
    // classified areas carry a source dot in the full view
    expect(within(rowOf('السبت / الثلاثاء')).getByLabelText('الآبار المحلية')).toBeInTheDocument()
  })

  it('the source list shows only the areas fed by that source', async () => {
    renderPage()
    await screen.findByText('الدرج')
    await userEvent.selectOptions(screen.getByLabelText('مصدر المياه'), 'mekorot')
    expect(screen.getByRole('heading', { name: 'جدول مياه خط ماكروت' })).toBeInTheDocument()
    expect(screen.getByText('النديم')).toBeInTheDocument()
    expect(screen.getByText('الدرج')).toBeInTheDocument()
    expect(screen.queryByText('عين جالوت')).not.toBeInTheDocument()
    expect(screen.queryByText('مدرسة موسى بن نصير')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('مصدر المياه'), 'wells')
    expect(screen.getByText('عين جالوت')).toBeInTheDocument()
    expect(screen.queryByText('الاثنين / الجمعة')).not.toBeInTheDocument() // a row with no wells areas is hidden
  })

  it('opens on a source tab from its link and edits the whole row', async () => {
    renderPage('/water?by=schedule&source=wells')
    await screen.findByText('عين جالوت')
    expect(screen.getByLabelText('مصدر المياه')).toHaveValue('wells')
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }))
    // the form gets every area of the row, not only the filtered ones
    expect(screen.getByLabelText('خط ماكروت')).toHaveValue('النديم')
    expect(screen.getByLabelText('الآبار المحلية')).toHaveValue('عين جالوت')
  })

  it('«حسب الأيام» gathers every area of each weekday, today first', async () => {
    renderPage('/water') // the default view
    await screen.findAllByText('الدرج')
    expect(screen.getByLabelText('طريقة العرض')).toHaveValue('')
    const day = (name) => screen.getByRole('region', { name })
    // row 1 = Saturday + Tuesday, row 2 = Monday + Friday
    expect(within(day('السبت')).getByText('النديم')).toBeInTheDocument()
    expect(within(day('الثلاثاء')).getByText('عين جالوت')).toBeInTheDocument()
    expect(within(day('الجمعة')).getByText('الدرج')).toBeInTheDocument()
    expect(within(day('الأحد')).getByText('لا توجد مواعيد في هذا اليوم.')).toBeInTheDocument()
    expect(within(day('الاثنين')).getByText('تصل المياه اليوم')).toBeInTheDocument() // today = Monday (2)
    // today first, then the coming days in order
    const days = screen.getAllByRole('region').map((el) => el.getAttribute('aria-label'))
    expect(days).toEqual(['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'])
    expect(within(day('الثلاثاء')).getByText('غداً')).toBeInTheDocument()
    // every day is always open: nothing to click to see its areas
    expect(within(day('السبت')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('answers «when does water reach …» directly, with the next visit', async () => {
    renderPage('/water')
    await screen.findAllByText('الدرج')
    await userEvent.type(screen.getByLabelText('البحث في جدول المياه'), 'النديم')
    const answer = within(screen.getByRole('region', { name: 'موعد المياه للمنطقة' }))
    expect(answer.getByText('النديم')).toBeInTheDocument()
    expect(answer.getByText('السبت والثلاثاء')).toBeInTheDocument()
    expect(answer.getByText('الموعد القادم: غداً (الثلاثاء)')).toBeInTheDocument() // today is Monday
    await userEvent.clear(screen.getByLabelText('البحث في جدول المياه'))
    await userEvent.type(screen.getByLabelText('البحث في جدول المياه'), 'الدرج')
    expect(within(screen.getByRole('region', { name: 'موعد المياه للمنطقة' })).getByText('تصل المياه اليوم')).toBeInTheDocument()
  })

  it('«حسب الأيام» follows the source tab and the search', async () => {
    renderPage('/water?source=wells')
    expect(await screen.findAllByText('عين جالوت')).toHaveLength(2) // Saturday and Tuesday
    expect(screen.queryByText('النديم')).not.toBeInTheDocument() // mekorot area hidden
    await userEvent.selectOptions(screen.getByLabelText('مصدر المياه'), '')
    expect(screen.getByLabelText('طريقة العرض')).toHaveValue('') // mode kept
    await userEvent.type(screen.getByLabelText('البحث في جدول المياه'), 'الجمعة')
    expect(screen.getByRole('region', { name: 'الجمعة' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'السبت' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'موعد المياه للمنطقة' })).not.toBeInTheDocument() // a weekday, not an area
  })

  it('switches to «حسب المواعيد» from the list', async () => {
    renderPage('/water')
    await screen.findAllByText('الدرج')
    await userEvent.selectOptions(screen.getByLabelText('طريقة العرض'), 'schedule')
    expect(screen.getByText('السبت / الثلاثاء')).toBeInTheDocument()
  })

  it('«حسب المواعيد» marks today and tomorrow, every appointment open', async () => {
    renderPage()
    await screen.findByText('الدرج')
    expect(within(rowOf('الاثنين / الجمعة')).getByText('تصل المياه اليوم')).toBeInTheDocument() // today (Monday)
    expect(within(rowOf('السبت / الثلاثاء')).getByText('غداً')).toBeInTheDocument() // tomorrow (Tuesday)
    expect(within(rowOf('السبت / الثلاثاء')).getByText('النديم')).toBeVisible()
  })

  it('search keeps only rows with matching addresses', async () => {
    renderPage()
    await screen.findByText('الدرج')
    await userEvent.type(screen.getByLabelText('البحث في جدول المياه'), 'موسي')
    expect(screen.queryByText('النديم')).not.toBeInTheDocument()
    expect(screen.getAllByText('مدرسة موسى بن نصير')).toHaveLength(2) // the answer card + the table
  })

  it('hides editing controls for viewers', async () => {
    auth.edit = false
    renderPage()
    await screen.findByText('الدرج')
    expect(screen.queryByRole('button', { name: /إضافة موعد/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
  })

  it('prints with a formal letterhead for the current view', async () => {
    window.print = vi.fn()
    renderPage('/water?by=schedule&source=mekorot')
    await screen.findByText('الدرج')
    expect(screen.getByText('بلدية غزة | قسم المعلومات والشكاوي')).toBeInTheDocument()
    expect(screen.getAllByText('جدول مياه خط ماكروت')).toHaveLength(2) // screen heading + printed heading
    expect(screen.getByText(/تاريخ الطباعة/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /طباعة/ }))
    expect(window.print).toHaveBeenCalled()
    delete window.print
  })

  it('deletes a row after confirmation', async () => {
    waterTableApi.remove.mockResolvedValue()
    renderPage()
    await screen.findByText('الدرج')
    await userEvent.click(screen.getAllByRole('button', { name: /حذف/ })[0])
    expect(screen.getByText('هل أنت متأكد من حذف هذا الموعد وكل عناوينه من الجدول؟')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'حذف' }))
    expect(waterTableApi.remove).toHaveBeenCalledWith(1)
  })
})
