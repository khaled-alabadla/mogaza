import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import GuidePage from '../pages/GuidePage'

const renderAt = (url = '/guide') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <GuidePage />
    </MemoryRouter>,
  )

const openButton = () => screen.getByRole('link', { name: 'فتح الصفحة' })
const stage = (name) => screen.getByRole('button', { name })

describe('GuidePage («دليل القسم»)', () => {
  it('opens on «إضافة شكوى» as a short list of its stages, with a button to its page', () => {
    renderAt()
    expect(screen.getByRole('heading', { name: 'دليل القسم' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByRole('tab', { name: 'إضافة شكوى' })).toHaveAttribute('aria-selected', 'true')
    // the stages start closed: only their titles show
    expect(stage(/استقبال المواطن/)).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('صيغة الرد المعتمدة')).not.toBeInTheDocument()
    // only a button (no screenshot), opening the tracking page in a new tab
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(openButton()).toHaveAttribute('href', 'https://tracking.mogaza.org/wf/create/2')
    expect(openButton()).toHaveAttribute('target', '_blank')
    expect(document.querySelector('iframe')).toBeNull() // the framed page can't keep the login
  })

  it('a stage opens and closes; «فتح الكل» opens them all', async () => {
    renderAt()
    await userEvent.click(stage(/تسجيل الشكوى على النظام/))
    expect(screen.getByText('قواعد كتابة التفاصيل')).toBeInTheDocument()
    await userEvent.click(stage(/تسجيل الشكوى على النظام/))
    expect(screen.queryByText('قواعد كتابة التفاصيل')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'فتح الكل' }))
    expect(screen.getByText('صيغة الرد المعتمدة')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'طي الكل' })).toBeInTheDocument()
  })

  it('switches between the sections (short ones open fully)', async () => {
    renderAt()
    await userEvent.click(screen.getByRole('tab', { name: 'البحث عن شكوى' }))
    expect(openButton()).toHaveAttribute('href', 'https://tracking.mogaza.org/wf/search')
    expect(screen.getByText('خطوات البحث')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'التعامل مع المواطن' }))
    expect(screen.queryByRole('link', { name: 'فتح الصفحة' })).not.toBeInTheDocument() // no system page
    await userEvent.click(stage(/قواعد ذهبية/))
    expect(screen.getByText('استمع حتى النهاية')).toBeInTheDocument()
  })

  it('opens the section named in the link; the map has no details yet', () => {
    renderAt('/guide?tab=complaints-map')
    expect(openButton()).toHaveAttribute('href', 'https://tracking.mogaza.org/wf/complaints/map')
    expect(screen.getByText(/سيتم إضافة التفاصيل/)).toBeInTheDocument()
  })

  it('a link inside a stage opens another section', async () => {
    renderAt('/guide?tab=add-inquiry')
    await userEvent.click(screen.getByRole('button', { name: /خطوات البحث عن الشكوى/ }))
    expect(screen.getByRole('tab', { name: 'البحث عن شكوى' })).toHaveAttribute('aria-selected', 'true')
  })

  it('the checklist counts the ticked items', async () => {
    renderAt()
    await userEvent.click(stage(/قائمة التدقيق قبل الحفظ/))
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(11)
    for (const box of boxes) await userEvent.click(box)
    expect(screen.getByRole('status')).toHaveTextContent('الشكوى جاهزة')
  })

  it('uses the guide edited in the developer dashboard, and falls back on a broken edit', async () => {
    const { ContentProvider } = await import('../context/ContentContext')
    const { contentApi } = await import('../services/api')
    const all = vi.spyOn(contentApi, 'all').mockResolvedValue({
      'guide.title': 'دليل جديد',
      'guide.sections': [{ id: 'x', title: 'قسم مُعدَّل', url: 'https://example.org/x', stages: [{ id: 's', title: 'مرحلة', blocks: [{ type: 'p', text: 'نص مُعدَّل' }, { type: 'unknown' }] }] }],
    })
    render(
      <MemoryRouter initialEntries={['/guide']}>
        <ContentProvider>
          <GuidePage />
        </ContentProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'دليل جديد' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'قسم مُعدَّل' })).toBeInTheDocument()
    expect(screen.getByText('نص مُعدَّل')).toBeInTheDocument() // a short section opens; the unknown block is skipped
    all.mockRestore()
  })

  it('copies a ready wording', async () => {
    const user = userEvent.setup()
    renderAt()
    await user.click(stage(/استقبال المواطن/))
    const script = screen.getByText('صيغة الرد المعتمدة').closest('figure')
    await user.click(within(script).getByRole('button', { name: 'نسخ' }))
    expect(await navigator.clipboard.readText()).toContain('السلام عليكم، معك [اسمك] من بلدية غزة')
    expect(within(script).getByRole('button', { name: 'تم النسخ' })).toBeInTheDocument()
  })
})
