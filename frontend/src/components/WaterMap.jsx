import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import neighborhoods from '../data/gazaNeighborhoods.json'
import { complaintPointsApi, locationsApi, neighborhoodsApi, waterShapesApi, waterTableApi } from '../services/api'
import { normalizeArabic } from '../utils/arabic'
import { copyText } from '../utils/clipboard'
import ConfirmDialog from './ConfirmDialog'
import MapLayersPanel from './MapLayersPanel'
import MapSearch from './MapSearch'
import Modal from './Modal'
import { groupOf, kindLook, MAIN_GROUPS, NOT_ICONS, placeIcon } from './placeIcons'
import RecordForm from './RecordForm'
import { LOCATION_ADD_FIELDS, LOCATION_FIELDS, withNeighborhoodOptions } from './recordFields'
import { DAYS } from './WaterRowForm'
import WaterShapeForm from './WaterShapeForm'
import { CheckIcon, CopyIcon, CursorIcon, DrawIcon, ExpandIcon, ExtentIcon, HandIcon, MegaphoneIcon, PinPlusIcon, RulerIcon, ShrinkIcon, ZoomInIcon, ZoomOutIcon } from './Icons'

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
  // the same street map in quiet greys: the water areas, complaints and dots stand out on it
  light: { label: 'هادئة', urls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], maxNativeZoom: 19, className: 'tiles-quiet' },
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

// the landmarks a place is described by (and how far they may be)
const LANDMARK_NAME = /^(دوار|مفترق|ميدان|جسر)/
const LANDMARK_KINDS = new Set(['مسجد', 'مدرسة', 'مستشفى', 'جامعة', 'كنيسة'])
const NEAR_METRES = 500

// the city's places get their icons from this zoom on (closer in, they would cover each other)
const ICONS_ZOOM = 16
const ALL_ICONS_ZOOM = 18 // from here every kind (shops, restaurants…), before only the main ones
// our locations' dots show from this zoom on (the whole city would be covered with dots)
const SPOTS_ZOOM = 15
// a city place this close to one of our locations with the same name is that location (its numbers shown)
const SAME_PLACE_METRES = 150

// «جدول المياه» on the map: a drawn area on the chosen day — water that day / the next day / not
const WATER_ON = { pane: 'water', color: '#0369a1', weight: 2, opacity: 0.9, fillColor: '#0ea5e9', fillOpacity: 0.35 }
const WATER_NEXT = { pane: 'water', color: '#0ea5e9', weight: 1.5, opacity: 0.8, dashArray: '6 4', fillColor: '#7dd3fc', fillOpacity: 0.18 }
const WATER_OFF = { pane: 'water', color: '#64748b', weight: 1.2, opacity: 0.6, fillColor: '#94a3b8', fillOpacity: 0.1 }
// the outline being drawn with «رسم»
const SKETCH_LINE = { pane: 'sketch', color: '#0369a1', weight: 2.5, interactive: false }
const SKETCH_RUBBER = { pane: 'sketch', color: '#0369a1', weight: 2, dashArray: '5 5', opacity: 0.8, interactive: false }
const SKETCH_FILL = { pane: 'sketch', stroke: false, fillColor: '#0ea5e9', fillOpacity: 0.2, interactive: false }
const SKETCH_VERTEX = { pane: 'sketch', radius: 4, color: '#0369a1', weight: 2, fillColor: '#fff', fillOpacity: 1, bubblingMouseEvents: false }
const SKETCH_FIRST = { ...SKETCH_VERTEX, radius: 7, fillColor: '#0ea5e9' } // a click on it closes the area

/** On `day`: 'on' (water that day), 'next' (the day after) or 'off'. */
export function waterStatus(days, day) {
  if (days.includes(day)) return 'on'
  if (days.includes((day + 1) % 7)) return 'next'
  return 'off'
}
const WATER_STYLE = { on: WATER_ON, next: WATER_NEXT, off: WATER_OFF }

/** The card of a drawn water area: its name, whether water comes on the chosen day, its days; editors can change it. */
function waterCard(shape, day, today, actions) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }
  const box = el('div', 'search-card is-water')
  box.dir = 'rtl'
  const head = el('div', 'search-card-head')
  const icon = el('span', 'search-card-icon')
  icon.innerHTML = DROP_GLYPH // a fixed drawing, never text from the data
  const names = el('div', 'search-card-names')
  names.append(el('p', 'search-card-title', shape.name))
  const when = day === today ? 'اليوم' : `يوم ${DAYS[day]}`
  const status = waterStatus(shape.days, day)
  const label = {
    on: `تصلها المياه ${when}`,
    next: day === today ? 'تصلها المياه غداً' : `تصلها المياه يوم ${DAYS[(day + 1) % 7]}`,
    off: `لا تصلها المياه ${when}`,
  }[status]
  names.append(el('span', `search-card-badge is-${status}`, label))
  head.append(icon, names)
  box.append(head)
  const days = el('p', 'search-card-hood')
  days.append(el('span', 'search-card-hood-label', 'أيام المياه'), el('span', '', shape.days_text))
  box.append(days)
  if (actions?.canEdit) {
    const row = el('div', 'search-card-actions')
    const edit = el('button', '', 'تعديل')
    const remove = el('button', 'is-danger', 'حذف')
    edit.type = remove.type = 'button'
    edit.addEventListener('click', () => actions.edit(shape))
    remove.addEventListener('click', () => actions.remove(shape))
    row.append(edit, remove)
    box.append(row)
  }
  return box
}

const DROP_GLYPH =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/></svg>'

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

/** A complaint marked on the map: an orange drop with «!» — small when far out, bigger close in. */
const complaintPin = (width) => {
  const height = Math.round(width * 1.3)
  return L.divIcon({
    className: 'search-pin',
    html: `<svg viewBox="0 0 24 32" width="${width}" height="${height}" aria-hidden="true"><path d="M12 31s10-9.3 10-18A10 10 0 0 0 2 13c0 8.7 10 18 10 18z" fill="#ea580c" stroke="#fff" stroke-width="2"/><path d="M12 7.5v6.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.6" fill="#fff"/></svg>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height - 1],
    popupAnchor: [0, -height + 4],
  })
}
const COMPLAINT_PINS = { far: complaintPin(14), mid: complaintPin(18), near: complaintPin(24) }
const complaintPinFor = (zoom) => (zoom >= 17 ? COMPLAINT_PINS.near : zoom >= 15 ? COMPLAINT_PINS.mid : COMPLAINT_PINS.far)

/** The card of a complaint marked on the map: its number and type; editors can change or delete it. */
function complaintPointCard(point, actions) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }
  const box = el('div', 'search-card is-complaint')
  box.dir = 'rtl'
  const head = el('div', 'search-card-head')
  const names = el('div', 'search-card-names')
  names.append(el('p', 'search-card-title', `شكوى رقم ${point.number}`), el('span', 'search-card-badge', point.category))
  head.append(names)
  box.append(head)
  const grid = el('div', 'search-card-nums')
  for (const [label, value] of [
    ['رقم الشكوى', point.number],
    ['نوع الشكوى', point.category],
  ]) {
    const tile = el('div', 'search-card-num')
    tile.append(el('span', 'search-card-num-label', label), el('span', 'search-card-num-value is-text', value))
    grid.append(tile)
  }
  box.append(grid)
  const when = new Date(point.created_at)
  const meta = el('p', 'search-card-text')
  meta.textContent = `أُضيفت ${Number.isNaN(when.getTime()) ? '' : when.toLocaleDateString('ar-EG', { dateStyle: 'medium' })}${point.created_by_name ? ` · ${point.created_by_name}` : ''}`
  box.append(meta)
  if (actions?.canEdit) {
    const row = el('div', 'search-card-actions')
    const change = el('button', '', 'تعديل')
    const remove = el('button', 'is-danger', 'حذف')
    change.type = remove.type = 'button'
    change.addEventListener('click', () => actions.edit(point))
    remove.addEventListener('click', () => actions.remove(point))
    row.append(change, remove)
    box.append(row)
  }
  return box
}

/** The pin's card: name, then what is known (our location: description, building and street numbers). */
/** «اسم · الوصف · حي … · رقم المبنى … · رقم الشارع …»: the whole address on one line (for WhatsApp). */
export function addressLine(result) {
  const l = result.details || {}
  return [
    result.title,
    result.kind === 'location' && l.description !== l.neighborhood_name ? l.description : null,
    l.neighborhood_name && `حي ${l.neighborhood_name}`,
    l.building_number && `رقم المبنى ${l.building_number}`,
    l.street_number && `رقم الشارع ${l.street_number}`,
    result.near && `(${result.near})`,
  ]
    .filter(Boolean)
    .join(' - ')
}

const DIRECTIONS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب']

/** Where `to` lies from `from` («شرق», «جنوب غرب»…). */
export function directionOf(from, to) {
  const rad = (d) => (d * Math.PI) / 180
  const y = Math.sin(rad(to[1] - from[1])) * Math.cos(rad(to[0]))
  const x = Math.cos(rad(from[0])) * Math.sin(rad(to[0])) - Math.sin(rad(from[0])) * Math.cos(rad(to[0])) * Math.cos(rad(to[1] - from[1]))
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return DIRECTIONS[Math.round(bearing / 45) % 8]
}

/** The paper map's neighborhood that holds [lat, lng] (ray casting over its outline), or null. */
export function neighborhoodAt(lat, lng) {
  const inside = (ring) => {
    let hit = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i]
      const [yj, xj] = ring[j]
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  return neighborhoods.neighborhoods.find((n) => n.rings.some(inside))?.name || null
}

/** «1.25 كم» / «340 م» */
export function distanceText(metres) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} كم` : `${Math.round(metres)} م`
}

function popupFor(result, actions) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }
  const glyph = (node, svg) => {
    node.insertAdjacentHTML('afterbegin', svg) // fixed drawings, never text from the data
    return node
  }
  const l = result.details || null
  const isOurs = result.kind === 'location'
  const look = result.kind === 'place' ? kindLook(result.subtitle) : null
  const accent = isOurs || l?.id ? '#0a6b38' : look ? look.color : '#334155'

  const box = el('div', 'search-card pc')
  box.dir = 'rtl'
  box.style.setProperty('--pc-accent', accent)

  // the head: a coloured badge (what it is), the name, and a chip with its kind
  const head = el('div', 'pc-head')
  const badge = el('span', 'pc-badge')
  badge.innerHTML = look ? look.glyph : result.kind === 'building' ? BUILDING_GLYPH : PIN_GLYPH
  const names = el('div', 'pc-names')
  names.append(el('p', 'pc-title', result.title))
  const chip = isOurs ? null : result.kind === 'building' ? 'مبنى' : result.subtitle
  if (chip) names.append(el('span', 'pc-chip', chip))
  head.append(badge, names)
  box.append(head)

  // what is known: description, neighborhood, nearest landmark
  const rows = el('dl', 'pc-rows')
  const row = (svg, label, value) => {
    if (!value) return
    const item = el('div', 'pc-row')
    item.append(glyph(el('dt', '', label), svg), el('dd', '', value))
    rows.append(item)
  }
  if (isOurs && l?.description && l.description !== l.neighborhood_name) row(NOTE_GLYPH, 'الوصف', l.description)
  row(HOME_GLYPH, 'الحي', l?.neighborhood_name)
  row(COMPASS_GLYPH, 'قرب', result.near)
  if (rows.childNodes.length) box.append(rows)

  // the building and street numbers, each with its copy button
  const tiles = [
    ['رقم المبنى', l?.building_number],
    ['رقم الشارع', l?.street_number],
  ].filter(([, value]) => value)
  if (tiles.length) {
    const grid = el('div', 'pc-nums')
    for (const [label, value] of tiles) {
      const tile = el('div', 'pc-num')
      const copy = glyph(el('button', 'pc-copy'), COPY_GLYPH)
      copy.type = 'button'
      copy.setAttribute('aria-label', `نسخ ${label}`)
      copy.title = `نسخ ${label}`
      copy.addEventListener('click', () => {
        copyText(String(value)).then(
          () => {
            // «تم النسخ» under the number, for a moment
            tile.querySelector('.pc-copied')?.remove()
            const copied = el('span', 'pc-copied', 'تم النسخ')
            tile.append(copied)
            tile.classList.add('is-done')
            setTimeout(() => {
              copied.remove()
              tile.classList.remove('is-done')
            }, 1500)
          },
          () => {},
        )
      })
      tile.append(el('span', 'pc-num-label', label), el('span', 'pc-num-value', String(value)), copy)
      grid.append(tile)
    }
    box.append(grid)
  } else if (result.kind === 'place') {
    // a landmark whose numbers aren't known yet: editors can add them
    const empty = el('div', 'pc-empty')
    empty.append(el('span', '', 'رقم المبنى والشارع غير مسجلين'))
    if (actions?.canEdit) {
      const add = glyph(el('button', 'pc-add', 'إضافة رقم المبنى والشارع'), PLUS_GLYPH)
      add.type = 'button'
      add.addEventListener('click', () => actions.addNumbers(result))
      empty.append(add)
    }
    box.append(empty)
  }

  // what can be done with it
  const foot = el('div', 'pc-foot')
  const button = (label, svg, onClick, className = '') => {
    const node = glyph(el('button', `pc-action ${className}`, label), svg)
    node.type = 'button'
    node.addEventListener('click', onClick)
    foot.append(node)
    return node
  }
  const copyAll = button('نسخ العنوان', COPY_GLYPH, () =>
    copyText(addressLine(result)).then(
      () => {
        copyAll.lastChild.textContent = 'تم النسخ'
        copyAll.classList.add('is-done')
        setTimeout(() => {
          copyAll.lastChild.textContent = 'نسخ العنوان'
          copyAll.classList.remove('is-done')
        }, 1500)
      },
      () => {},
    ),
  )
  if (actions?.canEdit) {
    if (isOurs) {
      button('تعديل', EDIT_GLYPH, () => actions.edit(result.details))
      button('نقل النقطة', MOVE_GLYPH, () => actions.move(result.details))
    } else if (result.kind === 'building' && !l?.id) {
      button('حفظ كموقع', PLUS_GLYPH, () => actions.keep(result), 'is-primary')
    }
  }
  box.append(foot)
  return box
}

const COPY_GLYPH =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'

const svgIcon = (paths, size = 14) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const NOTE_GLYPH = svgIcon('<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>', 13)
const HOME_GLYPH = svgIcon('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', 13)
const COMPASS_GLYPH = svgIcon('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', 13)
const EDIT_GLYPH = svgIcon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>', 13)
const MOVE_GLYPH = svgIcon('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>', 13)
const PLUS_GLYPH = svgIcon('<path d="M12 5v14M5 12h14"/>', 13)
const BUILDING_GLYPH = svgIcon('<path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h3a1 1 0 0 1 1 1v10M3 21h18"/><path d="M8.5 8h3M8.5 12h3M8.5 16h3"/>', 18)

const PIN_GLYPH =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>'

/** The toolbar: one tool at a time decides what a click / drag on the map does (grouped as in GIS tools). */
const TOOLS = [
  { id: 'select', group: 0, label: 'تحديد', hint: 'اضغط على حي لتحديده والتقريب عليه', icon: CursorIcon },
  { id: 'pan', group: 0, label: 'تحريك', hint: 'اسحب الخريطة لتحريكها', icon: HandIcon },
  { id: 'zoomIn', group: 1, label: 'تكبير', hint: 'اضغط على مكان للتكبير عليه، أو اسحب مربعاً حول المنطقة', icon: ZoomInIcon },
  { id: 'zoomOut', group: 1, label: 'تصغير', hint: 'اضغط على مكان للتصغير منه', icon: ZoomOutIcon },
  { id: 'draw', group: 2, label: 'رسم', hint: 'اضغط على الخريطة لرسم حدود منطقة تصلها المياه، ثم اضغط على النقطة الأولى أو «إنهاء»', icon: DrawIcon },
  { id: 'measure', group: 2, label: 'قياس', hint: 'اضغط على نقاط متتالية لقياس المسافة بينها', icon: RulerIcon },
  { id: 'complaint', group: 2, label: 'شكوى على الخريطة', hint: 'اضغط على مكان الشكوى في الخريطة، ثم أدخل رقمها ونوعها', icon: MegaphoneIcon },
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
  const canDraw = can('water.edit')
  const [shapes, setShapes] = useState([]) // the drawn water areas
  const [today, setToday] = useState(null)
  const [day, setDay] = useState(null) // the day the areas are coloured for (today at first)
  const [showWater, setShowWater] = useState(true)
  // «الطبقات»: open from the start on wide screens; which layers show
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280)
  const [layers, setLayers] = useState({ hoods: true, spots: true, places: true, pins: true })
  const [spotCount, setSpotCount] = useState(0)
  const [placeCount, setPlaceCount] = useState(0)
  const [tilesLoading, setTilesLoading] = useState(false)
  const statsRef = useRef(null) // the map → React: how many landmarks
  const [rows, setRows] = useState(null) // the distribution table (the drawing form's «موعد المياه»)
  const [sketchCount, setSketchCount] = useState(0) // points of the outline being drawn
  const [shapeForm, setShapeForm] = useState(null) // { ring } (a new area) or { shape } (editing one)
  const [removing, setRemoving] = useState(null)
  const [editing, setEditing] = useState(null) // a location being edited from its card
  const [moving, setMoving] = useState(null) // a location whose dot is being moved («نقل النقطة»)
  const movingRef = useRef(null)
  const moveRef = useRef(null) // the map's click → the new place of the moving dot
  const spotActionsRef = useRef(null) // a location card's «تعديل» / «نقل النقطة» → React
  const [measured, setMeasured] = useState({ metres: 0, count: 0 })
  const [unplaced, setUnplaced] = useState([]) // our locations with no place on the map yet
  const [placing, setPlacing] = useState(false) // the list of those is open
  const [unplacedQuery, setUnplacedQuery] = useState('')
  const canMarkComplaints = can('complaints.edit')
  const [complaintPoints, setComplaintPoints] = useState([])
  const [complaintForm, setComplaintForm] = useState(null) // { lat, lng } (a new one) or { point } (editing)
  const [removingPoint, setRemovingPoint] = useState(null)
  const [removePointBusy, setRemovePointBusy] = useState(false)
  const complaintAddRef = useRef(null) // the map's click with «شكوى على الخريطة» → the form
  const complaintActionsRef = useRef(null) // a complaint card's buttons → React
  const measureRef = useRef(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const drawRef = useRef(null) // the map → React: { count(n), finish(ring) }
  const waterActionsRef = useRef(null) // the water card's buttons → React
  const [dbHoods, setDbHoods] = useState(null)
  const boxRef = useRef(null)
  const addRef = useRef(null) // the map's click → open the form (set below, read inside the map's handlers)
  const api = useRef({}) // what the toolbar needs from the Leaflet map (set up once below)
  const [tool, setTool] = useState('select')
  const [credit, setCredit] = useState(false)
  const [base, setBase] = useState('map')
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
          className: b.className || '',
          keepBuffer: 4, // keep the pictures around the view: moving back shows them at once
          updateWhenZooming: false, // load the new level once the zoom ends (not every step of it)
          // the site sends no referrer by default; OpenStreetMap asks for one (the site's address only)
          referrerPolicy: 'strict-origin-when-cross-origin',
        }),
      ]),
    )
    // a thin bar along the top while map pictures are loading
    for (const layer of Object.values(tiles)) {
      layer.on('loading', () => setTilesLoading(true))
      layer.on('load', () => setTilesLoading(false))
    }
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
        if (movingRef.current) {
          moveRef.current?.(e.latlng)
          return
        }
        if (toolRef.current === 'draw') {
          addVertex(e.latlng)
          return
        }
        if (toolRef.current === 'measure') {
          addMeasure(e.latlng)
          return
        }
        if (toolRef.current === 'complaint') {
          complaintAddRef.current?.(e.latlng)
          return
        }
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
    map.on('click', (e) => {
      if (movingRef.current) moveRef.current?.(e.latlng)
      else if (toolRef.current === 'point') addRef.current?.(e.latlng, null)
      else if (toolRef.current === 'draw') addVertex(e.latlng)
      else if (toolRef.current === 'measure') addMeasure(e.latlng)
      else if (toolRef.current === 'complaint') complaintAddRef.current?.(e.latlng)
      else zoomClick(e.latlng)
    })
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

    // «جدول المياه»: the drawn areas, coloured for the chosen day (above the neighborhoods)
    map.createPane('water').style.zIndex = '410'
    const water = L.layerGroup().addTo(map)
    const setWater = (list, onDay, todayIndex, visible) => {
      water.clearLayers()
      if (!visible) return
      for (const shape of list) {
        const area = L.polygon(shape.rings, WATER_STYLE[waterStatus(shape.days, onDay)]).addTo(water)
        area.bindTooltip(`${shape.name} · ${shape.days_text}`, { sticky: true, direction: 'top', offset: [0, -8], className: 'hood-tip' })
        area.bindPopup(() => waterCard(shape, onDay, todayIndex, waterActionsRef.current), POPUP)
      }
    }

    // «شكوى على الخريطة»: the marked complaints (their pins get smaller as the map zooms out)
    const complaintPins = L.layerGroup().addTo(map)
    const setComplaintPins = (list) => {
      complaintPins.clearLayers()
      const icon = complaintPinFor(map.getZoom())
      for (const point of list) {
        L.marker([Number(point.latitude), Number(point.longitude)], { icon, keyboard: false, title: `شكوى ${point.number}` })
          .bindPopup(() => complaintPointCard(point, complaintActionsRef.current), POPUP)
          .addTo(complaintPins)
      }
    }
    let pinSize = complaintPinFor(map.getZoom())
    map.on('zoomend', () => {
      const icon = complaintPinFor(map.getZoom())
      if (icon === pinSize) return
      pinSize = icon
      complaintPins.eachLayer((marker) => marker.setIcon(icon))
    })
    // «رسم»: a click adds a point of the outline; the first point (or «إنهاء», or a double click) closes it
    map.createPane('sketch').style.zIndex = '460'
    const sketch = { points: [], layer: L.layerGroup().addTo(map), rubber: null }
    const redrawSketch = () => {
      sketch.layer.clearLayers()
      sketch.rubber = null
      const points = sketch.points
      if (points.length >= 3) L.polygon(points, SKETCH_FILL).addTo(sketch.layer)
      if (points.length >= 2) L.polyline(points, SKETCH_LINE).addTo(sketch.layer)
      points.forEach((point, i) => {
        const vertex = L.circleMarker(point, i === 0 ? SKETCH_FIRST : SKETCH_VERTEX).addTo(sketch.layer)
        if (i === 0) vertex.on('click', () => finishSketch())
      })
      drawRef.current?.count(points.length)
    }
    function addVertex(latlng) {
      const last = sketch.points.at(-1)
      // the second click of a double click lands on the same spot: not a new point
      if (last && map.latLngToContainerPoint(last).distanceTo(map.latLngToContainerPoint(latlng)) < 4) return
      sketch.points.push(latlng)
      redrawSketch()
    }
    function finishSketch() {
      if (sketch.points.length >= 3) drawRef.current?.finish(sketch.points.map((p) => [p.lat, p.lng]))
    }
    const clearSketch = () => {
      sketch.points = []
      redrawSketch()
    }
    map.on('mousemove', (e) => {
      if (toolRef.current !== 'draw' || !sketch.points.length) return
      const from = sketch.points.at(-1)
      if (sketch.rubber) sketch.rubber.setLatLngs([from, e.latlng])
      else sketch.rubber = L.polyline([from, e.latlng], SKETCH_RUBBER).addTo(sketch.layer)
    })
    map.on('dblclick', () => toolRef.current === 'draw' && finishSketch())

    // «قياس»: a line through the clicked points, and its length
    const measure = { points: [], layer: L.layerGroup().addTo(map) }
    const drawMeasure = () => {
      measure.layer.clearLayers()
      const points = measure.points
      if (points.length >= 2) L.polyline(points, { ...SKETCH_LINE, color: '#b45309', dashArray: '8 6' }).addTo(measure.layer)
      let metres = 0
      points.forEach((point, i) => {
        if (i) metres += map.distance(points[i - 1], point)
        const vertex = L.circleMarker(point, { ...SKETCH_VERTEX, color: '#b45309', interactive: false }).addTo(measure.layer)
        if (i === points.length - 1 && i > 0) {
          vertex.bindTooltip(distanceText(metres), { permanent: true, direction: 'top', offset: [0, -6], className: 'measure-tip' })
        }
      })
      measureRef.current?.(metres, points.length)
    }
    function addMeasure(latlng) {
      const last = measure.points.at(-1)
      if (last && map.latLngToContainerPoint(last).distanceTo(map.latLngToContainerPoint(latlng)) < 4) return
      measure.points.push(latlng)
      drawMeasure()
    }

    // the searched street sits under the dots, the dots above the neighborhoods (and the city's cover)
    map.createPane('streets').style.zIndex = '420'
    map.createPane('spots').style.zIndex = '450'
    const spotsPane = map.getPane('spots')
    let spotsOn = true // «مواقعنا» switched on in «الطبقات»
    let placesOn = true // «المعالم» switched on
    const showSpots = () => {
      spotsPane.style.display = spotsOn && map.getZoom() >= SPOTS_ZOOM ? '' : 'none'
    }
    showSpots()
    map.on('zoomend', showSpots)
    const spots = new Map() // location id → its dot
    const ours = [] // our locations (for the city places' numbers)
    const addSpot = (l) => {
      spots.get(l.id)?.remove()
      const dot = L.circleMarker([l.latitude, l.longitude], SPOT).addTo(map)
      dot.bindPopup(
        () =>
          popupFor(
            { kind: 'location', title: l.place_name, details: l, at: [l.latitude, l.longitude], near: nearOf(l.latitude, l.longitude, l.place_name) },
            spotActionsRef.current,
          ),
        POPUP,
      )
      dot.on('mouseover', () => dot.setStyle(SPOT_HOVER))
      dot.on('mouseout', () => dot.setStyle({ radius: SPOT.radius }))
      spots.set(l.id, dot)
      const before = ours.findIndex((o) => o.id === l.id)
      if (before >= 0) ours.splice(before, 1)
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
      if (placesOn && z >= ICONS_ZOOM) {
        const view = map.getBounds().pad(0.2)
        for (const p of places) {
          if (hiddenRef.current.has(p.group) || (z < ALL_ICONS_ZOOM && !MAIN_GROUPS.has(p.group))) continue
          if (!view.contains([p.lat, p.lng])) continue
          keep.add(p.key)
          if (shown.has(p.key)) continue
          const icon = L.marker([p.lat, p.lng], { icon: placeIcon(p.kind), pane: 'places', keyboard: false, title: p.name })
          icon.bindPopup(
            () => popupFor({ kind: 'place', title: p.name, subtitle: p.kind, details: sameAs(p), at: [p.lat, p.lng] }, spotActionsRef.current),
            POPUP,
          )
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
    // the landmark people would name to say where a place is («شرق دوار حيدر بـ180 م»)
    let landmarks = []
    const nearOf = (lat, lng, name) => {
      const own = normalizeArabic(name || '')
      let best = null
      for (const p of landmarks) {
        const metres = map.distance([lat, lng], [p.lat, p.lng])
        if (metres > NEAR_METRES || (best && metres >= best.metres)) continue
        const other = normalizeArabic(p.name)
        if (own && (own.includes(other) || other.includes(own))) continue // the place itself
        best = { ...p, metres }
      }
      if (!best) return null
      if (best.metres < 40) return `بجانب ${best.name}`
      return `${directionOf([best.lat, best.lng], [lat, lng])} ${best.name} بـ${distanceText(best.metres)}`
    }

    let alive = true
    import('../data/gazaPlaces.json').then((m) => {
      if (!alive) return // the page was left meanwhile
      places = m.default.places
        .filter(([, kind]) => !NOT_ICONS.has(kind))
        .map(([name, kind, lat, lng]) => ({ name, kind, lat, lng, group: groupOf(kind), key: `${name}|${lat}|${lng}` }))
      landmarks = places.filter((p) => LANDMARK_NAME.test(p.name) || LANDMARK_KINDS.has(p.kind))
      statsRef.current?.places(places.length)
      drawPlaces()
    })
    map.on('moveend', drawPlaces)

    /** A ring that spreads out once from where the search brought the map (then goes). */
    const pulse = (at) => {
      const ring = L.marker(at, {
        icon: L.divIcon({ className: 'pulse-ring', html: '<span></span>', iconSize: [44, 44], iconAnchor: [22, 22] }),
        interactive: false,
        keyboard: false,
      }).addTo(map)
      setTimeout(() => ring.remove(), 2400)
    }

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
      setWater,
      setComplaintPins,
      /** «الطبقات»: a layer switched on / off */
      setLayer(key, on) {
        if (key === 'hoods') {
          for (const layer of layers) {
            if (on) layer.addTo(map)
            else layer.remove()
          }
        } else if (key === 'spots') {
          spotsOn = on
          showSpots()
        } else if (key === 'places') {
          placesOn = on
          drawPlaces()
        } else if (key === 'pins') {
          if (on) complaintPins.addTo(map)
          else complaintPins.remove()
        }
      },
      measure: {
        undo() {
          measure.points.pop()
          drawMeasure()
        },
        clear() {
          measure.points = []
          drawMeasure()
        },
      },
      /** a location changed (edited / moved): its dot again, with its card open */
      updateSpot(l) {
        map.closePopup()
        addSpot(l).openPopup()
      },
      sketch: {
        undo() {
          sketch.points.pop()
          redrawSketch()
        },
        clear: clearSketch,
        finish: finishSketch,
      },
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
          // one of the dots already on the map: go there (its card opens when the dot is clicked)
          map.flyTo(at, Math.max(map.getZoom(), 17), { duration: 0.8 })
          map.once('moveend', () => pulse(at))
          return
        }
        let card = result.kind === 'place' && result.subtitle !== 'شارع' ? { ...result, details: sameAs({ name: result.title, lat: result.lat, lng: result.lng }) } : result
        if (result.kind === 'building') {
          // a building found from its numbers: its neighborhood and nearest landmark, and «حفظ كموقع»
          const hood = result.details.neighborhood_name || neighborhoodAt(result.lat, result.lng)
          card = { ...result, details: { ...result.details, neighborhood_name: hood }, near: nearOf(result.lat, result.lng, '') }
        }
        pin = L.marker(at, { icon: PIN, keyboard: false, title: result.title })
          .addTo(map)
          .bindPopup(() => popupFor({ ...card, at: [result.lat, result.lng] }, spotActionsRef.current), PIN_POPUP)
        if (result.subtitle === 'شارع') highlight(result.title, pin)
        const b = result.bounds // OpenStreetMap: [south, north, west, east] — a street or a big place
        if (b && Math.abs(b[1] - b[0]) > 0.0015) {
          map.flyToBounds([[b[0], b[2]], [b[1], b[3]]], { padding: [40, 40], maxZoom: 18, duration: 0.8 })
        } else {
          map.flyTo(at, 17, { duration: 0.8 })
        }
        map.once('moveend', () => pulse(at))
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
      .then((list) => {
        api.current.setSpots?.(list)
        setSpotCount(list.length)
      })
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
  const addInitial = useMemo(
    () =>
      adding
        ? {
            neighborhood: findNeighborhood(dbHoods, adding.hood)?.id ?? '',
            building_number: adding.building || '',
            street_number: adding.street || '',
            place_name: adding.name || '',
            description: adding.description || '',
          }
        : null,
    [adding, dbHoods],
  )

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
    setSpotCount((n) => n + 1)
    toast.success('تمت إضافة الموقع على الخريطة وفي البحث عن المواقع.')
  }

  // «جدول المياه» on the map: the drawn areas (and, for those who draw, the table's rows)
  useEffect(() => {
    const controller = new AbortController()
    waterShapesApi
      .list(undefined, controller.signal)
      .then((data) => {
        setShapes(data.results || [])
        setToday(data.today)
        setDay((d) => d ?? data.today)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!canDraw) return undefined
    const controller = new AbortController()
    waterTableApi
      .list(undefined, controller.signal)
      .then((data) => setRows(data.results || []))
      .catch(() => {})
    return () => controller.abort()
  }, [canDraw])
  useEffect(() => {
    api.current.setWater?.(shapes, day ?? today ?? 0, today, showWater)
  }, [shapes, day, today, showWater])

  useEffect(() => {
    drawRef.current = { count: setSketchCount, finish: (ring) => setShapeForm({ ring }) }
    waterActionsRef.current = {
      canEdit: canDraw,
      edit(shape) {
        api.current.map?.closePopup()
        setShapeForm({ shape })
      },
      remove(shape) {
        api.current.map?.closePopup()
        setRemoving(shape)
      },
    }
  }, [canDraw])

  // while drawing: Esc drops the outline, Backspace takes back the last point
  useEffect(() => {
    if (tool !== 'draw' || shapeForm) return undefined
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return
      if (e.key === 'Escape') api.current.sketch?.clear()
      else if (e.key === 'Backspace') {
        e.preventDefault()
        api.current.sketch?.undo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tool, shapeForm])

  async function saveShape(payload) {
    if (shapeForm.shape) {
      const saved = await waterShapesApi.update(shapeForm.shape.id, payload)
      setShapes((list) => list.map((s) => (s.id === saved.id ? saved : s)))
      toast.success('تم حفظ المنطقة.')
    } else {
      const saved = await waterShapesApi.create({ ...payload, rings: [shapeForm.ring] })
      setShapes((list) => [...list, saved])
      api.current.sketch?.clear()
      toast.success(`تمت إضافة المنطقة إلى موعد «${saved.days_text}» في جدول المياه.`)
    }
    setShapeForm(null)
    // the table may have a new row / address now
    waterTableApi
      .list()
      .then((data) => setRows(data.results || []))
      .catch(() => {})
  }

  async function confirmRemove() {
    setRemoveBusy(true)
    try {
      await waterShapesApi.remove(removing.id)
      setShapes((list) => list.filter((s) => s.id !== removing.id))
      toast.success('تم حذف المنطقة.')
      setRemoving(null)
    } catch {
      toast.error('تعذر حذف المنطقة.')
    } finally {
      setRemoveBusy(false)
    }
  }

  // a location card's buttons (editors): «تعديل» opens the form, «نقل النقطة» waits for a click on the map
  useEffect(() => {
    spotActionsRef.current = {
      canEdit: canAdd,
      addNumbers(result) {
        api.current.map?.closePopup()
        api.current.draft?.(L.latLng(result.lat ?? result.at[0], result.lng ?? result.at[1]))
        const [lat, lng] = result.at
        setAdding({ lat, lng, hood: neighborhoodAt(lat, lng), name: result.title, description: result.subtitle || '' })
      },
      keep(result) {
        api.current.map?.closePopup()
        api.current.draft?.(L.latLng(result.lat, result.lng))
        setAdding({
          lat: result.lat,
          lng: result.lng,
          hood: neighborhoodAt(result.lat, result.lng),
          building: result.details.building_number,
          street: result.details.street_number,
        })
      },
      edit(l) {
        api.current.map?.closePopup()
        setEditing(l)
      },
      move(l) {
        api.current.map?.closePopup()
        setMoving(l)
      },
    }
    measureRef.current = (metres, count) => setMeasured({ metres, count })
  }, [canAdd])
  useEffect(() => {
    movingRef.current = moving
    if (!moving) return undefined
    const onKey = (e) => e.key === 'Escape' && setMoving(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moving])
  const asSpot = (saved) => ({ ...saved, latitude: Number(saved.latitude), longitude: Number(saved.longitude) })
  useEffect(() => {
    moveRef.current = async (latlng) => {
      const l = movingRef.current
      if (!l) return
      setMoving(null)
      try {
        const saved = await locationsApi.update(l.id, { latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) })
        api.current.updateSpot?.(asSpot(saved))
        setUnplaced((list) => list.filter((x) => x.id !== l.id))
        toast.success('تم نقل الموقع إلى مكانه الجديد.')
      } catch {
        toast.error('تعذر نقل الموقع.')
      }
    }
  })
  const editFields = useMemo(() => withNeighborhoodOptions(LOCATION_FIELDS, dbHoods), [dbHoods])

  // «شكوى على الخريطة»: the complaints marked where they are (whoever may see complaints)
  const canSeeComplaints = can('complaints.view')
  useEffect(() => {
    if (!canSeeComplaints) return undefined
    const controller = new AbortController()
    complaintPointsApi
      .list(undefined, controller.signal)
      .then((list) => setComplaintPoints(Array.isArray(list) ? list : list?.results || []))
      .catch(() => {})
    return () => controller.abort()
  }, [canSeeComplaints])
  useEffect(() => {
    api.current.setComplaintPins?.(complaintPoints)
  }, [complaintPoints])
  useEffect(() => {
    complaintAddRef.current = (latlng) => {
      if (!canMarkComplaints) return
      api.current.draft?.(latlng)
      setComplaintForm({ lat: latlng.lat, lng: latlng.lng })
    }
    complaintActionsRef.current = {
      canEdit: canMarkComplaints,
      edit(point) {
        api.current.map?.closePopup()
        setComplaintForm({ point })
      },
      remove(point) {
        api.current.map?.closePopup()
        setRemovingPoint(point)
      },
    }
  }, [canMarkComplaints])
  const complaintFields = useMemo(
    () => [
      { name: 'number', label: 'رقم الشكوى', required: true, maxLength: 50, numeric: true, half: true, placeholder: 'مثال: 1542' },
      {
        name: 'category',
        label: 'نوع الشكوى',
        required: true,
        maxLength: 150,
        half: true,
        placeholder: 'مثال: تسرب مياه',
        suggestions: [...new Set(complaintPoints.map((p) => p.category))],
      },
    ],
    [complaintPoints],
  )
  const closeComplaintForm = () => {
    api.current.draft?.(null)
    setComplaintForm(null)
  }
  async function saveComplaintPoint(payload) {
    if (complaintForm.point) {
      const saved = await complaintPointsApi.update(complaintForm.point.id, payload)
      setComplaintPoints((list) => list.map((p) => (p.id === saved.id ? saved : p)))
      toast.success('تم حفظ الشكوى.')
    } else {
      const saved = await complaintPointsApi.create({
        ...payload,
        latitude: complaintForm.lat.toFixed(6),
        longitude: complaintForm.lng.toFixed(6),
      })
      setComplaintPoints((list) => [saved, ...list])
      toast.success(`تمت إضافة الشكوى رقم ${saved.number} على الخريطة.`)
    }
    closeComplaintForm()
  }
  async function confirmRemovePoint() {
    setRemovePointBusy(true)
    try {
      await complaintPointsApi.remove(removingPoint.id)
      setComplaintPoints((list) => list.filter((p) => p.id !== removingPoint.id))
      toast.success('تم حذف الشكوى من الخريطة.')
      setRemovingPoint(null)
    } catch {
      toast.error('تعذر حذف الشكوى.')
    } finally {
      setRemovePointBusy(false)
    }
  }

  // our locations still without a place: listed for editors, to be placed with a click
  useEffect(() => {
    if (!canAdd) return undefined
    const controller = new AbortController()
    locationsApi
      .list({ no_coordinates: 1, page_size: 200 }, controller.signal)
      .then((data) => setUnplaced(data.results || []))
      .catch(() => {})
    return () => controller.abort()
  }, [canAdd])
  // «نسخ الأرقام»: the building and street numbers of an unplaced location (e.g. to look it up)
  const [copiedId, setCopiedId] = useState(null)
  const copyNumbers = (l) =>
    copyText(`مبنى ${l.building_number || '—'} شارع ${l.street_number || '—'}`).then(
      () => {
        setCopiedId(l.id)
        setTimeout(() => setCopiedId((id) => (id === l.id ? null : id)), 1500)
      },
      () => {},
    )
  const unplacedShown = useMemo(() => {
    const terms = normalizeArabic(unplacedQuery).split(' ').filter(Boolean)
    return unplaced.filter((l) => terms.every((t) => normalizeArabic(`${l.place_name} ${l.description} ${l.building_number} ${l.street_number}`).includes(t)))
  }, [unplaced, unplacedQuery])

  async function saveEdit(payload) {
    const saved = await locationsApi.update(editing.id, payload)
    setEditing(null)
    api.current.updateSpot?.(asSpot(saved))
    toast.success('تم حفظ التعديلات.')
  }

  // «الطبقات»: the water areas and the complaints have their own state; the others are switched in the map
  const setLayer = (key, on) => {
    if (key === 'water') setShowWater(on)
    else setLayers((current) => ({ ...current, [key]: on }))
  }
  useEffect(() => {
    for (const [key, on] of Object.entries(layers)) api.current.setLayer?.(key, on)
  }, [layers])
  useEffect(() => {
    statsRef.current = { places: setPlaceCount }
  }, [])

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
    // a double click closes the drawn area (instead of zooming in); another tool drops the outline
    if (tool === 'draw' || tool === 'measure') map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
    if (tool !== 'draw') api.current.sketch?.clear()
    if (tool !== 'measure') api.current.measure?.clear()
  }, [tool])

  return (
    <div ref={fullRef} className="map-card card overflow-visible">
      <div className="border-b border-line px-3 py-2.5 sm:px-4">
        <MapSearch neighborhoods={neighborhoods.neighborhoods} onPick={(r) => api.current.show?.(r)} />
      </div>
      <div className="map-shell relative isolate overflow-hidden rounded-b-xl bg-[#eef0ee]">
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
          {TOOLS.filter((t) => ({ point: canAdd, draw: canDraw, complaint: canMarkComplaints })[t.id] ?? true).map((t, i, tools) => (
            <span key={t.id} className="contents">
              {i > 0 && tools[i - 1].group !== t.group && <Divider />}
              <ToolButton label={t.label} title={`${t.label}: ${t.hint}`} active={tool === t.id} onClick={() => pick(t.id)}>
                <t.icon className="h-[1.15rem] w-[1.15rem]" />
              </ToolButton>
              {/* the whole city sits with the zoom tools */}
              {t.id === 'zoomOut' && (
                <>
                  <ToolButton label="عرض المدينة كاملة" onClick={() => api.current.home?.()}>
                    <ExtentIcon className="h-[1.15rem] w-[1.15rem]" />
                  </ToolButton>
                  <ToolButton label={full ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'} onClick={toggleFull}>
                    {full ? <ShrinkIcon className="h-[1.15rem] w-[1.15rem]" /> : <ExpandIcon className="h-[1.15rem] w-[1.15rem]" />}
                  </ToolButton>
                </>
              )}
            </span>
          ))}
        </div>

        {/* GIS-style status: the scale as a number (beside Leaflet's scale bar) and the pointer's coordinates */}
        <div
          className="pointer-events-none absolute right-2 bottom-8 z-[1000] flex items-stretch divide-x divide-line overflow-hidden rounded-lg bg-white/92 text-[0.7rem] shadow-sm ring-1 ring-line backdrop-blur"
          dir="ltr"
        >
          <span ref={pointerRef} hidden className="num px-2 py-1 text-muted" />
          {scale && (
            <span className="num px-2 py-1 font-semibold text-ink" title="مقياس الرسم">
              {scale}
            </span>
          )}
          {zoom > 0 && (
            <span className="num px-2 py-1 text-muted" title="مستوى التقريب">
              Z{zoom}
            </span>
          )}
        </div>

        {/* map pictures loading */}
        <div className={`map-loading ${tilesLoading ? 'is-on' : ''}`} aria-hidden="true" />

        {/* top-left: «الطبقات» (the base map, every layer, the kinds of landmarks); editors: the unplaced */}
        <div className="pointer-events-none absolute top-[3.9rem] bottom-10 left-3 z-[1000] flex min-h-0 flex-col items-start gap-2 [&>*]:pointer-events-auto">
          <MapLayersPanel
            open={panelOpen}
            onOpen={setPanelOpen}
            bases={BASES}
            base={base}
            onBase={setBase}
            layers={{ ...layers, water: showWater }}
            onLayer={setLayer}
            show={{ spots: canSee, water: shapes.length > 0 || canDraw, pins: canSeeComplaints }}
            counts={{ hoods: neighborhoods.neighborhoods.length, spots: spotCount, places: placeCount, water: shapes.length, pins: complaintPoints.length }}
            water={{ day: day ?? today ?? 0, today, setDay, canDraw }}
            kinds={{ hidden, toggle: toggleGroup }}
            unplaced={canAdd && !moving ? { count: unplaced.length, open: () => setPlacing(true) } : null}
          />
        </div>

        {/* «قياس»: the length so far */}
        {tool === 'measure' && (
          <div className="absolute top-[6.5rem] right-3 z-[1000] flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs shadow-md ring-1 ring-line backdrop-blur">
            <RulerIcon className="h-4 w-4 text-amber-700" />
            <span className="font-semibold whitespace-nowrap text-ink">
              {measured.count >= 2 ? (
                <>
                  المسافة: <span className="num">{distanceText(measured.metres)}</span>
                </>
              ) : (
                'اضغط على نقطتين أو أكثر'
              )}
            </span>
            <button type="button" className="btn btn-secondary px-2.5 py-1 text-xs" disabled={!measured.count} onClick={() => api.current.measure?.undo()}>
              تراجع
            </button>
            <button type="button" className="btn btn-secondary px-2.5 py-1 text-xs" disabled={!measured.count} onClick={() => api.current.measure?.clear()}>
              مسح
            </button>
          </div>
        )}

        {/* «نقل النقطة»: waiting for the new place */}
        {moving && (
          <div className="absolute top-3 left-1/2 z-[1001] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-md ring-1 ring-amber-300">
            <span>
              اضغط على المكان الجديد لـ «{moving.place_name}»
            </span>
            <button type="button" className="btn btn-secondary px-2.5 py-1 text-xs" onClick={() => setMoving(null)}>
              إلغاء
            </button>
          </div>
        )}

        {/* «رسم»: how far the outline is, and its buttons */}
        {tool === 'draw' && (
          <div className="absolute top-[6.5rem] right-3 z-[1000] flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs shadow-md ring-1 ring-line backdrop-blur">
            <span className="font-semibold whitespace-nowrap text-ink">
              {sketchCount ? (
                <>
                  النقاط: <span className="num">{sketchCount}</span>
                </>
              ) : (
                'اضغط على الخريطة لبدء الرسم'
              )}
            </span>
            <button type="button" className="btn btn-secondary px-2.5 py-1 text-xs" disabled={!sketchCount} onClick={() => api.current.sketch?.undo()}>
              تراجع
            </button>
            <button type="button" className="btn btn-secondary px-2.5 py-1 text-xs" disabled={!sketchCount} onClick={() => api.current.sketch?.clear()}>
              إلغاء
            </button>
            <button type="button" className="btn btn-primary px-2.5 py-1 text-xs" disabled={sketchCount < 3} onClick={() => api.current.sketch?.finish()}>
              إنهاء
            </button>
          </div>
        )}

        {/* far out, the dots and icons are hidden: say how to see them */}
        <p
          className={`pointer-events-none absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-ink/80 px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-md backdrop-blur transition-opacity duration-300 ${
            zoom && zoom < SPOTS_ZOOM && tool !== 'draw' ? 'opacity-100' : 'opacity-0'
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

      <Modal
        open={Boolean(shapeForm)}
        size="form"
        title={shapeForm?.shape ? 'تعديل منطقة المياه' : 'منطقة مياه جديدة'}
        onClose={() => setShapeForm(null)}
        container={full ? fullRef.current : undefined}
      >
        {shapeForm && (
          <WaterShapeForm
            key={shapeForm.shape?.id ?? 'new'}
            shape={shapeForm.shape}
            rows={rows}
            onSubmit={saveShape}
            onCancel={() => setShapeForm(null)}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(complaintForm)}
        size="form"
        title={complaintForm?.point ? 'تعديل الشكوى' : 'شكوى على الخريطة'}
        onClose={closeComplaintForm}
        container={full ? fullRef.current : undefined}
      >
        {complaintForm && (
          <RecordForm
            key={complaintForm.point?.id ?? `${complaintForm.lat},${complaintForm.lng}`}
            fields={complaintFields}
            initial={complaintForm.point || null}
            submitLabel={complaintForm.point ? 'حفظ التعديلات' : 'إضافة الشكوى'}
            onSubmit={saveComplaintPoint}
            onCancel={closeComplaintForm}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(removingPoint)}
        message="هل أنت متأكد من حذف هذه الشكوى من الخريطة؟"
        details={removingPoint && `شكوى رقم ${removingPoint.number} — ${removingPoint.category}`}
        busy={removePointBusy}
        onConfirm={confirmRemovePoint}
        onCancel={() => setRemovingPoint(null)}
        container={full ? fullRef.current : undefined}
      />
      <Modal open={placing} title="مواقع بلا مكان على الخريطة" onClose={() => setPlacing(false)} container={full ? fullRef.current : undefined}>
        <p className="mb-3 text-sm text-muted">اختر موقعاً ثم اضغط على مكانه في الخريطة.</p>
        <input
          type="search"
          className="input mb-3"
          placeholder="ابحث بالاسم أو الرقم…"
          aria-label="ابحث في المواقع بلا مكان"
          value={unplacedQuery}
          onChange={(e) => setUnplacedQuery(e.target.value)}
        />
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg ring-1 ring-line">
          {unplacedShown.map((l) => (
            <li key={l.id} className="flex items-center hover:bg-brand-50">
              <button
                type="button"
                className="block min-w-0 flex-1 px-3 py-2 text-start"
                onClick={() => {
                  setPlacing(false)
                  setMoving(l)
                }}
              >
                <span className="block text-sm font-semibold text-ink">{l.place_name}</span>
                <span className="block text-xs text-muted">
                  {[l.neighborhood_name, l.building_number && `مبنى ${l.building_number}`, l.street_number && `شارع ${l.street_number}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
              {(l.building_number || l.street_number) && (
                <button
                  type="button"
                  aria-label={`نسخ رقم المبنى والشارع لـ ${l.place_name}`}
                  title="نسخ رقم المبنى والشارع"
                  onClick={() => copyNumbers(l)}
                  className={`me-2 flex flex-none items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition-colors ${
                    copiedId === l.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-brand-700 ring-line hover:ring-brand-500'
                  }`}
                >
                  {copiedId === l.id ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                  {copiedId === l.id ? 'تم النسخ' : 'نسخ الأرقام'}
                </button>
              )}
            </li>
          ))}
          {!unplacedShown.length && <li className="px-3 py-3 text-sm text-muted">لا توجد نتائج.</li>}
        </ul>
      </Modal>
      <Modal open={Boolean(editing)} size="form" title="تعديل الموقع" onClose={() => setEditing(null)} container={full ? fullRef.current : undefined}>
        {editing && (
          <RecordForm
            key={editing.id}
            fields={editFields}
            initial={editing}
            submitLabel="حفظ التعديلات"
            onSubmit={saveEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        message="هل أنت متأكد من حذف منطقة المياه هذه من الخريطة؟"
        details={removing?.name}
        busy={removeBusy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
        container={full ? fullRef.current : undefined}
      />

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
