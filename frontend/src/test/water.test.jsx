import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WaterRowForm, { parseAreas } from '../components/WaterRowForm'
import { normalizeArabic } from '../utils/arabic'

const auth = { canEdit: true }
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

const renderPage = (url = '/water') =>
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
    auth.canEdit = true
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

  it('the source tabs show only the areas fed by that source', async () => {
    renderPage()
    await screen.findByText('الدرج')
    await userEvent.click(screen.getByRole('tab', { name: 'خط ماكروت' }))
    expect(screen.getByRole('heading', { name: 'جدول المياه — خط ماكروت' })).toBeInTheDocument()
    expect(screen.getByText('النديم')).toBeInTheDocument()
    expect(screen.getByText('الدرج')).toBeInTheDocument()
    expect(screen.queryByText('عين جالوت')).not.toBeInTheDocument()
    expect(screen.queryByText('مدرسة موسى بن نصير')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'الآبار المحلية' }))
    expect(screen.getByText('عين جالوت')).toBeInTheDocument()
    expect(screen.queryByText('الاثنين / الجمعة')).not.toBeInTheDocument() // a row with no wells areas is hidden
  })

  it('opens on a source tab from its link and edits the whole row', async () => {
    renderPage('/water?source=wells')
    await screen.findByText('عين جالوت')
    expect(screen.getByRole('tab', { name: 'الآبار المحلية' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }))
    // the form gets every area of the row, not only the filtered ones
    expect(screen.getByLabelText('خط ماكروت')).toHaveValue('النديم')
    expect(screen.getByLabelText('الآبار المحلية')).toHaveValue('عين جالوت')
  })

  it('search keeps only rows with matching addresses', async () => {
    renderPage()
    await screen.findByText('الدرج')
    await userEvent.type(screen.getByLabelText('البحث في جدول المياه'), 'موسي')
    expect(screen.queryByText('النديم')).not.toBeInTheDocument()
    expect(screen.getByText('مدرسة موسى بن نصير')).toBeInTheDocument()
  })

  it('hides editing controls for viewers', async () => {
    auth.canEdit = false
    renderPage()
    await screen.findByText('الدرج')
    expect(screen.queryByRole('button', { name: /إضافة موعد/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
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
