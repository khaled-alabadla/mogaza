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
  locationsApi: { list: vi.fn(), points: vi.fn(), create: vi.fn(), update: vi.fn(), findBuilding: vi.fn() },
  neighborhoodsApi: { list: vi.fn() },
  waterShapesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  waterTableApi: { list: vi.fn() },
  complaintPointsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const { complaintPointsApi, locationsApi, neighborhoodsApi, waterShapesApi, waterTableApi } = await import('../services/api')
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

// a drawn water area: water on Saturdays and Tuesdays (today is Saturday in these tests)
const NADEEM = {
  id: 5,
  group: 1,
  name: 'النديم',
  days: [0, 3],
  days_text: 'السبت / الثلاثاء',
  rings: [[[31.51, 34.45], [31.51, 34.452], [31.512, 34.452]]],
}

const renderMap = () =>
  render(
    <MemoryRouter initialEntries={['/map']}>
      <MapPage />
    </MemoryRouter>,
  )
// the map's box, once Leaflet has drawn the neighborhoods in it
const findMap = async () => {
  const map = await screen.findByRole('region', { name: 'خريطة أحياء مدينة غزة' }, { timeout: 5000 })
  await waitFor(() => expect(map.querySelector('.leaflet-overlay-pane path')).toBeTruthy())
  return map
}
const hoodShapes = (map) => [...map.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')]
const openLayers = () => userEvent.click(screen.getByRole('button', { name: 'الطبقات' }))
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['water.view', 'water.edit', 'search.view', 'search.edit'])
  locationsApi.points.mockResolvedValue([MOSQUE])
  // our locations still without a place on the map
  locationsApi.list.mockResolvedValue({ results: [{ id: 8, place_name: 'مدرسة بلا مكان', description: '', building_number: '5', street_number: '9' }] })
  complaintPointsApi.list.mockResolvedValue([
    { id: 1, number: '1542', category: 'تسرب مياه', latitude: '31.515000', longitude: '34.455000', created_at: '2026-10-29T10:00:00Z', created_by_name: 'أحمد' },
  ])

  waterShapesApi.list.mockResolvedValue({ today: 0, results: [NADEEM] })
  waterTableApi.list.mockResolvedValue({
    results: [
      { id: 1, days: [0, 3], days_text: 'السبت / الثلاثاء', area_list: [{ name: 'النديم' }, { name: 'عين جالوت' }] },
      { id: 2, days: [1, 5], days_text: 'الأحد / الخميس', area_list: [{ name: 'البلدة القديمة' }] },
    ],
  })
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
    expect(map).toHaveAttribute('data-tool', 'draw')
    expect(screen.getByText('اضغط على الخريطة لبدء الرسم')).toBeInTheDocument()

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

describe("a location's card: copy the address, Google Maps, edit, move", () => {
  const openDot = async (map) => {
    const dot = await waitFor(() => {
      const found = map.querySelector('.leaflet-spots-pane path.leaflet-interactive')
      expect(found).toBeTruthy()
      return found
    })
    click(dot)
    return waitFor(() => {
      const card = map.querySelector('.search-card')
      expect(card).toBeTruthy()
      return card
    })
  }

  it('copies the whole address on one line and links to Google Maps', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderMap()
    const card = await openDot(await findMap())
    await userEvent.click(within(card).getByRole('button', { name: 'نسخ العنوان' }))
    // (+ «(… دوار …)», the nearest landmark, once the city's places have loaded)
    expect(writeText.mock.calls[0][0]).toMatch(/^مسجد الكنز - شارع الوحدة - حي الرمال الشمالي - رقم المبنى 122 - رقم الشارع 60310( - \(.+\))?$/)
    expect(within(card).getByRole('link', { name: 'خرائط Google' })).toHaveAttribute('href', 'https://www.google.com/maps?q=31.5211,34.4512')
  })

  it('«تعديل» saves the location; «نقل النقطة» puts it where the map is clicked next', async () => {
    locationsApi.update.mockImplementation(async (id, data) => ({ ...MOSQUE, ...data, id }))
    renderMap()
    const map = await findMap()
    await waitFor(() => expect(neighborhoodsApi.list).toHaveBeenCalled())
    let card = await openDot(map)
    await userEvent.click(within(card).getByRole('button', { name: 'تعديل' }))
    const dialog = await screen.findByRole('dialog', { name: 'تعديل الموقع' })
    const name = within(dialog).getByLabelText(/اسم المكان/)
    await userEvent.clear(name)
    await userEvent.type(name, 'مسجد الكنز الكبير')
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))
    await waitFor(() => expect(locationsApi.update).toHaveBeenCalledWith(7, expect.objectContaining({ place_name: 'مسجد الكنز الكبير' })))

    card = await openDot(map)
    await userEvent.click(within(card).getByRole('button', { name: 'نقل النقطة' }))
    expect(screen.getByText(/اضغط على المكان الجديد/)).toBeInTheDocument()
    map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }))
    await waitFor(() => expect(locationsApi.update).toHaveBeenCalledTimes(2))
    const [, moved] = locationsApi.update.mock.calls[1]
    expect(moved.latitude).toMatch(/^\d+\.\d{6}$/)
    expect(moved.longitude).toMatch(/^\d+\.\d{6}$/)
    expect(screen.queryByText(/اضغط على المكان الجديد/)).not.toBeInTheDocument()
  })

  it('«قياس» shows the length through the clicked points', async () => {
    renderMap()
    const map = await findMap()
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'أدوات الخريطة' })).getByRole('button', { name: 'قياس' }))
    for (const [x, y] of [[10, 10], [60, 10]]) map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }))
    expect(await screen.findByText('المسافة:')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'مسح' }))
    expect(screen.getByText('اضغط على نقطتين أو أكثر')).toBeInTheDocument()
  })
})

describe('«الطبقات»: the base maps and the layers', () => {
  it('opens with the base maps and a switch per layer; switching one off hides it', async () => {
    renderMap()
    const map = await findMap()
    await openLayers()
    const panel = screen.getByRole('region', { name: 'الطبقات' })
    expect(within(panel).getAllByRole('radio').map((r) => r.textContent)).toEqual(['خريطة', 'هادئة', 'قمر صناعي'])
    await userEvent.click(within(panel).getByRole('radio', { name: 'هادئة' }))
    expect(within(panel).getByRole('radio', { name: 'هادئة' })).toHaveAttribute('aria-checked', 'true')
    expect(map).toHaveAttribute('data-base', 'light')
    expect(hoodShapes(map)).toHaveLength(20)
    await userEvent.click(within(panel).getByRole('switch', { name: 'حدود الأحياء' }))
    expect(hoodShapes(map)).toHaveLength(0)
    await userEvent.click(within(panel).getByRole('switch', { name: 'حدود الأحياء' }))
    expect(hoodShapes(map)).toHaveLength(20)
    await userEvent.click(within(panel).getByRole('button', { name: 'إغلاق الطبقات' }))
    expect(screen.queryByRole('region', { name: 'الطبقات' })).not.toBeInTheDocument()
  })
})

describe('a building found from its numbers', () => {
  it('flies to it; its card has the numbers and, for editors, «حفظ كموقع» with the form filled in', async () => {
    locationsApi.findBuilding.mockResolvedValue({ found: true, building_number: '8', street_number: '1786', latitude: 31.5211, longitude: 34.4512, location: null })
    renderMap()
    const map = await findMap()
    await waitFor(() => expect(neighborhoodsApi.list).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('combobox', { name: 'ابحث على الخريطة' }), '8 1786')
    await userEvent.click(await screen.findByRole('option', { name: /مبنى 8 · شارع 1786/ }))
    window.__waterMap.fire('moveend')
    // the map goes there; the card opens only when the point is clicked
    expect(map.querySelector('.search-card')).toBeNull()
    click(await waitFor(() => {
      const pin = map.querySelector('.leaflet-marker-pane [title="مبنى 8 · شارع 1786"]')
      expect(pin).toBeTruthy()
      return pin
    }))
    const card = await waitFor(() => {
      const found = map.querySelector('.search-card')
      expect(found).toBeTruthy()
      return found
    })
    expect(within(card).getByText('1786')).toBeInTheDocument()
    expect(card.textContent).not.toMatch(/gaza|البلدية/i)
    await userEvent.click(within(card).getByRole('button', { name: 'حفظ كموقع' }))
    const dialog = await screen.findByRole('dialog', { name: 'إضافة موقع من الخريطة' })
    expect(within(dialog).getByLabelText(/رقم المبنى/)).toHaveValue('8')
    expect(within(dialog).getByLabelText(/رقم الشارع/)).toHaveValue('1786')
  })
})

describe("a landmark's numbers", () => {
  it('a landmark without numbers: «إضافة رقم المبنى والشارع» opens the location form with its name filled in', async () => {
    renderMap()
    const map = await findMap()
    await waitFor(() => expect(neighborhoodsApi.list).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('combobox', { name: 'ابحث على الخريطة' }), 'الجامع العمري')
    const option = await screen.findByRole('option', { name: /الجامع العمري الكبير/ }, { timeout: 4000 })
    const title = option.querySelector('.font-semibold').textContent
    await userEvent.click(option)
    click(await waitFor(() => {
      const pin = map.querySelector(`.leaflet-marker-pane [title="${title}"]`)
      expect(pin).toBeTruthy()
      return pin
    }))
    const card = await waitFor(() => {
      const found = map.querySelector('.search-card')
      expect(found).toBeTruthy()
      return found
    })
    expect(within(card).getByText('رقم المبنى والشارع غير مسجلين')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'إضافة رقم المبنى والشارع' }))
    const dialog = await screen.findByRole('dialog', { name: 'إضافة موقع من الخريطة' })
    expect(within(dialog).getByLabelText(/اسم المكان/)).toHaveValue(title)
    expect(within(dialog).getByLabelText(/رقم المبنى/)).toHaveValue('')
  })
})

describe('the helpers of the cards', () => {
  it('distances in metres, then kilometres; directions in Arabic', async () => {
    const { distanceText, directionOf, neighborhoodAt } = await import('../components/WaterMap')
    expect(neighborhoodAt(31.5211, 34.4512)).toBe('الرمال الشمالي')
    expect(neighborhoodAt(31.9, 34.4)).toBeNull()
    expect(distanceText(340.4)).toBe('340 م')
    expect(distanceText(1250)).toBe('1.25 كم')
    expect(directionOf([31.5, 34.45], [31.5, 34.46])).toBe('شرق')
    expect(directionOf([31.5, 34.45], [31.49, 34.44])).toBe('جنوب غرب')
  })
})

describe('more of the map: unplaced locations, complaints', () => {
  it('lists our locations without a place; picking one waits for its place on the map', async () => {
    locationsApi.update.mockImplementation(async (id, data) => ({ id, place_name: 'مدرسة بلا مكان', ...data }))
    renderMap()
    const map = await findMap()
    await openLayers()
    await userEvent.click(await screen.findByRole('button', { name: /موقع بلا مكان على الخريطة/ }))
    const dialog = screen.getByRole('dialog', { name: 'مواقع بلا مكان على الخريطة' })
    await userEvent.click(within(dialog).getByText('مدرسة بلا مكان'))
    expect(screen.getByText(/اضغط على المكان الجديد لـ «مدرسة بلا مكان»/)).toBeInTheDocument()
    map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 30, clientY: 30 }))
    await waitFor(() => expect(locationsApi.update).toHaveBeenCalledWith(8, expect.objectContaining({ latitude: expect.any(String) })))
    await waitFor(() => expect(screen.queryByRole('button', { name: /موقع بلا مكان على الخريطة/ })).not.toBeInTheDocument())
  })

  it('the complaint pins are small far out and bigger close in', async () => {
    auth.perms = new Set(['water.view', 'complaints.view'])
    renderMap()
    const map = await findMap()
    const pin = () => map.querySelector('[title="شكوى 1542"] svg')
    window.__waterMap.setMinZoom(0).setZoom(13, { animate: false })
    await waitFor(() => expect(pin()).toHaveAttribute('width', '14'))
    window.__waterMap.setZoom(15, { animate: false })
    await waitFor(() => expect(pin()).toHaveAttribute('width', '18'))
    window.__waterMap.setZoom(17, { animate: false })
    await waitFor(() => expect(pin()).toHaveAttribute('width', '24'))
  })

  it('«شكوى على الخريطة»: a click asks for the number and type (both required); its pin shows them', async () => {
    auth.perms = new Set(['water.view', 'complaints.view', 'complaints.edit'])
    complaintPointsApi.create.mockImplementation(async (data) => ({ id: 2, created_at: '2026-10-30T09:00:00Z', ...data }))
    renderMap()
    const map = await findMap()
    // the marked complaints are on the map, with their number and type
    const pin = await waitFor(() => {
      const found = map.querySelector('.leaflet-marker-pane [title="شكوى 1542"]')
      expect(found).toBeTruthy()
      return found
    })
    click(pin)
    const card = await waitFor(() => {
      const found = map.querySelector('.search-card.is-complaint')
      expect(found).toBeTruthy()
      return found
    })
    expect(within(card).getByText('شكوى رقم 1542')).toBeInTheDocument()
    expect(within(card).getAllByText('تسرب مياه').length).toBeGreaterThan(0)

    await userEvent.click(within(screen.getByRole('toolbar', { name: 'أدوات الخريطة' })).getByRole('button', { name: 'شكوى على الخريطة' }))
    map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 }))
    const dialog = await screen.findByRole('dialog', { name: 'شكوى على الخريطة' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة الشكوى' }))
    expect(complaintPointsApi.create).not.toHaveBeenCalled()
    expect(within(dialog).getByText('رقم الشكوى مطلوب.')).toBeInTheDocument()
    expect(within(dialog).getByText('نوع الشكوى مطلوب.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/رقم الشكوى/), '1600')
    await userEvent.type(within(dialog).getByLabelText(/نوع الشكوى/), 'انقطاع مياه')
    await userEvent.click(within(dialog).getByRole('button', { name: 'إضافة الشكوى' }))
    await waitFor(() => expect(complaintPointsApi.create).toHaveBeenCalled())
    const sent = complaintPointsApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({ number: '1600', category: 'انقطاع مياه' })
    expect(sent.latitude).toMatch(/^\d+\.\d{6}$/)
    await waitFor(() => expect(map.querySelector('[title="شكوى 1600"]')).toBeTruthy())
  })

  it('reading complaints shows the pins but no «شكوى على الخريطة» button', async () => {
    auth.perms = new Set(['water.view', 'complaints.view'])
    renderMap()
    const map = await findMap()
    await waitFor(() => expect(map.querySelector('[title="شكوى 1542"]')).toBeTruthy())
    expect(within(screen.getByRole('toolbar', { name: 'أدوات الخريطة' })).queryByRole('button', { name: 'شكوى على الخريطة' })).not.toBeInTheDocument()
  })

  it('without the complaints permissions there is no complaints layer', async () => {
    auth.perms = new Set(['water.view'])
    renderMap()
    await findMap()
    await openLayers()
    expect(screen.queryByRole('switch', { name: 'الشكاوي حسب الحي' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'نقاط الشكاوى' })).not.toBeInTheDocument()
    expect(complaintPointsApi.list).not.toHaveBeenCalled()
  })
})

describe('«جدول المياه» on the map', () => {
  const waterAreas = (map) => [...map.querySelectorAll('.leaflet-water-pane path')]

  it('colours the drawn areas for the chosen day (today at first)', async () => {
    renderMap()
    const map = await findMap()
    await waitFor(() => expect(waterAreas(map)).toHaveLength(1))
    expect(waterAreas(map)[0]).toHaveAttribute('fill', '#0ea5e9') // water on Saturday
    await openLayers()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'يوم المياه' }), '2') // Monday: water on Tuesday
    expect(waterAreas(map)[0]).toHaveAttribute('fill', '#7dd3fc')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'يوم المياه' }), '1') // Sunday: none
    expect(waterAreas(map)[0]).toHaveAttribute('fill', '#94a3b8')
    await userEvent.click(screen.getByRole('switch', { name: 'مناطق المياه' }))
    expect(waterAreas(map)).toHaveLength(0)
  })

  it('«رسم»: clicks outline an area; «إنهاء» asks for its row of the table and name, then it is on the map', async () => {
    waterShapesApi.create.mockImplementation(async (data) => ({ id: 6, ...data, days: [1, 5], days_text: 'الأحد / الخميس' }))
    renderMap()
    const map = await findMap()
    await waitFor(() => expect(waterTableApi.list).toHaveBeenCalled())
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'أدوات الخريطة' })).getByRole('button', { name: 'رسم' }))
    for (const [x, y] of [[10, 10], [60, 10], [60, 60]]) map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }))
    expect(await screen.findByText('النقاط:')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'تراجع' }))
    expect(screen.getByRole('button', { name: 'إنهاء' })).toBeDisabled() // two points only: nothing to close yet
    map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 30, clientY: 80 }))
    await userEvent.click(screen.getByRole('button', { name: 'إنهاء' }))

    const dialog = await screen.findByRole('dialog', { name: 'منطقة مياه جديدة' })
    // days of an existing row: the form says where it goes
    await userEvent.click(within(dialog).getByRole('button', { name: 'الخميس' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'الأحد' }))
    expect(within(dialog).getByText(/ستُضاف إلى موعد/)).toHaveTextContent('الأحد / الخميس')
    await userEvent.click(within(dialog).getByRole('button', { name: 'الجمعة' }))
    expect(within(dialog).getByText(/سيُضاف موعد جديد/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'الجمعة' }))
    await userEvent.type(within(dialog).getByLabelText(/اسم المنطقة/), 'البلدة القديمة')
    await userEvent.click(within(dialog).getByRole('button', { name: 'حفظ المنطقة' }))
    await waitFor(() => expect(waterShapesApi.create).toHaveBeenCalled())
    const sent = waterShapesApi.create.mock.calls[0][0]
    expect(sent).toMatchObject({ water_days: [1, 5], name: 'البلدة القديمة' })
    expect(sent.rings[0]).toHaveLength(3)
    await waitFor(() => expect(waterAreas(map)).toHaveLength(2))
    expect(map.querySelectorAll('.leaflet-sketch-pane path')).toHaveLength(0) // the outline is gone
  })

  it('only those who may edit the water table get «رسم»', async () => {
    auth.perms = new Set(['water.view'])
    renderMap()
    await findMap()
    expect(within(screen.getByRole('toolbar', { name: 'أدوات الخريطة' })).queryByRole('button', { name: 'رسم' })).not.toBeInTheDocument()
    expect(waterTableApi.list).not.toHaveBeenCalled()
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
