import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { perms: new Set() }
auth.can = (key) => auth.perms.has(key)
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
const toast = { success: vi.fn(), error: vi.fn() }
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }))
vi.mock('../services/api', () => ({
  locationsApi: { list: vi.fn(), points: vi.fn(), create: vi.fn() },
  neighborhoodsApi: { list: vi.fn() },
}))

const { locationsApi, neighborhoodsApi } = await import('../services/api')
const { default: MapPage } = await import('../pages/MapPage')

const MOSQUE = {
  id: 7,
  place_name: 'مسجد الكنز',
  description: 'شارع الوحدة',
  building_number: '122',
  street_number: '60310',
  neighborhood_name: 'الرمال الشمالي',
  latitude: 31.5211,
  longitude: 34.4512,
}

const renderMap = () =>
  render(
    <MemoryRouter initialEntries={['/map']}>
      <MapPage />
    </MemoryRouter>,
  )
const findMap = () => screen.findByRole('region', { name: 'خريطة أحياء مدينة غزة' }, { timeout: 5000 })
const hoodShapes = (map) => [...map.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')]
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['water.view', 'search.view', 'search.edit'])
  locationsApi.points.mockResolvedValue([MOSQUE])
  neighborhoodsApi.list.mockResolvedValue([
    { id: 3, name: 'الزيتون' },
    { id: 4, name: 'الرمال الشمالي' },
  ])
})

describe('«الخريطة» page', () => {
  it('shows the neighborhoods of the paper map on the real map; a click picks one and zooms in', async () => {
    renderMap()
    expect(screen.getByRole('heading', { name: 'الخريطة' })).toBeInTheDocument()
    const map = await findMap()
    const shapes = hoodShapes(map)
    expect(shapes).toHaveLength(20) // the 20 neighborhoods of the PDF
    click(shapes[0])
    expect(map).toHaveAttribute('data-picked', 'الزيتون') // the biggest one comes first
    // no credit line under the map: OpenStreetMap's credit sits behind «ⓘ»
    expect(screen.queryByText(/حدود الأحياء/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'OpenStreetMap' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'مصدر الخريطة' }))
    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('one tool at a time: select (default), zoom in / out, pan, draw (coming soon) and add a point', async () => {
    renderMap()
    const map = await findMap()
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات الخريطة' })
    const tool = (name) => within(toolbar).getByRole('button', { name })
    expect(tool('تحديد')).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['تكبير', 'تصغير', 'تحريك', 'رسم', 'إضافة نقطة']) expect(tool(name)).toHaveAttribute('aria-pressed', 'false')
    expect(within(toolbar).getByRole('button', { name: 'عرض المدينة كاملة' })).toBeInTheDocument()

    // with the hand, a click on a neighborhood only moves the map: nothing gets picked
    await userEvent.click(tool('تحريك'))
    expect(tool('تحديد')).toHaveAttribute('aria-pressed', 'false')
    expect(map).toHaveAttribute('data-tool', 'pan')
    click(hoodShapes(map)[0])
    expect(map).not.toHaveAttribute('data-picked')

    await userEvent.click(tool('رسم'))
    expect(screen.getByText('أداة الرسم ستُفعَّل قريباً')).toBeInTheDocument()

    await userEvent.click(tool('تحديد'))
    click(hoodShapes(map)[0])
    expect(map).toHaveAttribute('data-picked')
  })

  it("shows the site's locations as dots; a dot's card has the building and street numbers", async () => {
    renderMap()
    const map = await findMap()
    const dot = await waitFor(() => {
      const found = map.querySelector('.leaflet-spots-pane path.leaflet-interactive')
      expect(found).toBeTruthy()
      return found
    })
    click(dot)
    const card = await waitFor(() => {
      const found = map.querySelector('.search-card')
      expect(found).toBeTruthy()
      return found
    })
    expect(within(card).getByText('مسجد الكنز')).toBeInTheDocument()
    expect(within(card).getByText('رقم المبنى')).toBeInTheDocument()
    expect(within(card).getByText('122')).toBeInTheDocument()
    expect(within(card).getByText('60310')).toBeInTheDocument()
    expect(within(card).queryByText('من مواقعنا')).not.toBeInTheDocument()

    // each number can be copied
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await userEvent.click(within(card).getByRole('button', { name: 'نسخ رقم الشارع' }))
    expect(writeText).toHaveBeenCalledWith('60310')
    expect(await within(card).findByText('تم النسخ')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'نسخ رقم المبنى' }))
    expect(writeText).toHaveBeenLastCalledWith('122')
  })

  it('the dots show only once the map is zoomed in (the whole city is not covered with them)', async () => {
    renderMap()
    const map = await findMap()
    const pane = map.querySelector('.leaflet-spots-pane')
    window.__waterMap.setMinZoom(0).setZoom(13, { animate: false }) // the whole city (the test's map has no size)
    await waitFor(() => expect(pane.style.display).toBe('none'))
    window.__waterMap.setZoom(16, { animate: false })
    await waitFor(() => expect(pane.style.display).toBe(''))
  })

  it('«إضافة نقطة»: a click on the map opens the location form (its neighborhood chosen); saving adds a dot', async () => {
    locationsApi.create.mockImplementation(async (data) => ({ id: 9, ...data, neighborhood_name: 'الزيتون' }))
    renderMap()
    const map = await findMap()
    await waitFor(() => expect(neighborhoodsApi.list).toHaveBeenCalled())
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'أدوات الخريطة' })).getByRole('button', { name: 'إضافة نقطة' }))
    click(hoodShapes(map)[0]) // الزيتون

    const dialog = await screen.findByRole('dialog', { name: 'إضافة موقع من الخريطة' })
    expect(within(dialog).getByLabelText(/الحي/)).toHaveValue('3')
    await userEvent.type(within(dialog).getByLabelText(/اسم المكان/), 'مدرسة جديدة')
    await userEvent.type(within(dialog).getByLabelText(/رقم المبنى/), '15')
    // every field is required when adding
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة الموقع' }))
    expect(locationsApi.create).not.toHaveBeenCalled()
    expect(within(dialog).getByText('رقم الشارع مطلوب.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/الوصف/), 'بجوار المفترق')
    await userEvent.type(within(dialog).getByLabelText(/رقم الشارع/), '3040')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة الموقع' }))

    await waitFor(() => expect(locationsApi.create).toHaveBeenCalled())
    const sent = locationsApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({ place_name: 'مدرسة جديدة', description: 'بجوار المفترق', building_number: '15', street_number: '3040', neighborhood: 3 })
    expect(sent.latitude).toMatch(/^\d+\.\d{6}$/)
    expect(sent.longitude).toMatch(/^\d+\.\d{6}$/)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalled()
    expect(map.querySelectorAll('.leaflet-spots-pane path.leaflet-interactive')).toHaveLength(2)
  })

  it('without the edit permission there is no «إضافة نقطة»; without search, no dots are asked for', async () => {
    auth.perms = new Set(['water.view'])
    renderMap()
    await findMap()
    expect(within(screen.getByRole('toolbar', { name: 'أدوات الخريطة' })).queryByRole('button', { name: 'إضافة نقطة' })).not.toBeInTheDocument()
    expect(locationsApi.points).not.toHaveBeenCalled()
    expect(neighborhoodsApi.list).not.toHaveBeenCalled()
  })
})

describe('the icons of the city places', () => {
  it('one look per kind: a mosque and a church share theirs, a school has another', async () => {
    const { placeIcon, NOT_ICONS } = await import('../components/placeIcons')
    expect(placeIcon('مسجد')).toBe(placeIcon('كنيسة'))
    expect(placeIcon('مدرسة')).not.toBe(placeIcon('مسجد'))
    expect(placeIcon('شيء غير معروف')).toBe(placeIcon('مكان'))
    expect(NOT_ICONS.has('شارع')).toBe(true) // a street is lit up when searched, not drawn as an icon
  })
})

describe('gazaStreets.json (from OpenStreetMap)', () => {
  it('has the lines of the streets the search finds, inside Gaza City', async () => {
    const { default: data } = await import('../data/gazaStreets.json')
    const names = Object.keys(data.streets)
    expect(names.length).toBeGreaterThan(200)
    for (const parts of Object.values(data.streets)) {
      for (const line of parts) {
        expect(line.length).toBeGreaterThan(1)
        for (const [lat, lng] of line) {
          expect(lat).toBeGreaterThan(31.4)
          expect(lat).toBeLessThan(31.65)
          expect(lng).toBeGreaterThan(34.3)
          expect(lng).toBeLessThan(34.55)
        }
      }
    }
  })
})
