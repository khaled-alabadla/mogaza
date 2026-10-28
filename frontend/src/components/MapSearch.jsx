import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { locationsApi } from '../services/api'
import { normalizeArabic } from '../utils/arabic'
import { CloseIcon, HomeIcon, MapIcon, PinPlusIcon, SearchIcon } from './Icons'

/*
 * The map's search box: one query, three sources, grouped in the list —
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

/** The site's own locations matching the query (server search), keeping those that have coordinates. */
function useOurLocations(query, enabled) {
  const [results, setResults] = useState([])
  const debounced = useDebouncedValue(query.trim(), 250)
  useEffect(() => {
    if (!enabled || debounced.length < 2) {
      setResults([])
      return undefined
    }
    const controller = new AbortController()
    locationsApi
      .list({ search: debounced, page_size: 20 }, controller.signal)
      .then((data) =>
        setResults(
          (data.results || [])
            .filter((l) => l.latitude && l.longitude)
            .slice(0, MAX_EACH)
            .map((l) => ({
              kind: 'location',
              id: `loc-${l.id}`,
              title: l.place_name,
              subtitle: [l.neighborhood_name, l.description].filter(Boolean).join(' · '),
              lat: Number(l.latitude),
              lng: Number(l.longitude),
              details: l,
            })),
        ),
      )
      .catch(() => {})
    return () => controller.abort()
  }, [debounced, enabled])
  return debounced === query.trim() ? results : []
}

const GROUPS = [
  { kind: 'location', title: 'من مواقعنا', icon: PinPlusIcon },
  { kind: 'neighborhood', title: 'الأحياء', icon: HomeIcon },
  { kind: 'place', title: 'من الخريطة', icon: MapIcon },
]

export default function MapSearch({ neighborhoods, onPick }) {
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef(null)

  const ours = useOurLocations(query, can('search.view'))
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

  const flat = [...ours, ...hoods, ...places]
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
        placeholder="ابحث عن مكان، شارع، معلم أو حي…"
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
          {GROUPS.map((g) => {
            const rows = flat.filter((r) => r.kind === g.kind)
            const waiting = g.kind === 'place' && loading
            if (!rows.length && !waiting) return null
            return (
              <div key={g.kind} role="group" aria-label={g.title}>
                <p className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[0.7rem] font-bold text-muted">
                  <g.icon className="h-3.5 w-3.5" /> {g.title}
                </p>
                {rows.map((r) => {
                  const index = flat.indexOf(r)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(r)}
                      className={`block w-full px-3 py-2 text-start ${index === active ? 'bg-brand-50' : 'hover:bg-canvas'}`}
                    >
                      <span className="block text-sm font-semibold text-ink">{r.title}</span>
                      {r.subtitle && <span className="block truncate text-xs text-muted">{r.subtitle}</span>}
                    </button>
                  )
                })}
                {waiting && !rows.length && <p className="px-3 py-2 text-xs text-muted">جارٍ تحميل أماكن المدينة…</p>}
              </div>
            )
          })}
          {!flat.length && !loading && <p className="px-3 py-3 text-sm text-muted">لا توجد نتائج داخل مدينة غزة.</p>}
        </div>
      )}
    </div>
  )
}
