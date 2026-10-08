import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecordCardActions } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import Field, { controlClass } from '../components/Field'
import FormActions from '../components/FormActions'
import FormAlert from '../components/FormAlert'
import { ToastProvider } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useFormSubmit from '../hooks/useFormSubmit'

describe('FormAlert', () => {
  it('renders nothing without a message', () => {
    const { container } = render(<FormAlert message="" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('announces the message as an alert', () => {
    render(<FormAlert message="تعذر حفظ البيانات." />)
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر حفظ البيانات.')
  })
})

describe('Field', () => {
  it('links the label to the control and shows the error', () => {
    render(
      <Field id="f-name" label="الاسم" error="الاسم مطلوب.">
        <input id="f-name" className={controlClass('الاسم مطلوب.')} />
      </Field>,
    )
    const input = screen.getByLabelText('الاسم')
    expect(input).toHaveClass('input', 'border-danger-600')
    expect(screen.getByText('الاسم مطلوب.')).toHaveAttribute('id', 'f-name-error')
  })
  it('controlClass keeps the base class when there is no error', () => {
    expect(controlClass(undefined)).toBe('input')
    expect(controlClass('', 'login-input')).toBe('login-input')
  })
})

describe('FormActions', () => {
  it('cancels, and disables both buttons while saving', async () => {
    const onCancel = vi.fn()
    const { rerender } = render(<FormActions submitLabel="حفظ" onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء' }))
    expect(onCancel).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'حفظ' })).toHaveAttribute('type', 'submit')
    rerender(<FormActions saving submitLabel="حفظ" onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeDisabled()
  })
})

describe('AsyncContent', () => {
  const props = { empty: <p>فارغ</p>, children: <p>المحتوى</p> }
  it('shows loading, error (with retry), empty and content states', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<AsyncContent loading {...props} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(<AsyncContent error="تعذر تحميل البيانات." onRetry={onRetry} {...props} />)
    expect(screen.getByText('تعذر تحميل البيانات.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(onRetry).toHaveBeenCalledWith()
    rerender(<AsyncContent error="خطأ" {...props} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<AsyncContent isEmpty {...props} />)
    expect(screen.getByText('فارغ')).toBeInTheDocument()
    rerender(<AsyncContent {...props} />)
    expect(screen.getByText('المحتوى')).toBeInTheDocument()
  })
})

describe('RecordCardActions', () => {
  const record = { id: 7 }
  it('offers restore only in the deleted view for admins', async () => {
    const onRestore = vi.fn()
    const { rerender } = render(<RecordCardActions record={record} deletedView canRestore onRestore={onRestore} />)
    await userEvent.click(screen.getByRole('button', { name: /استعادة/ }))
    expect(onRestore).toHaveBeenCalledWith(record)
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    rerender(<RecordCardActions record={record} deletedView canRestore={false} canEdit />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('useFormSubmit', () => {
  it('stops on client errors, then maps server errors', async () => {
    const { result } = renderHook(() => useFormSubmit('تعذر الحفظ.'))
    const action = vi.fn()
    await act(() => result.current.submit({ name: 'مطلوب' }, action))
    expect(action).not.toHaveBeenCalled()
    expect(result.current.errors).toEqual({ name: 'مطلوب' })

    const onError = vi.fn()
    const serverError = { response: { status: 400, data: { name: ['موجود مسبقاً.'] } } }
    await act(() => result.current.submit({}, () => Promise.reject(serverError), { onError }))
    expect(result.current.errors).toEqual({ name: 'موجود مسبقاً.' })
    expect(result.current.formError).toBe('يرجى تصحيح الحقول المشار إليها.')
    expect(result.current.saving).toBe(false)
    expect(onError).toHaveBeenCalled()
  })
})

describe('useConfirmAction', () => {
  it('runs the action on the chosen record, toasts and closes', async () => {
    const action = vi.fn().mockResolvedValue()
    const onDone = vi.fn()
    const { result } = renderHook(() => useConfirmAction(action, { success: 'تم الحذف.', onDone }), {
      wrapper: ToastProvider,
    })
    act(() => result.current.ask({ id: 3 }))
    expect(result.current.target).toEqual({ id: 3 })
    await act(() => result.current.confirm())
    expect(action).toHaveBeenCalledWith({ id: 3 })
    expect(onDone).toHaveBeenCalled()
    expect(result.current.target).toBeNull()
    expect(screen.getByText('تم الحذف.')).toBeInTheDocument()
  })

  it('keeps the dialog open and shows the error when the action fails', async () => {
    const action = vi.fn().mockRejectedValue({ response: { status: 404, data: {} } })
    const { result } = renderHook(() => useConfirmAction(action, { success: 'تم الحذف.' }), { wrapper: ToastProvider })
    act(() => result.current.ask({ id: 3 }))
    await act(() => result.current.confirm())
    expect(result.current.target).toEqual({ id: 3 })
    expect(result.current.busy).toBe(false)
    expect(screen.getByText('السجل المطلوب غير موجود أو تم حذفه.')).toBeInTheDocument()
  })
})
