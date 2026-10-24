import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GuideEditor from '../components/devpanel/GuideEditor'
import { ContentProvider } from '../context/ContentContext'
import { ToastProvider } from '../context/ToastContext'
import { contentApi } from '../services/api'

const GUIDE = [
  {
    id: 'a',
    title: 'قسم أ',
    summary: 'وصف',
    url: 'https://example.org/a',
    stages: [{ id: 's1', title: 'مرحلة ١', blocks: [{ type: 'steps', items: ['خطوة أولى', 'خطوة ثانية'] }] }],
  },
  { id: 'b', title: 'قسم ب', stages: [] },
]

function renderEditor() {
  return render(
    <ToastProvider>
      <ContentProvider>
        <GuideEditor />
      </ContentProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(contentApi, 'all').mockResolvedValue({ 'guide.sections': GUIDE })
  vi.spyOn(contentApi, 'save').mockResolvedValue({})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

const saved = () => contentApi.save.mock.calls.at(-1)[1]

describe('GuideEditor (developer dashboard)', () => {
  it('edits a section, a stage and its steps without JSON, then saves the whole guide', async () => {
    renderEditor()
    expect(await screen.findByRole('button', { name: 'قسم أ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حفظ الدليل' })).toBeDisabled() // nothing changed yet

    await userEvent.clear(screen.getByLabelText('عنوان القسم'))
    await userEvent.type(screen.getByLabelText('عنوان القسم'), 'قسم معدّل')
    await userEvent.click(screen.getByRole('button', { name: 'فتح المرحلة' }))
    const steps = screen.getByLabelText(/البنود/)
    expect(steps).toHaveValue('خطوة أولى\nخطوة ثانية')
    await userEvent.type(steps, '{enter}خطوة ثالثة')

    expect(screen.getByText(/تعديلات غير محفوظة/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'حفظ الدليل' }))
    expect(contentApi.save).toHaveBeenCalledWith('guide.sections', expect.any(Array))
    expect(saved()[0]).toMatchObject({ id: 'a', title: 'قسم معدّل', stages: [{ id: 's1', blocks: [{ type: 'steps', items: ['خطوة أولى', 'خطوة ثانية', 'خطوة ثالثة'] }] }] })
    expect(JSON.stringify(saved())).not.toContain('_k') // no editor-only keys are saved
  })

  it('adds and deletes sections, stages and blocks', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'قسم أ' })
    // a new section with a stage holding a note
    await userEvent.click(screen.getByRole('button', { name: /إضافة قسم/ }))
    await userEvent.click(screen.getByRole('button', { name: /إضافة مرحلة/ }))
    await userEvent.type(screen.getByLabelText('عنوان المرحلة'), 'مرحلة جديدة')
    await userEvent.click(screen.getByRole('button', { name: 'فتح المرحلة' }))
    await userEvent.selectOptions(screen.getByLabelText('إضافة عنصر'), 'note')
    await userEvent.type(screen.getByLabelText('النص'), 'انتبه لهذا')
    // delete «قسم ب»
    await userEvent.click(screen.getByRole('button', { name: 'قسم ب' }))
    await userEvent.click(screen.getByRole('button', { name: 'حذف القسم' }))

    await userEvent.click(screen.getByRole('button', { name: 'حفظ الدليل' }))
    expect(saved().map((s) => s.title)).toEqual(['قسم أ', 'قسم جديد'])
    expect(saved()[1].stages[0]).toMatchObject({ title: 'مرحلة جديدة', blocks: [{ type: 'note', tone: 'tip', text: 'انتبه لهذا' }] })
  })

  it('a table is typed one row per line, cells separated by «|»', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'قسم أ' })
    await userEvent.click(screen.getByRole('button', { name: 'فتح المرحلة' }))
    await userEvent.selectOptions(screen.getByLabelText('إضافة عنصر'), 'table')
    const table = screen.getByLabelText(/^الجدول/)
    await userEvent.clear(table)
    await userEvent.type(table, 'العمود 1 | العمود 2{enter}أ | ب')
    await userEvent.click(screen.getByRole('button', { name: 'حفظ الدليل' }))
    expect(saved()[0].stages[0].blocks[1]).toMatchObject({ type: 'table', head: ['العمود 1', 'العمود 2'], rows: [['أ', 'ب']] })
  })

  it('won’t save a stage without a title', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'قسم أ' })
    await userEvent.click(screen.getByRole('button', { name: /إضافة مرحلة/ }))
    await userEvent.click(screen.getByRole('button', { name: 'حفظ الدليل' }))
    expect(within(screen.getByRole('alert')).getByText(/لكل مرحلة/)).toBeInTheDocument()
    expect(contentApi.save).not.toHaveBeenCalled()
  })
})
