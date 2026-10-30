import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { locationsApi } from '../services/api'
import { normalizeArabic } from '../utils/arabic'
import { BuildingIcon, CloseIcon, HomeIcon, MapIcon, PinPlusIcon, SearchIcon } from './Icons'

/*
 * The map's search box: one query, three sources, in one list (in this order) —
 *   «من مواقعنا»   the site's own locations that have coordinates (needs «search.view»),
 *   «الأحياء»      the 20 neighborhoods of the paper map,
 *   «من الخريطة»   every named place, street and landmark of Gaza City on OpenStreetMap — about 4,000,
 *                  kept in src/data/gazaPlaces.json (frontend/scripts/build_gaza_places.py) and searched
 *                  here: any part of a name, Arabic spelling variants folded, instantly.
 */

const MAX_EACH = 6
const MAX_PLACES = 8

/** The places file (≈ 70 KB): downloaded the first time the box is used, then searched in memory. */
function usePlaces(wanted) {
  const [places, setPlaces] = useState(null)
  useEffect(() => {
    if (!wanted || places) return
    let alive = true
    import('../data/gazaPlaces.json').then((m) => {
      if (!alive) return
      // the type is searched too: «مستشفى الشفاء» finds a hospital named «الشفاء»
      setPlaces(m.default.places.map(([name, kind, lat, lng, bounds]) => ({ name, kind, lat, lng, bounds, key: normalizeArabic(`${name} ${kind}`) })))
    })
    return () => {
      alive = false
    }
  }, [wanted, places])
  return places
}

/** The places whose name holds every word of the query: names starting with it first, then the shortest. */
function searchPlaces(places, query) {
  const terms = normalizeArabic(query).split(' ').filter(Boolean)
  if (!places || !terms.length || query.trim().length < 2) return []
  const first = terms[0]
  return places
    .filter((p) => terms.every((t) => p.key.includes(t)))
    .sort((a, b) => Number(b.key.startsWith(first)) - Number(a.key.startsWith(first)) || a.key.length - b.key.length)
    .slice(0, MAX_PLACES)
    .map((p) => ({
      kind: 'place',
      id: `osm-${p.name}-${p.lat}-${p.lng}`,
      title: p.name,
      subtitle: p.kind,
      lat: p.lat,
      lng: p.lng,
      // [south, west, north, east] → the [south, north, west, east] the map expects (as OpenStreetMap gives it)
      bounds: p.bounds ? [p.bounds[0], p.bounds[2], p.bounds[1], p.bounds[3]] : null,
    }))
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g
const toAscii = (text) => text.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10))
// «مبنى 122 شارع 60310», «122/60310», «م 122 ش 60310» → «122 60310»
const NUMBER_WORDS = /(^|\s)(رقم|مبنى|المبنى|مبني|شارع|الشارع|م|ش)(?=\s|$)/g

/** The query as the server's search wants it: with numbers, the words around them and the separators go. */
export function searchText(query) {
  const text = toAscii(query.trim())
  if (!/\d/.test(text)) return text
  return text.replace(/[/\\،,:-]+/g, ' ').replace(NUMBER_WORDS, ' ').replace(/\s+/g, ' ').trim()
}

/** Exact building + street numbers first (a search for «122 60310» puts that building on top). */
function exactness(location, numbers) {
  if (!numbers.length) return 0
  const b = toAscii(location.building_number || '')
  const st = toAscii(location.street_number || '')
  if (numbers.length >= 2 && numbers.includes(b) && numbers.includes(st)) return 2
  return numbers.includes(b) || numbers.includes(st) ? 1 : 0
}

/** The site's own locations matching the query (server search: names, and building / street numbers),
 *  keeping those that have coordinates. */
function useOurLocations(query, enabled) {
  const [results, setResults] = useState([])
  const debounced = useDebouncedValue(searchText(query), 250)
  useEffect(() => {
    if (!enabled || debounced.length < 2) {
      setResults([])
      return undefined
    }
    const controller = new AbortController()
    const numbers = debounced.split(' ').filter((t) => /^\d+[a-zA-Z]?$/.test(t))
    locationsApi
      .list({ search: debounced, page_size: 20 }, controller.signal)
      .then((data) =>
        setResults(
          (data.results || [])
            .filter((l) => l.latitude && l.longitude)
            .map((l, i) => ({ l, i, score: exactness(l, numbers) }))
            .sort((a, b) => b.score - a.score || a.i - b.i)
            .map(({ l }) => l)
            .slice(0, MAX_EACH)
            .map((l) => ({
              kind: 'location',
              id: `loc-${l.id}`,
              title: l.place_name,
              subtitle: [
                l.building_number && `مبنى ${l.building_number}`,
                l.street_number && `شارع ${l.street_number}`,
                l.neighborhood_name,
              ]
                .filter(Boolean)
                .join(' · '),
              lat: Number(l.latitude),
              lng: Number(l.longitude),
              details: l,
            })),
        ),
      )
      .catch(() => {})
    return () => controller.abort()
  }, [debounced, enabled])
  return debounced === searchText(query) ? results : []
}

/**
 * «8 1786» (a building number then a street number) that none of our locations has: where that building is,
 * asked from the server ({ status: 'idle' | 'loading' | 'found' | 'missing' | 'error', result, message }).
 */
function useBuilding(query, enabled, ours) {
  const [state, setState] = useState({ status: 'idle' })
  const debounced = useDebouncedValue(searchText(query), 350)
  const parts = debounced.split(' ')
  const pair = parts.length === 2 && parts.every((t) => /^\d+[a-zA-Z]?$/.test(t)) ? parts : null
  // one of ours already has exactly these numbers: it is the answer
  const known = pair && ours.some((r) => exactness(r.details, pair) === 2)
  const wanted = enabled && pair && !known ? pair.join(' ') : ''
  useEffect(() => {
    if (!wanted) {
      setState({ status: 'idle' })
      return undefined
    }
    const [building, street] = wanted.split(' ')
    const controller = new AbortController()
    setState({ status: 'loading' })
    locationsApi
      .findBuilding({ building, street }, controller.signal)
      .then((data) => {
        if (!data.found) {
          setState({ status: 'missing', building, street })
          return
        }
        setState({
          status: 'found',
          result: {
            kind: 'building',
            id: `building-${building}-${street}`,
            title: data.location?.place_name || `مبنى ${building} · شارع ${street}`,
            subtitle: data.location ? `مبنى ${building} · شارع ${street}` : 'اضغط للذهاب إلى المبنى',
            lat: data.latitude,
            lng: data.longitude,
            details: { building_number: data.building_number, street_number: data.street_number, ...(data.location || {}) },
          },
        })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: err?.response?.data?.detail || 'تعذر البحث عن المبنى الآن.' })
      })
    return () => controller.abort()
  }, [wanted])
  return wanted && debounced === searchText(query) ? state : { status: 'idle' }
}

const ICONS = { location: PinPlusIcon, neighborhood: HomeIcon, place: MapIcon, building: BuildingIcon }

function KindIcon({ kind }) {
  const Icon = ICONS[kind]
  return (
    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-50 text-brand-700">
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

export default function MapSearch({ neighborhoods, onPick }) {
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef(null)

  const ours = useOurLocations(query, can('search.view'))
  const building = useBuilding(query, can('search.view'), ours)
  const placesData = usePlaces(open || query.length > 0)
  const places = useMemo(() => searchPlaces(placesData, query), [placesData, query])
  const loading = query.trim().length >= 2 && !placesData
  const hoods = useMemo(() => {
    const terms = normalizeArabic(query).split(' ').filter(Boolean)
    if (!terms.length) return []
    return neighborhoods
      .filter((n) => terms.every((t) => normalizeArabic(n.name).includes(t)))
      .slice(0, MAX_EACH)
      .map((n) => ({ kind: 'neighborhood', id: `hood-${n.name}`, title: n.name, subtitle: 'حي في مدينة غزة' }))
  }, [query, neighborhoods])

  const flat = [...(building.status === 'found' ? [building.result] : []), ...ours, ...hoods, ...places]
  const showList = open && query.trim().length >= 2

  // a click outside closes the list
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (r) => {
    onPick(r)
    setOpen(false)
    setQuery(r.title)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (flat.length ? (i + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault()
      pick(flat[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrap} className="relative w-full sm:max-w-md">
      <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls="map-search-list"
        aria-label="ابحث على الخريطة"
        className="input py-2 ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden"
        placeholder="ابحث عن مكان، معلم، حي، أو رقم المبنى والشارع…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {query && (
        <button
          type="button"
          className="icon-btn absolute end-1 top-1/2 h-7 w-7 -translate-y-1/2"
          aria-label="مسح البحث"
          onClick={() => {
            setQuery('')
            setOpen(false)
          }}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}

      {showList && (
        <div
          id="map-search-list"
          role="listbox"
          aria-label="نتائج البحث"
          className="absolute inset-x-0 top-full z-[1100] mt-1.5 max-h-[22rem] overflow-y-auto rounded-xl bg-white py-1.5 shadow-lg ring-1 ring-line"
        >
          {/* one list: the site's locations first, then the neighborhoods, then the city's places */}
          {flat.map((r, index) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(r)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-start ${index === active ? 'bg-brand-50' : 'hover:bg-canvas'}`}
            >
              <KindIcon kind={r.kind} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{r.title}</span>
                {r.subtitle && <span className="block truncate text-xs text-muted">{r.subtitle}</span>}
              </span>
            </button>
          ))}
          {building.status === 'loading' && <p className="px-3 py-2 text-xs text-muted">جارٍ البحث عن المبنى…</p>}
          {building.status === 'missing' && (
            <p className="px-3 py-2 text-xs text-muted">
              لا يوجد مبنى رقم <span className="num">{building.building}</span> في شارع <span className="num">{building.street}</span>.
            </p>
          )}
          {building.status === 'error' && <p className="px-3 py-2 text-xs text-danger-600">{building.message}</p>}
          {loading && <p className="px-3 py-2 text-xs text-muted">جارٍ تحميل أماكن المدينة…</p>}
          {!flat.length && !loading && building.status === 'idle' && <p className="px-3 py-3 text-sm text-muted">لا توجد نتائج داخل مدينة غزة.</p>}
        </div>
      )}
    </div>
  )
}
