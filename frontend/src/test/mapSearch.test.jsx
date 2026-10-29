import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { perms: new Set(['search.view', 'water.view']) }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (k) => auth.perms.has(k) }) }))
vi.mock('../services/api', () => ({ locationsApi: { list: vi.fn() } }))
// a few of the city's OpenStreetMap places (the real file holds ~4,000)
vi.mock('../data/gazaPlaces.json', () => ({
  default: {
    places: [
      ['مسجد الفرقان', 'مسجد', 31.53, 34.46],
      ['مدرسة الفرقان الاساسية المشتركة', 'مدرسة', 31.52, 34.45],
      ['شارع صيام', 'شارع', 31.49, 34.45, [31.488, 34.449, 31.492, 34.452]],
      ['صيدلية الشفاء', 'صيدلية', 31.52, 34.44],
    ],
  },
}))

const { locationsApi } = await import('../services/api')
const { default: MapSearch } = await import('../components/MapSearch')

const HOODS = [{ name: 'الدرج' }, { name: 'الرمال الشمالي' }, { name: 'الرمال الجنوبي' }]

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['search.view', 'water.view'])
  locationsApi.list.mockResolvedValue({
    results: [
      { id: 1, place_name: 'مسجد احمد ياسين', description: 'مخيم الشاطئ', neighborhood_name: 'مخيم الشاطئ', latitude: '31.536900', longitude: '34.450800' },
      { id: 2, place_name: 'مسجد بلا موقع', description: '', latitude: null, longitude: null }, // no coordinates: left out
    ],
  })
})

describe('MapSearch (the map search box)', () => {
  it('finds our locations and the city places in one list (ours first), without saying where from', async () => {
    const onPick = vi.fn()
    render(<MapSearch neighborhoods={HOODS} onPick={onPick} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'ابحث على الخريطة' }), 'مسجد')
    const list = await screen.findByRole('listbox', { name: 'نتائج البحث' })
    await within(list).findByText('مسجد احمد ياسين')
    await within(list).findByText('مسجد الفرقان')
    expect(within(list).queryByText('مسجد بلا موقع')).not.toBeInTheDocument()
    expect(within(list).getAllByRole('option')[0]).toHaveTextContent('مسجد احمد ياسين')
    expect(within(list).getByText('مسجد')).toBeInTheDocument() // what the place is
    for (const label of ['من مواقعنا', 'من الخريطة', 'الأحياء']) expect(within(list).queryByText(label)).not.toBeInTheDocument()

    await userEvent.click(within(list).getByText('مسجد احمد ياسين'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'location', title: 'مسجد احمد ياسين', lat: 31.5369, lng: 34.4508 }))
  })

  it('finds any part of a name, spelling variants folded; a street flies to all of it', async () => {
    const onPick = vi.fn()
    render(<MapSearch neighborhoods={HOODS} onPick={onPick} />)
    const box = screen.getByRole('combobox', { name: 'ابحث على الخريطة' })
    await userEvent.type(box, 'الاساسيه') // «ة» typed as «ه», only part of the name
    expect(await screen.findByText('مدرسة الفرقان الاساسية المشتركة')).toBeInTheDocument()
    await userEvent.clear(box)
    await userEvent.type(box, 'صيام')
    await userEvent.click(await screen.findByText('شارع صيام'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'place', title: 'شارع صيام', bounds: [31.488, 31.492, 34.449, 34.452] }))
  })

  it('neighborhoods by name, with the keyboard', async () => {
    const onPick = vi.fn()
    render(<MapSearch neighborhoods={HOODS} onPick={onPick} />)
    const box = screen.getByRole('combobox', { name: 'ابحث على الخريطة' })
    await userEvent.type(box, 'رم')
    const list = await screen.findByRole('listbox', { name: 'نتائج البحث' })
    expect(within(list).getAllByRole('option')).toHaveLength(2)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'neighborhood', title: 'الرمال الجنوبي' }))
  })

  it('without the search permission, only the neighborhoods and the map are searched', async () => {
    auth.perms = new Set(['water.view'])
    render(<MapSearch neighborhoods={HOODS} onPick={vi.fn()} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'ابحث على الخريطة' }), 'الدرج')
    await screen.findByText('الدرج')
    expect(locationsApi.list).not.toHaveBeenCalled()
  })
})
