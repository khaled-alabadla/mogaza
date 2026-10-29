import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import neighborhoods from '../data/gazaNeighborhoods.json'
import { locationsApi, neighborhoodsApi } from '../services/api'
import { normalizeArabic } from '../utils/arabic'
import { copyText } from '../utils/clipboard'
import MapSearch from './MapSearch'
import Modal from './Modal'
import { groupOf, LEGEND, MAIN_GROUPS, NOT_ICONS, placeIcon } from './placeIcons'
import RecordForm from './RecordForm'
import { LOCATION_ADD_FIELDS, withNeighborhoodOptions } from './recordFields'
import { CursorIcon, DrawIcon, ExpandIcon, ExtentIcon, HandIcon, LayersIcon, LegendIcon, PinPlusIcon, ShrinkIcon, ZoomInIcon, ZoomOutIcon } from './Icons'

/*
 * «الخريطة»: the real map of Gaza City (OpenStreetMap, with the streets and places in Arabic),
 * and on it the neighborhoods of the municipality's paper map (frontend/src/data/gazaNeighborhoods.json,
 * built from «خريطة مدينة غزة.pdf» by frontend/scripts/build_gaza_map.py). Only the city shows: the
 * rest is covered and the view can't leave it. A GIS-style toolbar picks what a click / drag does.
 * On top: the site's own locations that have coordinates (green dots, a click shows their card), and
 * «إضافة نقطة» adds one where the map is clicked — the same location as «إضافة موقع» on the search page.
 * This file (with Leaflet) is its own chunk, loaded only when the map is opened.
 */

// the two base maps: the street map (OpenStreetMap, names in Arabic) and the satellite picture (Esri)
const BASES = {
  map: { label: 'خريطة', urls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], maxNativeZoom: 19 },
  satellite: {
    label: 'قمر صناعي',
    // the same pictures from other addresses: the next is tried when one doesn't answer (blocked / busy)
    urls: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    // Gaza has real pictures up to level 19 (level 20 is an empty «no data» tile). No «retina» doubling:
    // on high-resolution screens it asks one level deeper, and at the closest zoom that tile is empty
    maxNativeZoom: 19,
  },
}
const TILE_FAILS = 6 // failed tiles before the next address is tried
const READABLE_ZOOM = 16 // from here the map shows the street and place names

const STYLE = { color: '#3f9d69', weight: 1.6, opacity: 0.7, fillColor: '#0f8a47', fillOpacity: 0.04 } // light green lines
const HOVER = { weight: 2.4, opacity: 0.9, fillOpacity: 0.12 }
const PICKED = { color: '#0a6b38', weight: 3, opacity: 0.9, fillColor: '#0f8a47', fillOpacity: 0.03 }
const FADED = { color: '#3f9d69', weight: 1.2, opacity: 0.45, fillColor: '#ffffff', fillOpacity: 0.12 } // the others, while one is picked

// the site's locations: small green dots with a white ring (above the neighborhoods, in their own pane)
const SPOT = { pane: 'spots', radius: 6, color: '#ffffff', weight: 2, fillColor: '#0a6b38', fillOpacity: 1, bubblingMouseEvents: false }
const SPOT_HOVER = { radius: 8 }
// a searched street: a wide see-through band along all of it, with a thin line in the middle
const STREET_BAND = { pane: 'streets', color: '#f5b301', weight: 16, opacity: 0.38, lineCap: 'round', lineJoin: 'round', interactive: false }
const STREET_LINE = { pane: 'streets', color: '#d48a00', weight: 3, opacity: 0.85, lineCap: 'round', lineJoin: 'round', interactive: false }
const POPUP = { offset: [0, -4], className: 'search-popup', maxWidth: 300, minWidth: 220 }
const PIN_POPUP = { ...POPUP, offset: [0, -30] }

// the city's places get their icons from this zoom on (closer in, they would cover each other)
const ICONS_ZOOM = 16
const ALL_ICONS_ZOOM = 18 // from here every kind (shops, restaurants…), before only the main ones
// our locations' dots show from this zoom on (the whole city would be covered with dots)
const SPOTS_ZOOM = 15
// a city place this close to one of our locations with the same name is that location (its numbers shown)
const SAME_PLACE_METRES = 150

/** The streets file (about 55 KB): downloaded the first time a street is picked. */
let streetsFile = null
const loadStreets = () => (streetsFile ??= import('../data/gazaStreets.json').then((m) => m.default.streets))

/** «1 : 25,000»: the map scale at the centre of the view, rounded to two figures (a 96 dpi screen). */
function scaleText(map) {
  const lat = map.getCenter().lat
  const metresPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8)
  const n = metresPerPx * (96 / 0.0254)
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1)
  return `1 : ${(Math.round(n / step) * step).toLocaleString('en-US')}`
}

/** The search result's pin: a green drop with a white dot (no image files to ship). */
const PIN = L.divIcon({
  className: 'search-pin',
  html: '<svg viewBox="0 0 24 32" width="28" height="36" aria-hidden="true"><path d="M12 31s10-9.3 10-18A10 10 0 0 0 2 13c0 8.7 10 18 10 18z" fill="#0a6b38" stroke="#fff" stroke-width="2"/><circle cx="12" cy="13" r="4" fill="#fff"/></svg>',
  iconSize: [28, 36],
  iconAnchor: [14, 35],
})

/** The pin's card: name, then what is known (our location: description, building and street numbers). */
function popupFor(result) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }
  const box = el('div', 'search-card')
  box.dir = 'rtl'

  // the head: a round pin icon, the name, and what it is
  const head = el('div', 'search-card-head')
  const icon = el('span', 'search-card-icon')
  icon.innerHTML = PIN_GLYPH // a fixed drawing, never text from the data
  const names = el('div', 'search-card-names')
  names.append(el('p', 'search-card-title', result.title))
  const isOurs = result.kind === 'location'
  if (!isOurs && result.subtitle) names.append(el('span', 'search-card-badge', result.subtitle))
  head.append(icon, names)
  box.append(head)

  const l = result.details
  if (l) {
    if (isOurs && l.description && l.description !== l.neighborhood_name) box.append(el('p', 'search-card-text', l.description))
    if (l.neighborhood_name) {
      const hood = el('p', 'search-card-hood')
      hood.append(el('span', 'search-card-hood-label', 'الحي'), el('span', '', l.neighborhood_name))
      box.append(hood)
    }
    const tiles = [
      ['رقم المبنى', l.building_number],
      ['رقم الشارع', l.street_number],
    ].filter(([, value]) => value)
    if (tiles.length) {
      const grid = el('div', 'search-card-nums')
      for (const [label, value] of tiles) {
        const tile = el('div', 'search-card-num')
        const copy = el('button', 'search-card-copy', 'نسخ')
        copy.type = 'button'
        copy.setAttribute('aria-label', `نسخ ${label}`)
        copy.insertAdjacentHTML('afterbegin', COPY_GLYPH) // a fixed drawing, never text from the data
        copy.addEventListener('click', () => {
          copyText(String(value)).then(
            () => {
              copy.classList.add('is-done')
              copy.lastChild.textContent = 'تم النسخ'
              setTimeout(() => {
                copy.classList.remove('is-done')
                copy.lastChild.textContent = 'نسخ'
              }, 1500)
            },
            () => {},
          )
        })
        tile.append(el('span', 'search-card-num-label', label), el('span', 'search-card-num-value', String(value)), copy)
        grid.append(tile)
      }
      box.append(grid)
    }
  }
  return box
}

const COPY_GLYPH =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'

const PIN_GLYPH =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>'

/** The toolbar: one tool at a time decides what a click / drag on the map does (grouped as in GIS tools). */
const TOOLS = [
  { id: 'select', group: 0, label: 'تحديد', hint: 'اضغط على حي لتحديده والتقريب عليه', icon: CursorIcon },
  { id: 'pan', group: 0, label: 'تحريك', hint: 'اسحب الخريطة لتحريكها', icon: HandIcon },
  { id: 'zoomIn', group: 1, label: 'تكبير', hint: 'اضغط على مكان للتكبير عليه، أو اسحب مربعاً حول المنطقة', icon: ZoomInIcon },
  { id: 'zoomOut', group: 1, label: 'تصغير', hint: 'اضغط على مكان للتصغير منه', icon: ZoomOutIcon },
  { id: 'draw', group: 2, label: 'رسم', hint: 'أداة الرسم ستُفعَّل قريباً', icon: DrawIcon, soon: true },
  { id: 'point', group: 2, label: 'إضافة نقطة', hint: 'اضغط على المبنى في الخريطة لإضافته كموقع جديد', icon: PinPlusIcon },
]
const HINT_FOR = 3500 // ms the hint of a newly picked tool stays (the «قريباً» ones stay)

const Divider = () => <span className="mx-0.5 h-6 w-px bg-line" aria-hidden="true" />

function ToolButton({ label, title, active, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      aria-pressed={active ?? undefined}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-brand-600 text-white shadow-sm' : 'text-ink hover:bg-brand-50 hover:text-brand-700'
      }`}
    >
      {children}
    </button>
  )
}

/** The neighborhood (from /api/neighborhoods/) with the same name as the map's, if any. */
function findNeighborhood(list, name) {
  if (!name || !list) return null
  const key = normalizeArabic(name)
  return list.find((n) => normalizeArabic(n.name) === key) || null
}

export default function WaterMap() {
  const { can } = useAuth()
  const toast = useToast()
  const canSee = can('search.view')
  const canAdd = can('search.edit')
  const [adding, setAdding] = useState(null) // { lat, lng, hood } while the «إضافة نقطة» form is open
  const [dbHoods, setDbHoods] = useState(null)
  const boxRef = useRef(null)
  const addRef = useRef(null) // the map's click → open the form (set below, read inside the map's handlers)
  const api = useRef({}) // what the toolbar needs from the Leaflet map (set up once below)
  const [tool, setTool] = useState('select')
  const [credit, setCredit] = useState(false)
  const [base, setBase] = useState('map')
  const [legend, setLegend] = useState(false)
  const [hidden, setHidden] = useState(() => new Set()) // icon groups turned off in «دليل الرموز»
  const hiddenRef = useRef(hidden)
  const [zoom, setZoom] = useState(0)
  const [full, setFull] = useState(false)
  const fullRef = useRef(null) // what fills the screen: the search box and the map
  const [hintOn, setHintOn] = useState(false)
  const [scale, setScale] = useState('')
  const pointerRef = useRef(null) // the label of the coordinates under the mouse (written by the map directly)
  const toolRef = useRef(tool)
  const current = TOOLS.find((t) => t.id === tool)

  useEffect(() => {
    const map = L.map(boxRef.current, {
      zoomSnap: 1, // whole levels only: the map pictures at their real size (in between they are stretched: blurry)
      zoomDelta: 1,
      wheelPxPerZoomLevel: 110,
      wheelDebounceTime: 60,
      maxZoom: 19,
      zoomControl: false, // the toolbar has the zoom tools
      boxZoom: false, // the zoom-in tool draws its own box
      attributionControl: false,
    })
    L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 140 }).addTo(map)
    const tiles = Object.fromEntries(
      Object.entries(BASES).map(([key, b]) => [
        key,
        L.tileLayer(b.urls[0], {
          maxZoom: 19,
          maxNativeZoom: b.maxNativeZoom,
          keepBuffer: 4, // keep the pictures around the view: moving back shows them at once
          updateWhenZooming: false, // load the new level once the zoom ends (not every step of it)
          // the site sends no referrer by default; OpenStreetMap asks for one (the site's address only)
          referrerPolicy: 'strict-origin-when-cross-origin',
        }),
      ]),
    )
    for (const [key, layer] of Object.entries(tiles)) {
      let fails = 0
      let at = 0
      layer.on('tileload', () => {
        fails = 0
      })
      layer.on('tileerror', () => {
        fails += 1
        const urls = BASES[key].urls
        if (fails >= TILE_FAILS && at < urls.length - 1) {
          fails = 0
          at += 1
          layer.setUrl(urls[at])
        }
      })
    }
    tiles.map.addTo(map)

    let picked = null // { name, layer }
    const layers = []
    const rest = () => (picked ? FADED : STYLE) // how a neighborhood that isn't picked looks
    const unpick = () => {
      picked = null
      for (const layer of layers) layer.setStyle(STYLE)
      boxRef.current?.removeAttribute('data-picked')
    }

    // the zoom tools: a click zooms in / out on that spot (on a neighborhood too: Leaflet hands such a
    // click to the neighborhood, not to the map)
    let boxedAt = 0 // the release that ends a zoom box also counts as a click: ignore that one
    const zoomClick = (latlng) => {
      if (Date.now() - boxedAt < 400) return
      if (toolRef.current === 'zoomIn') map.setZoomAround(latlng, map.getZoom() + 1)
      else if (toolRef.current === 'zoomOut') map.setZoomAround(latlng, map.getZoom() - 1)
    }

    const byName = new Map() // neighborhood name → its shape (for the search box)
    const pickHood = (name, poly) => {
      unpick()
      picked = { name, layer: poly }
      for (const layer of layers) layer.setStyle(layer === poly ? PICKED : FADED)
      poly.bringToFront()
      boxRef.current?.setAttribute('data-picked', name)
      // close enough to read the streets and places (a big neighborhood stays centred, partly in view)
      const bounds = poly.getBounds()
      const fit = map.getBoundsZoom(bounds, false, L.point(40, 40))
      map.flyTo(bounds.getCenter(), Math.max(fit, READABLE_ZOOM), { duration: 0.8 })
    }

    for (const n of neighborhoods.neighborhoods) {
      const poly = L.polygon(n.rings, STYLE).addTo(map)
      const selecting = () => toolRef.current === 'select'
      poly.on('mouseover', () => selecting() && picked?.layer !== poly && poly.setStyle({ ...STYLE, ...HOVER }))
      poly.on('mouseout', () => picked?.layer !== poly && poly.setStyle(rest()))
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e) // handled here: the map's own click handler must not act on it again
        if (toolRef.current === 'point') {
          addRef.current?.(e.latlng, n.name)
          return
        }
        if (!selecting()) {
          zoomClick(e.latlng)
          return
        }
        pickHood(n.name, poly)
      })
      byName.set(n.name, poly)
      // no names drawn on the map (the map itself names the places): pointing at a neighborhood says its name
      poly.bindTooltip(n.name, { sticky: true, direction: 'top', offset: [0, -8], className: 'hood-tip' })
      layers.push(poly)
    }

    // Gaza City only: everything outside its outline is covered, the outline drawn, and the view
    // can't wander off or zoom out past the whole city
    const FAR = [
      [31.0, 33.9],
      [31.0, 35.0],
      [32.0, 35.0],
      [32.0, 33.9],
    ]
    L.polygon([FAR, ...neighborhoods.city], { stroke: false, fillColor: '#eef1ef', fillOpacity: 0.93, interactive: false }).addTo(map)
    for (const ring of neighborhoods.city) {
      L.polygon(ring, { color: '#2f8a57', weight: 2.5, opacity: 0.85, fill: false, interactive: false }).addTo(map)
    }

    const city = L.featureGroup(layers).getBounds()
    map.setMaxBounds(city.pad(0.12))
    map.options.maxBoundsViscosity = 1 // a hard edge: the map stops at the city's surroundings
    const fitCity = () => {
      const whole = map.getBoundsZoom(city, false, L.point(16, 16))
      if (Number.isFinite(whole)) map.setMinZoom(Math.floor(whole)) // can't zoom out further than the whole city
    }
    fitCity()
    map.fitBounds(city, { padding: [16, 16] })
    // the zoom level is kept on the box (for the tests, and handy when checking the map)
    const markZoom = () => {
      boxRef.current?.setAttribute('data-zoom', String(map.getZoom()))
      setScale(scaleText(map))
      setZoom(map.getZoom())
    }
    markZoom()
    map.on('zoomend', markZoom)

    // outside the neighborhoods the click reaches the map; with «تكبير», a dragged box zooms to the box
    map.on('mousemove', (e) => {
      const label = pointerRef.current
      if (!label) return
      label.textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`
      label.hidden = false
    })
    map.on('mouseout', () => {
      if (pointerRef.current) pointerRef.current.hidden = true
    })
    let box = null
    map.on('click', (e) => (toolRef.current === 'point' ? addRef.current?.(e.latlng, null) : zoomClick(e.latlng)))
    map.on('mousedown', (e) => {
      if (toolRef.current === 'zoomIn') box = { start: e.latlng, rect: null }
    })
    map.on('mousemove', (e) => {
      if (!box) return
      if (!box.rect) {
        // a box only once the mouse really moved (a click stays a click)
        const a = map.latLngToContainerPoint(box.start)
        if (a.distanceTo(e.containerPoint) < 6) return
      }
      const bounds = L.latLngBounds(box.start, e.latlng)
      if (box.rect) box.rect.setBounds(bounds)
      else box.rect = L.rectangle(bounds, { color: '#0a6b38', weight: 1.5, dashArray: '5 4', fillOpacity: 0.08, interactive: false }).addTo(map)
    })
    map.on('mouseup', (e) => {
      if (!box) return
      const { start, rect } = box
      box = null
      if (!rect) return // a plain click: handled by «click»
      rect.remove()
      boxedAt = Date.now()
      const a = map.latLngToContainerPoint(start)
      const b = map.latLngToContainerPoint(e.latlng)
      if (Math.abs(a.x - b.x) > 8 && Math.abs(a.y - b.y) > 8) map.flyToBounds(L.latLngBounds(start, e.latlng), { duration: 0.6 })
    })

    if (import.meta.env.DEV) window.__waterMap = map // to inspect the map from the browser console while developing

    // the searched street sits under the dots, the dots above the neighborhoods (and the city's cover)
    map.createPane('streets').style.zIndex = '420'
    map.createPane('spots').style.zIndex = '450'
    const spotsPane = map.getPane('spots')
    const showSpots = () => {
      spotsPane.style.display = map.getZoom() >= SPOTS_ZOOM ? '' : 'none'
    }
    showSpots()
    map.on('zoomend', showSpots)
    const spots = new Map() // location id → its dot
    const ours = [] // our locations (for the city places' numbers)
    const addSpot = (l) => {
      spots.get(l.id)?.remove()
      const dot = L.circleMarker([l.latitude, l.longitude], SPOT).addTo(map)
      dot.bindPopup(() => popupFor({ kind: 'location', title: l.place_name, details: l }), POPUP)
      dot.on('mouseover', () => dot.setStyle(SPOT_HOVER))
      dot.on('mouseout', () => dot.setStyle({ radius: SPOT.radius }))
      spots.set(l.id, dot)
      ours.push({ ...l, key: normalizeArabic(l.place_name) })
      return dot
    }
    /** Our location that this city place is (same name, a few steps away), if any. */
    const sameAs = (p) => {
      const name = normalizeArabic(p.name)
      if (name.length < 3) return null
      let best = null
      for (const l of ours) {
        if (!(l.key.includes(name) || name.includes(l.key))) continue
        const metres = map.distance([p.lat, p.lng], [l.latitude, l.longitude])
        if (metres <= SAME_PLACE_METRES && (!best || metres < best.metres)) best = { ...l, metres }
      }
      return best
    }

    // every place of the city (mosques, schools, shops…) as a small icon, only those in view and only
    // when close enough: its card says its name and what it is
    map.createPane('places').style.zIndex = '440'
    let places = null
    const shown = new Map() // place key → its icon on the map
    const drawPlaces = () => {
      if (!places) return
      const keep = new Set()
      const z = map.getZoom()
      if (z >= ICONS_ZOOM) {
        const view = map.getBounds().pad(0.2)
        for (const p of places) {
          if (hiddenRef.current.has(p.group) || (z < ALL_ICONS_ZOOM && !MAIN_GROUPS.has(p.group))) continue
          if (!view.contains([p.lat, p.lng])) continue
          keep.add(p.key)
          if (shown.has(p.key)) continue
          const icon = L.marker([p.lat, p.lng], { icon: placeIcon(p.kind), pane: 'places', keyboard: false, title: p.name })
          icon.bindPopup(() => popupFor({ kind: 'place', title: p.name, subtitle: p.kind, details: sameAs(p) }), POPUP)
          shown.set(p.key, icon.addTo(map))
        }
      }
      for (const [key, icon] of shown) {
        if (!keep.has(key)) {
          icon.remove()
          shown.delete(key)
        }
      }
    }
    let alive = true
    import('../data/gazaPlaces.json').then((m) => {
      if (!alive) return // the page was left meanwhile
      places = m.default.places
        .filter(([, kind]) => !NOT_ICONS.has(kind))
        .map(([name, kind, lat, lng]) => ({ name, kind, lat, lng, group: groupOf(kind), key: `${name}|${lat}|${lng}` }))
      drawPlaces()
    })
    map.on('moveend', drawPlaces)

    let pin = null
    let street = null // the highlighted street's lines
    let draft = null // the pin of a point being added (until it is saved or cancelled)
    const clear = () => {
      pin?.remove()
      pin = null
      street?.remove()
      street = null
    }
    const highlight = async (name, forPin) => {
      const parts = (await loadStreets())[name]
      if (!parts || pin !== forPin) return // not drawn, or another result was picked meanwhile
      street = L.layerGroup([L.polyline(parts, STREET_BAND), L.polyline(parts, STREET_LINE)]).addTo(map)
    }
    api.current = {
      map,
      redrawPlaces: drawPlaces,
      setBase(key) {
        for (const [k, layer] of Object.entries(tiles)) {
          if (k === key) layer.addTo(map)
          else layer.remove()
        }
        boxRef.current?.setAttribute('data-base', key)
      },
      home() {
        unpick()
        clear()
        map.flyToBounds(city, { padding: [16, 16], duration: 0.8 })
      },
      setSpots(list) {
        for (const dot of spots.values()) dot.remove()
        spots.clear()
        ours.length = 0
        for (const l of list) addSpot(l)
      },
      /** a location saved from the map: its dot, with its card open */
      added(l) {
        draft?.remove()
        draft = null
        if (Number.isFinite(l.latitude) && Number.isFinite(l.longitude) && l.latitude && l.longitude) addSpot(l).openPopup()
      },
      draft(latlng) {
        draft?.remove()
        draft = latlng ? L.marker(latlng, { icon: PIN, keyboard: false, interactive: false }).addTo(map) : null
      },
      show(result) {
        clear()
        if (result.kind === 'neighborhood') {
          const poly = byName.get(result.title)
          if (poly) pickHood(result.title, poly)
          return
        }
        unpick()
        const at = L.latLng(result.lat, result.lng)
        const dot = result.kind === 'location' && spots.get(result.details.id)
        if (dot) {
          // one of the dots already on the map: go there and open its card
          map.flyTo(at, Math.max(map.getZoom(), 17), { duration: 0.8 })
          map.once('moveend', () => dot.openPopup())
          return
        }
        const card = result.kind === 'place' && result.subtitle !== 'شارع' ? { ...result, details: sameAs({ name: result.title, lat: result.lat, lng: result.lng }) } : result
        pin = L.marker(at, { icon: PIN, keyboard: false }).addTo(map).bindPopup(popupFor(card), PIN_POPUP)
        if (result.subtitle === 'شارع') highlight(result.title, pin)
        const b = result.bounds // OpenStreetMap: [south, north, west, east] — a street or a big place
        if (b && Math.abs(b[1] - b[0]) > 0.0015) {
          map.flyToBounds([[b[0], b[2]], [b[1], b[3]]], { padding: [40, 40], maxZoom: 18, duration: 0.8 })
        } else {
          map.flyTo(at, 17, { duration: 0.8 })
        }
        map.once('moveend', () => pin?.openPopup())
      },
    }

    // the box may change size (sidebar folded, window resized)
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.invalidateSize()
            fitCity()
          })
        : null
    observer?.observe(boxRef.current)
    return () => {
      alive = false
      observer?.disconnect()
      map.remove()
    }
  }, [])

  // the site's locations on the map (whoever may search them)
  useEffect(() => {
    if (!canSee) return undefined
    const controller = new AbortController()
    locationsApi
      .points(controller.signal)
      .then((list) => api.current.setSpots?.(list))
      .catch(() => {})
    return () => controller.abort()
  }, [canSee])

  // «إضافة نقطة»: the «الحي» list of the form (set to the neighborhood that was clicked)
  useEffect(() => {
    if (!canAdd) return undefined
    const controller = new AbortController()
    neighborhoodsApi
      .list(undefined, controller.signal)
      .then((data) => setDbHoods(Array.isArray(data) ? data : data?.results || []))
      .catch(() => {})
    return () => controller.abort()
  }, [canAdd])

  useEffect(() => {
    addRef.current = (latlng, hood) => {
      if (!canAdd) return
      api.current.draft?.(latlng)
      setAdding({ lat: latlng.lat, lng: latlng.lng, hood })
    }
  }, [canAdd])
  const closeAdd = () => {
    api.current.draft?.(null)
    setAdding(null)
  }
  const addFields = useMemo(() => withNeighborhoodOptions(LOCATION_ADD_FIELDS, dbHoods), [dbHoods])
  const addInitial = useMemo(() => (adding ? { neighborhood: findNeighborhood(dbHoods, adding.hood)?.id ?? '' } : null), [adding, dbHoods])

  async function saveSpot(payload) {
    const saved = await locationsApi.create({ ...payload, latitude: adding.lat.toFixed(6), longitude: adding.lng.toFixed(6) })
    setAdding(null)
    if (saved.latitude == null) {
      // saved, but its point was not kept (an older server): say so rather than moving the map
      api.current.draft?.(null)
      toast.error('تمت إضافة الموقع، لكن لم يُحفظ مكانه على الخريطة.')
      return
    }
    api.current.added?.({ ...saved, latitude: Number(saved.latitude), longitude: Number(saved.longitude) })
    toast.success('تمت إضافة الموقع على الخريطة وفي البحث عن المواقع.')
  }

  // «دليل الرموز»: a group turned on / off
  useEffect(() => {
    hiddenRef.current = hidden
    api.current.redrawPlaces?.()
  }, [hidden])
  const toggleGroup = (group) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

  // the base map (street map / satellite)
  useEffect(() => {
    api.current.setBase?.(base)
  }, [base])

  // full screen: the map and its tools fill the screen (Esc leaves it)
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === fullRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else fullRef.current?.requestFullscreen?.().catch(() => {})
  }

  // a newly picked tool says what it does, for a moment
  const pick = (id) => {
    setTool(id)
    setHintOn(true)
  }
  useEffect(() => {
    if (!hintOn || current.soon) return undefined
    const timer = setTimeout(() => setHintOn(false), HINT_FOR)
    return () => clearTimeout(timer)
  }, [hintOn, tool, current.soon])

  // the tool decides whether a drag moves the map (not with «تكبير»: it draws the zoom box)
  useEffect(() => {
    toolRef.current = tool
    const map = api.current.map
    if (!map) return
    if (tool === 'zoomIn') map.dragging.disable()
    else map.dragging.enable()
  }, [tool])

  return (
    <div ref={fullRef} className="map-card card overflow-visible">
      <div className="border-b border-line px-3 py-2.5 sm:px-4">
        <MapSearch neighborhoods={neighborhoods.neighborhoods} onPick={(r) => api.current.show?.(r)} />
      </div>
      <div className="map-shell relative overflow-hidden rounded-b-xl bg-[#eef0ee]">
        {/* Leaflet lays its tiles out left-to-right */}
        <div
          ref={boxRef}
          dir="ltr"
          role="region"
          aria-label="خريطة أحياء مدينة غزة"
          data-tool={tool}
          className="water-map h-[max(26rem,calc(100svh-15rem))] w-full bg-[#eef0ee]"
        />

        {/* the toolbar (GIS-style): select, zoom in / out, pan, draw, add a point, whole city */}
        <div
          role="toolbar"
          aria-label="أدوات الخريطة"
          className="absolute top-3 right-3 z-[1000] flex items-center gap-1 rounded-xl bg-white/95 p-1 shadow-md ring-1 ring-line backdrop-blur"
        >
          {TOOLS.filter((t) => t.id !== 'point' || canAdd).map((t, i, tools) => (
            <span key={t.id} className="contents">
              {i > 0 && tools[i - 1].group !== t.group && <Divider />}
              <ToolButton label={t.label} title={`${t.label}: ${t.hint}`} active={tool === t.id} onClick={() => pick(t.id)}>
                <t.icon className="h-[1.15rem] w-[1.15rem]" />
              </ToolButton>
              {/* the whole city sits with the zoom tools */}
              {t.id === 'zoomOut' && (
                <ToolButton label="عرض المدينة كاملة" onClick={() => api.current.home?.()}>
                  <ExtentIcon className="h-[1.15rem] w-[1.15rem]" />
                </ToolButton>
              )}
            </span>
          ))}
        </div>

        {/* GIS-style status: the scale as a number (beside Leaflet's scale bar) and the pointer's coordinates */}
        <div className="pointer-events-none absolute right-2 bottom-8 z-[1000] flex flex-col items-end gap-1 text-[0.7rem]" dir="ltr">
          <span ref={pointerRef} hidden className="num rounded bg-white/90 px-2 py-0.5 text-muted shadow-sm ring-1 ring-line" />
          {scale && (
            <span className="num rounded bg-white/90 px-2 py-0.5 font-semibold text-ink shadow-sm ring-1 ring-line" title="مقياس الرسم">
              {scale}
            </span>
          )}
        </div>

        {/* top-left: the base map, the key of the icons, full screen */}
        <div className="absolute top-3 left-3 z-[1000] flex flex-col items-start gap-2">
          <div
            role="radiogroup"
            aria-label="نوع الخريطة"
            className="flex items-center gap-0.5 rounded-xl bg-white/95 p-1 shadow-md ring-1 ring-line backdrop-blur"
          >
            <LayersIcon className="mx-1 h-4 w-4 text-muted" />
            {Object.entries(BASES).map(([key, b]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={base === key}
                onClick={() => setBase(key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  base === key ? 'bg-brand-600 text-white shadow-sm' : 'text-ink hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-white/95 p-1 shadow-md ring-1 ring-line backdrop-blur">
            <ToolButton label="دليل الرموز" active={legend} onClick={() => setLegend((v) => !v)}>
              <LegendIcon className="h-[1.15rem] w-[1.15rem]" />
            </ToolButton>
            <ToolButton label={full ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'} onClick={toggleFull}>
              {full ? <ShrinkIcon className="h-[1.15rem] w-[1.15rem]" /> : <ExpandIcon className="h-[1.15rem] w-[1.15rem]" />}
            </ToolButton>
          </div>
          {legend && (
            <div className="max-h-[min(24rem,55vh)] w-64 overflow-y-auto rounded-xl bg-white/95 p-3 text-xs shadow-md ring-1 ring-line backdrop-blur" role="region" aria-label="دليل الرموز">
              <p className="font-bold text-ink">دليل الرموز</p>
              <p className="mt-0.5 mb-2 text-[0.68rem] text-muted">اضغط على نوع لإخفائه أو إظهاره</p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 flex-none rounded-full border-2 border-white bg-brand-600 shadow ring-1 ring-brand-600/30" />
                  <span className="font-semibold text-ink">مواقعنا (من البحث عن مواقع)</span>
                </li>
                {LEGEND.map((g) => {
                  const on = !hidden.has(g.group)
                  return (
                    <li key={g.group}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleGroup(g.group)}
                        className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-start transition hover:bg-canvas ${
                          on ? 'text-ink' : 'text-muted line-through opacity-50'
                        }`}
                      >
                        <span
                          className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-white shadow"
                          style={{ background: g.color }}
                          // a fixed drawing from placeIcons.js, never text from the data
                          dangerouslySetInnerHTML={{ __html: g.glyph }}
                        />
                        {g.label}
                        {!MAIN_GROUPS.has(g.group) && on && <span className="ms-auto text-[0.62rem] text-muted">عند التقريب أكثر</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {/* far out, the dots and icons are hidden: say how to see them */}
        <p
          className={`pointer-events-none absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-ink/80 px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-md backdrop-blur transition-opacity duration-300 ${
            zoom && zoom < SPOTS_ZOOM ? 'opacity-100' : 'opacity-0'
          }`}
        >
          قرّب الخريطة لرؤية المواقع والمعالم
        </p>

        {/* the maps' terms ask for their credit on the map: kept out of the way behind «ⓘ» */}
        <div className="absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5" dir="ltr">
          <button
            type="button"
            aria-label="مصدر الخريطة"
            aria-expanded={credit}
            onClick={() => setCredit((c) => !c)}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[0.7rem] font-bold text-muted shadow-sm ring-1 ring-line hover:text-ink"
          >
            i
          </button>
          {credit && (
            <span className="rounded bg-white/90 px-2 py-0.5 text-[0.7rem] text-muted shadow-sm ring-1 ring-line">
              ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:underline">
                OpenStreetMap
              </a>
              {base === 'satellite' && ' · Esri, Maxar, Earthstar Geographics'}
            </span>
          )}
        </div>

        {/* what the tool does (and «قريباً» for the ones coming later) */}
        <p
          aria-live="polite"
          className={`pointer-events-none absolute top-[3.75rem] right-3 z-[1000] rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm transition-opacity duration-300 ${
            current.soon ? 'bg-gold-100 text-gold-700 ring-1 ring-gold-400/40' : 'bg-white/95 text-muted ring-1 ring-line'
          } ${hintOn || current.soon ? 'opacity-100' : 'opacity-0'}`}
        >
          {current.hint}
        </p>
      </div>

      <Modal open={Boolean(adding)} size="form" title="إضافة موقع من الخريطة" onClose={closeAdd} container={full ? fullRef.current : undefined}>
        {adding && (
          <>
            <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700 ring-1 ring-brand-100">
              <PinPlusIcon className="h-4 w-4" />
              <span className="num" dir="ltr">
                {adding.lat.toFixed(5)}, {adding.lng.toFixed(5)}
              </span>
              {adding.hood && <span className="font-semibold">· {adding.hood}</span>}
            </p>
            <RecordForm
              key={`${adding.lat},${adding.lng}`}
              fields={addFields}
              initial={addInitial}
              submitLabel="إضافة الموقع"
              onSubmit={saveSpot}
              onCancel={closeAdd}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
