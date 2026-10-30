import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { perms: new Set(['search.view', 'water.view']) }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (k) => auth.perms.has(k) }) }))
vi.mock('../services/api', () => ({ locationsApi: { list: vi.fn(), findBuilding: vi.fn() } }))
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
const { default: MapSearch, searchText } = await import('../components/MapSearch')

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

  it('finds our locations by building and street numbers, typed in any way, the exact one first', async () => {
    locationsApi.list.mockResolvedValue({
      results: [
        { id: 3, place_name: 'محل قريب', building_number: '1220', street_number: '60310', latitude: '31.5', longitude: '34.45' },
        { id: 4, place_name: 'مسجد الكنز', building_number: '122', street_number: '60310', latitude: '31.51', longitude: '34.46' },
      ],
    })
    render(<MapSearch neighborhoods={HOODS} onPick={vi.fn()} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'ابحث على الخريطة' }), 'مبنى ١٢٢ شارع 60310')
    const list = await screen.findByRole('listbox', { name: 'نتائج البحث' })
    await within(list).findByText('مسجد الكنز')
    expect(locationsApi.list).toHaveBeenLastCalledWith({ search: '122 60310', page_size: 20 }, expect.anything())
    expect(within(list).getAllByRole('option')[0]).toHaveTextContent('مسجد الكنز') // the exact building first
    expect(within(list).getAllByRole('option')[0]).toHaveTextContent('مبنى 122 · شارع 60310')
  })
})

describe('a building that none of our locations has', () => {
  beforeEach(() => locationsApi.list.mockResolvedValue({ results: [] }))

  it('«8 1786»: the building is found from its numbers and offered first', async () => {
    locationsApi.findBuilding.mockResolvedValue({ found: true, building_number: '8', street_number: '1786', latitude: 31.51, longitude: 34.46, location: null })
    const onPick = vi.fn()
    render(<MapSearch neighborhoods={HOODS} onPick={onPick} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'ابحث على الخريطة' }), 'مبنى 8 شارع 1786')
    const option = await screen.findByRole('option', { name: /مبنى 8 · شارع 1786/ })
    expect(locationsApi.findBuilding).toHaveBeenCalledWith({ building: '8', street: '1786' }, expect.anything())
    expect(screen.getByRole('listbox').textContent).not.toMatch(/gaza|البلدية/i) // where it came from is never said
    await userEvent.click(option)
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'building', lat: 31.51, lng: 34.46 }))
  })

  it('says so when there is no such building, and when the search failed', async () => {
    locationsApi.findBuilding.mockResolvedValueOnce({ found: false, building_number: '9999', street_number: '1' })
    render(<MapSearch neighborhoods={HOODS} onPick={vi.fn()} />)
    const box = screen.getByRole('combobox', { name: 'ابحث على الخريطة' })
    await userEvent.type(box, '9999 1')
    expect(await screen.findByText(/لا يوجد مبنى رقم/)).toBeInTheDocument()
    locationsApi.findBuilding.mockRejectedValueOnce({ response: { data: { detail: 'تعذر البحث عن المبنى الآن، حاول بعد قليل.' } } })
    await userEvent.clear(box)
    await userEvent.type(box, '7 70')
    expect(await screen.findByText('تعذر البحث عن المبنى الآن، حاول بعد قليل.')).toBeInTheDocument()
  })

  it('one of ours with exactly these numbers: no lookup', async () => {
    locationsApi.list.mockResolvedValue({
      results: [{ id: 4, place_name: 'مسجد الكنز', building_number: '122', street_number: '60310', latitude: '31.51', longitude: '34.46' }],
    })
    render(<MapSearch neighborhoods={HOODS} onPick={vi.fn()} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'ابحث على الخريطة' }), '122 60310')
    await screen.findByText('مسجد الكنز')
    await new Promise((r) => setTimeout(r, 450))
    expect(locationsApi.findBuilding).not.toHaveBeenCalled()
  })
})

describe('searchText', () => {
  it('keeps the numbers, drops the words and separators around them', () => {
    expect(searchText('مبنى 122 شارع 60310')).toBe('122 60310')
    expect(searchText('122/60310')).toBe('122 60310')
    expect(searchText('م ١٢٢ ش ٦٠٣١٠')).toBe('122 60310')
    expect(searchText('شارع الوحدة')).toBe('شارع الوحدة') // no numbers: as typed
  })
})
