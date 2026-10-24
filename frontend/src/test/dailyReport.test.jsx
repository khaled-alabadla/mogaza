import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { perms: new Set(['report.view', 'report.edit']) }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (k) => auth.perms.has(k) }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../services/api', () => ({ dailyReportApi: { get: vi.fn(), save: vi.fn() } }))

const { dailyReportApi } = await import('../services/api')
const { default: DailyReportPage } = await import('../pages/DailyReportPage')

const SAVED = {
  report_date: '2026-10-20',
  rows: [
    { source: 'اتصال هاتفي', complaints: 201, inquiries: 71 },
    { source: 'واتساب', complaints: 2, inquiries: 19 },
  ],
  summons: 3,
  archived: 145,
  updated_at: '2026-10-20T14:00:00+03:00',
  updated_by_name: 'محرر',
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/daily-report']}>
      <DailyReportPage />
    </MemoryRouter>,
  )
const report = () => document.querySelector('.daily-report')

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['report.view', 'report.edit'])
  dailyReportApi.get.mockResolvedValue({ report: SAVED })
})

describe('DailyReportPage', () => {
  it('shows the latest report with its totals, day name and sentences', async () => {
    renderPage()
    await screen.findByText('التقرير اليومي', { selector: 'h2' })
    const card = within(report())
    expect(card.getByText('الثلاثاء')).toBeInTheDocument()
    expect(card.getByText('20/10/2026')).toBeInTheDocument()
    expect(card.getByText('203')).toBeInTheDocument() // 201 + 2 complaints
    expect(card.getByText('90')).toBeInTheDocument() // 71 + 19 inquiries
    expect(card.getByText(/3 استدعاءات/)).toBeInTheDocument()
    expect(card.getByText(/145 مراسلة/)).toBeInTheDocument()
  })

  it('updates the report while typing and saves it with numbers', async () => {
    dailyReportApi.save.mockImplementation(async (body) => ({ report: { ...body, updated_at: '2026-10-21T10:00:00+03:00' } }))
    renderPage()
    await screen.findByText('التقرير اليومي', { selector: 'h2' })
    const save = screen.getByRole('button', { name: 'حفظ التقرير' })
    expect(save).toBeDisabled() // nothing changed yet
    const complaints = screen.getByLabelText('شكاوى واتساب')
    await userEvent.clear(complaints)
    await userEvent.type(complaints, '٥')
    expect(within(report()).getByText('206')).toBeInTheDocument() // total follows the input
    await userEvent.click(screen.getByRole('button', { name: /إضافة مصدر/ }))
    await userEvent.type(screen.getByLabelText('المصدر 3'), 'فيسبوك')
    await userEvent.click(save)
    expect(dailyReportApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        report_date: '2026-10-20',
        summons: 3,
        archived: 145,
        rows: [
          { source: 'اتصال هاتفي', complaints: 201, inquiries: 71 },
          { source: 'واتساب', complaints: 5, inquiries: 19 },
          { source: 'فيسبوك', complaints: 0, inquiries: 0 },
        ],
      }),
    )
  })

  it('starts from the usual sources before the first report, and viewers only see the report', async () => {
    dailyReportApi.get.mockResolvedValue({ report: null })
    auth.perms = new Set(['report.view'])
    renderPage()
    await screen.findByText('التقرير اليومي', { selector: 'h2' })
    expect(within(report()).getByText('الزيارة الميدانية')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حفظ التقرير' })).not.toBeInTheDocument()
  })
})
