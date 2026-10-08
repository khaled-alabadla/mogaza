import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const TABLE = {
  today: 2,
  today_display: 'الاثنين',
  results: [
    { id: 1, days: [0, 3], note: '', area_list: [{ id: 11, name: 'النديم' }, { id: 12, name: 'عين جالوت' }] },
    { id: 2, days: [2, 6], note: '', area_list: [{ id: 21, name: 'الدرج' }, { id: 22, name: 'مدرسة موسى بن نصير' }] },
  ],
}

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

  it('submits sorted days and parsed addresses', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    render(<WaterRowForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'الأربعاء' }))
    await userEvent.click(screen.getByRole('button', { name: 'السبت' }))
    await userEvent.type(screen.getByLabelText(/العنوان/), 'الثلاثيني / الشفا')
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الموعد' }))
    expect(onSubmit).toHaveBeenCalledWith({ days: [0, 4], areas: ['الثلاثيني', 'الشفا'], note: '' })
  })

  it('prefills an existing row for editing', () => {
    render(<WaterRowForm row={TABLE.results[0]} onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'السبت' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'الأحد' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText(/العنوان/)).toHaveValue('النديم\nعين جالوت')
  })
})

describe('WaterSchedulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    waterTableApi.list.mockResolvedValue(TABLE)
    auth.canEdit = true
  })

  it('renders the table like the paper and marks today', async () => {
    render(<WaterSchedulePage />)
    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByText('السبت / الثلاثاء')).toBeInTheDocument()
    expect(within(items[0]).getByText('النديم')).toBeInTheDocument()
    expect(within(items[1]).getByText('الاثنين / الجمعة')).toBeInTheDocument()
    expect(within(items[1]).getByText('تصل المياه اليوم')).toBeInTheDocument()
    expect(within(items[0]).queryByText('تصل المياه اليوم')).not.toBeInTheDocument()
  })

  it('search keeps only rows with matching addresses', async () => {
    render(<WaterSchedulePage />)
    await screen.findByText('الدرج')
    await userEvent.type(screen.getByLabelText('البحث في جدول المياه'), 'موسي')
    expect(screen.queryByText('النديم')).not.toBeInTheDocument()
    expect(screen.getByText('مدرسة موسى بن نصير')).toBeInTheDocument()
  })

  it('hides editing controls for viewers', async () => {
    auth.canEdit = false
    render(<WaterSchedulePage />)
    await screen.findByText('الدرج')
    expect(screen.queryByRole('button', { name: /إضافة موعد/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
  })

  it('deletes a row after confirmation', async () => {
    waterTableApi.remove.mockResolvedValue()
    render(<WaterSchedulePage />)
    await screen.findByText('الدرج')
    await userEvent.click(screen.getAllByRole('button', { name: /حذف/ })[0])
    expect(screen.getByText('هل أنت متأكد من حذف هذا الموعد وكل عناوينه من الجدول؟')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'حذف' }))
    expect(waterTableApi.remove).toHaveBeenCalledWith(1)
  })
})
