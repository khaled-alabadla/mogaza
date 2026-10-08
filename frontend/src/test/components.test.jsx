import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../components/ConfirmDialog'
import LocationCard from '../components/LocationCard'
import { LOCATION_FIELDS } from '../components/recordFields'
import RecordForm from '../components/RecordForm'
import { parseApiError } from '../utils/errors'

const location = {
  id: 1,
  place_name: 'مجلس الوزراء',
  description: 'تل الهوا / شارع القدس',
  building_number: '95',
  street_number: '1050',
}

describe('LocationCard', () => {
  it('shows all location fields', () => {
    render(<LocationCard location={location} canEdit={false} />)
    expect(screen.getByText('مجلس الوزراء')).toBeInTheDocument()
    expect(screen.getByText('تل الهوا / شارع القدس')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
    expect(screen.getByText('1050')).toBeInTheDocument()
  })

  it('hides edit/delete for viewers', () => {
    render(<LocationCard location={location} canEdit={false} />)
    expect(screen.queryByText('تعديل')).not.toBeInTheDocument()
    expect(screen.queryByText('حذف')).not.toBeInTheDocument()
  })

  it('shows edit/delete for editors and calls handlers', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<LocationCard location={location} canEdit onEdit={onEdit} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }))
    await userEvent.click(screen.getByRole('button', { name: /حذف/ }))
    expect(onEdit).toHaveBeenCalledWith(location)
    expect(onDelete).toHaveBeenCalledWith(location)
  })
})

describe('ConfirmDialog', () => {
  it('requires an explicit confirmation click', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open message="هل أنت متأكد من حذف هذا الموقع؟" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('هل أنت متأكد من حذف هذا الموقع؟')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'حذف' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})

describe('RecordForm', () => {
  it('validates the required place name before calling the API', async () => {
    const onSubmit = vi.fn()
    render(<RecordForm fields={LOCATION_FIELDS} submitLabel="إضافة الموقع" onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الموقع' }))
    expect(screen.getByText('اسم المكان مطلوب.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    render(<RecordForm fields={LOCATION_FIELDS} submitLabel="إضافة الموقع" onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText(/اسم المكان/), '  مسجد الوحدة ')
    await userEvent.type(screen.getByLabelText(/الوصف/), 'شارع المجادلة الشاطئ')
    await userEvent.type(screen.getByLabelText(/رقم المبنى/), '122')
    await userEvent.type(screen.getByLabelText(/رقم الشارع/), '60310')
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الموقع' }))
    expect(onSubmit).toHaveBeenCalledWith({
      place_name: 'مسجد الوحدة',
      description: 'شارع المجادلة الشاطئ',
      building_number: '122',
      street_number: '60310',
    })
  })

  it('shows server-side field errors in Arabic', async () => {
    const error = { response: { status: 400, data: { building_number: ['رقم المبنى يحتوي على رموز غير مسموحة.'] } } }
    const onSubmit = vi.fn().mockRejectedValue(error)
    render(<RecordForm fields={LOCATION_FIELDS} submitLabel="حفظ" onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText(/اسم المكان/), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'حفظ' }))
    expect(await screen.findByText('رقم المبنى يحتوي على رموز غير مسموحة.')).toBeInTheDocument()
  })
})

describe('parseApiError', () => {
  it('maps DRF responses to Arabic messages', () => {
    expect(parseApiError({ response: { status: 403, data: {} } }).message).toBe('ليست لديك صلاحية لتنفيذ هذه العملية.')
    expect(parseApiError({ response: { status: 400, data: { detail: 'خطأ' } } }).message).toBe('خطأ')
    expect(parseApiError({}).message).toBe('تعذر الاتصال بالخادم. تحقق من الاتصال بالشبكة.')
  })
})
