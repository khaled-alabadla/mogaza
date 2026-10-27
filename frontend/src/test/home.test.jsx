import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { first_name: 'محمد', username: 'm' } }) }))
vi.mock('../services/api', () => ({ homeApi: { get: vi.fn() } }))

const { homeApi } = await import('../services/api')
const { default: HomePage } = await import('../pages/HomePage')

const WATER = {
  today: 3,
  today_display: 'الثلاثاء',
  areas: [
    { name: 'الشجاعية', source: 'mekorot' },
    { name: 'الدرج', source: '' },
  ],
  tomorrow: { day: 4, display: 'الأربعاء', areas: [{ name: 'الرمال', source: 'wells' }] },
}
const DATA = {
  urgent: { open: 3, oldest_days: 12 },
  complaints: { pending: 0 },
  inquiries: { pending: 4 },
  report: null,
  water: WATER,
  circulars: [{ id: 7, title: 'أعمدة الكهرباء', pinned: true, updated_at: new Date().toISOString() }],
}

const renderHome = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  homeApi.get.mockResolvedValue(DATA)
})

describe('HomePage («الرئيسية»)', () => {
  it('greets the user; what waits comes first as tiles, what is done as a small green line', async () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('محمد')
    const attention = await screen.findByRole('region', { name: 'يحتاج انتباهك' })
    const tiles = within(attention).getAllByRole('link')
    expect(tiles.map((l) => l.getAttribute('href'))).toEqual(['/urgent', '/inquiries', '/daily-report', '/complaints'])
    expect(tiles[0]).toHaveTextContent(/شكاوى عاجلة لم تُحل\s*3/)
    expect(within(attention).getByText('الأقدم مقدمة منذ 12 يوم')).toBeInTheDocument()
    expect(within(attention).getByText('لم يُحدَّث اليوم')).toBeInTheDocument()
    expect(tiles[3]).toHaveTextContent('كلها مرفوعة') // nothing pending: the small line
    expect(screen.getByText(/آخر تحديث الآن/)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('says so in one line when nothing is waiting', async () => {
    homeApi.get.mockResolvedValue({ urgent: { open: 0, oldest_days: null }, complaints: { pending: 0 } })
    renderHome()
    expect(await screen.findByText('ما في شي معلّق اليوم')).toBeInTheDocument()
  })

  it('water: today by default, sorted, with the colours explained; tomorrow on demand', async () => {
    renderHome()
    const water = await screen.findByRole('region', { name: 'تصل المياه اليوم' })
    expect(within(water).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['الدرج', 'الشجاعية'])
    expect(within(water).getByText('خط ماكروت')).toBeInTheDocument() // the legend: only the sources shown
    expect(within(water).queryByText('الآبار المحلية')).not.toBeInTheDocument()
    await userEvent.click(within(water).getByRole('tab', { name: 'غداً' }))
    const tomorrow = screen.getByRole('region', { name: 'تصل المياه غداً' })
    expect(within(tomorrow).getByText('الأربعاء')).toBeInTheDocument()
    expect(within(tomorrow).getByText('الرمال')).toBeInTheDocument()
  })

  it('a circular opens on itself in the circulars page', async () => {
    renderHome()
    const circulars = await screen.findByRole('region', { name: 'آخر التعميمات' })
    expect(within(circulars).getByRole('link', { name: /أعمدة الكهرباء/ })).toHaveAttribute('href', '/circulars?open=7')
  })

  it('shows only the parts the server sent, and a message when there is none', async () => {
    homeApi.get.mockResolvedValue({ water: WATER })
    const { unmount } = renderHome()
    expect(await screen.findByRole('region', { name: 'تصل المياه اليوم' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'يحتاج انتباهك' })).not.toBeInTheDocument()
    unmount()
    homeApi.get.mockResolvedValue({})
    renderHome()
    expect(await screen.findByText('لا يوجد ما يُعرض هنا لحسابك')).toBeInTheDocument()
  })

  it('offers to retry when loading fails', async () => {
    homeApi.get.mockRejectedValueOnce(new Error('offline'))
    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByRole('region', { name: 'يحتاج انتباهك' })).toBeInTheDocument()
  })
})
