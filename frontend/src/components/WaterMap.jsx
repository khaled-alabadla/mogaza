import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import neighborhoods from '../data/gazaNeighborhoods.json'
import MapSearch from './MapSearch'
import { CursorIcon, DrawIcon, ExtentIcon, HandIcon, PinPlusIcon, ZoomInIcon, ZoomOutIcon } from './Icons'

/*
 * «الخريطة»: the real map of Gaza City (OpenStreetMap, with the streets and places in Arabic),
 * and on it the neighborhoods of the municipality's paper map (frontend/src/data/gazaNeighborhoods.json,
 * built from «خريطة مدينة غزة.pdf» by frontend/scripts/build_gaza_map.py). Only the city shows: the
 * rest is covered and the view can't leave it. A GIS-style toolbar picks what a click / drag does.
 * This file (with Leaflet) is its own chunk, loaded only when the map is opened.
 */

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const READABLE_ZOOM = 16 // from here the map shows the street and place names

const STYLE = { color: '#3f9d69', weight: 1.6, opacity: 0.7, fillColor: '#0f8a47', fillOpacity: 0.04 } // light green lines
const HOVER = { weight: 2.4, opacity: 0.9, fillOpacity: 0.12 }
const PICKED = { color: '#0a6b38', weight: 3, opacity: 0.9, fillColor: '#0f8a47', fillOpacity: 0.03 }
const FADED = { color: '#3f9d69', weight: 1.2, opacity: 0.45, fillColor: '#ffffff', fillOpacity: 0.4 } // the others, while one is picked

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
  const box = document.createElement('div')
  box.className = 'search-card'
  box.dir = 'rtl'
  const line = (text, className) => {
    if (!text) return
    const p = document.createElement('p')
    p.className = className
    p.textContent = text
    box.appendChild(p)
  }
  line(result.title, 'search-card-title')
  if (result.kind === 'location') {
    const l = result.details
    line(l.description, 'search-card-text')
    line(l.neighborhood_name && `الحي: ${l.neighborhood_name}`, 'search-card-text')
    const numbers = [l.building_number && `رقم المبنى: ${l.building_number}`, l.street_number && `رقم الشارع: ${l.street_number}`]
    line(numbers.filter(Boolean).join(' · '), 'search-card-nums')
  } else {
    line(result.subtitle, 'search-card-text')
  }
  return box
}

/** The toolbar: one tool at a time decides what a click / drag on the map does (grouped as in GIS tools). */
const TOOLS = [
  { id: 'select', group: 0, label: 'تحديد', hint: 'اضغط على حي لتحديده والتقريب عليه', icon: CursorIcon },
  { id: 'pan', group: 0, label: 'تحريك', hint: 'اسحب الخريطة لتحريكها', icon: HandIcon },
  { id: 'zoomIn', group: 1, label: 'تكبير', hint: 'اضغط على مكان للتكبير عليه، أو اسحب مربعاً حول المنطقة', icon: ZoomInIcon },
  { id: 'zoomOut', group: 1, label: 'تصغير', hint: 'اضغط على مكان للتصغير منه', icon: ZoomOutIcon },
  { id: 'draw', group: 2, label: 'رسم', hint: 'أداة الرسم ستُفعَّل قريباً', icon: DrawIcon, soon: true },
  { id: 'point', group: 2, label: 'إضافة نقطة', hint: 'إضافة النقاط ستُفعَّل قريباً', icon: PinPlusIcon, soon: true },
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

export default function WaterMap() {
  const boxRef = useRef(null)
  const api = useRef({}) // what the toolbar needs from the Leaflet map (set up once below)
  const [tool, setTool] = useState('select')
  const [credit, setCredit] = useState(false)
  const [hintOn, setHintOn] = useState(false)
  const [scale, setScale] = useState('')
  const [pointer, setPointer] = useState(null) // [lat, lng] under the mouse
  const toolRef = useRef(tool)
  const current = TOOLS.find((t) => t.id === tool)

  useEffect(() => {
    const map = L.map(boxRef.current, {
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxZoom: 19,
      zoomControl: false, // the toolbar has the zoom tools
      boxZoom: false, // the zoom-in tool draws its own box
      attributionControl: false,
    })
    L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 140 }).addTo(map)
    L.tileLayer(TILES, {
      maxZoom: 19,
      // the site sends no referrer by default; OpenStreetMap asks for one (the site's address only)
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map)

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
      if (Number.isFinite(whole)) map.setMinZoom(Math.floor(whole * 4) / 4) // can't zoom out further than the whole city
    }
    fitCity()
    map.fitBounds(city, { padding: [16, 16] })
    // the zoom level is kept on the box (for the tests, and handy when checking the map)
    const markZoom = () => {
      boxRef.current?.setAttribute('data-zoom', String(map.getZoom()))
      setScale(scaleText(map))
    }
    markZoom()
    map.on('zoomend', markZoom)

    // outside the neighborhoods the click reaches the map; with «تكبير», a dragged box zooms to the box
    map.on('mousemove', (e) => setPointer([e.latlng.lat, e.latlng.lng]))
    map.on('mouseout', () => setPointer(null))
    let box = null
    map.on('click', (e) => zoomClick(e.latlng))
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
    let pin = null
    api.current = {
      map,
      home() {
        unpick()
        pin?.remove()
        map.flyToBounds(city, { padding: [16, 16], duration: 0.8 })
      },
      show(result) {
        pin?.remove()
        pin = null
        if (result.kind === 'neighborhood') {
          const poly = byName.get(result.title)
          if (poly) pickHood(result.title, poly)
          return
        }
        unpick()
        const at = L.latLng(result.lat, result.lng)
        pin = L.marker(at, { icon: PIN, keyboard: false }).addTo(map).bindPopup(popupFor(result), { offset: [0, -30] })
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
      observer?.disconnect()
      map.remove()
    }
  }, [])

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
    <div className="card overflow-visible">
      <div className="border-b border-line px-3 py-2.5 sm:px-4">
        <MapSearch neighborhoods={neighborhoods.neighborhoods} onPick={(r) => api.current.show?.(r)} />
      </div>
      <div className="relative overflow-hidden rounded-b-xl">
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
          {TOOLS.map((t, i) => (
            <span key={t.id} className="contents">
              {i > 0 && TOOLS[i - 1].group !== t.group && <Divider />}
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
          {pointer && (
            <span className="num rounded bg-white/90 px-2 py-0.5 text-muted shadow-sm ring-1 ring-line">
              {pointer[0].toFixed(5)}, {pointer[1].toFixed(5)}
            </span>
          )}
          {scale && (
            <span className="num rounded bg-white/90 px-2 py-0.5 font-semibold text-ink shadow-sm ring-1 ring-line" title="مقياس الرسم">
              {scale}
            </span>
          )}
        </div>

        {/* OpenStreetMap's terms ask for its credit on the map: kept out of the way behind «ⓘ» */}
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
    </div>
  )
}
