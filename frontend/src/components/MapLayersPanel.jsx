import { CloseIcon, LayersIcon, PinPlusIcon } from './Icons'
import { LEGEND, MAIN_GROUPS } from './placeIcons'
import { DAYS } from './WaterRowForm'

/*
 * «الطبقات»: the map's one control panel (as in GIS programs) — the base map, every layer with its
 * on/off switch and count, and what each layer needs (the water day, the complaints period, the kinds
 * of landmarks). Pure display: WaterMap holds the state.
 */

/** A small picture of each base map. */
const PREVIEWS = {
  map: 'linear-gradient(135deg,#f2efe9 0 40%,#fbd38d 40% 46%,#f2efe9 46% 70%,#c6e2b5 70%)',
  light: 'linear-gradient(135deg,#f4f4f2 0 40%,#e2e2df 40% 46%,#f4f4f2 46% 70%,#e7ece4 70%)',
  satellite: 'linear-gradient(135deg,#5b6b4a 0 35%,#8c8a72 35% 55%,#4a5a3c 55% 80%,#a39d84 80%)',
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'start-[1.15rem]' : 'start-0.5'}`}
      />
    </button>
  )
}

function LayerRow({ swatch, label, count, hint, checked, onChange, children }) {
  return (
    <li className="py-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 flex-none items-center justify-center">{swatch}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8rem] font-semibold text-ink">{label}</span>
          {hint && <span className="block text-[0.68rem] text-muted">{hint}</span>}
        </span>
        {count != null && <span className="num rounded-full bg-canvas px-1.5 text-[0.68rem] font-semibold text-muted">{count}</span>}
        <Switch checked={checked} onChange={onChange} label={label} />
      </div>
      {checked && children && <div className="mt-2 ms-8.5">{children}</div>}
    </li>
  )
}

const selectClass = 'w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs font-semibold text-ink'

export default function MapLayersPanel({
  open,
  onOpen,
  bases,
  base,
  onBase,
  layers,
  onLayer,
  show,
  counts,
  water,
  kinds,
  unplaced,
}) {
  const toPlace = unplaced?.count || 0
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpen(true)}
        aria-label="الطبقات"
        aria-expanded="false"
        className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-ink shadow-md ring-1 ring-line backdrop-blur hover:bg-white"
      >
        <LayersIcon className="h-4 w-4 text-brand-700" />
        الطبقات
        {toPlace > 0 && (
          <span className="num rounded-full bg-amber-100 px-1.5 text-[0.65rem] text-amber-800" title="مواقع بلا مكان على الخريطة">
            {toPlace}
          </span>
        )}
      </button>
    )
  }
  return (
    <section
      aria-label="الطبقات"
      className="map-panel flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-hidden rounded-2xl bg-white/97 shadow-xl ring-1 ring-black/5 backdrop-blur"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <LayersIcon className="h-4 w-4 text-brand-700" />
          الطبقات
        </h2>
        <button type="button" className="icon-btn h-7 w-7" aria-label="إغلاق الطبقات" onClick={() => onOpen(false)}>
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      <div className="overflow-y-auto overscroll-contain px-3.5 pb-3">
        {/* editors: our locations still without a place */}
        {toPlace > 0 && (
          <button
            type="button"
            onClick={unplaced.open}
            className="mt-3 flex w-full items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-start text-xs font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            <PinPlusIcon className="h-4 w-4 flex-none" />
            <span className="flex-1">
              <span className="num">{toPlace}</span> موقع بلا مكان على الخريطة
              <span className="block text-[0.68rem] font-normal text-amber-800">اضغط لتحديد أماكنها</span>
            </span>
          </button>
        )}
        {/* the base map */}
        <p className="mt-3 mb-2 text-[0.68rem] font-bold tracking-wide text-muted">الخريطة الأساسية</p>
        <div role="radiogroup" aria-label="نوع الخريطة" className="grid grid-cols-3 gap-2">
          {Object.entries(bases).map(([key, b]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={base === key}
              onClick={() => onBase(key)}
              className={`group overflow-hidden rounded-xl text-[0.7rem] font-semibold ring-2 transition ${
                base === key ? 'text-brand-700 ring-brand-600' : 'text-ink ring-transparent hover:ring-brand-100'
              }`}
            >
              <span className="block h-11 w-full" style={{ background: PREVIEWS[key] }} />
              <span className="block bg-canvas py-1">{b.label}</span>
            </button>
          ))}
        </div>

        {/* the layers */}
        <p className="mt-4 mb-1 text-[0.68rem] font-bold tracking-wide text-muted">الطبقات</p>
        <ul className="divide-y divide-line">
          <LayerRow
            swatch={<span className="h-3.5 w-5 rounded-sm border-2 border-brand-600/70 bg-brand-500/10" />}
            label="حدود الأحياء"
            count={counts.hoods}
            checked={layers.hoods}
            onChange={(on) => onLayer('hoods', on)}
          />
          {show.spots && (
            <LayerRow
              swatch={<span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-brand-600 shadow ring-1 ring-brand-600/30" />}
              label="مواقعنا"
              hint="من «البحث عن مواقع» · تظهر عند التقريب"
              count={counts.spots}
              checked={layers.spots}
              onChange={(on) => onLayer('spots', on)}
            />
          )}
          <LayerRow
            swatch={
              <span className="grid grid-cols-2 gap-0.5">
                {LEGEND.slice(0, 4).map((g) => (
                  <span key={g.group} className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                ))}
              </span>
            }
            label="المعالم"
            hint="مساجد، مدارس، مستشفيات… · عند التقريب"
            count={counts.places}
            checked={layers.places}
            onChange={(on) => onLayer('places', on)}
          >
            <ul className="grid grid-cols-1 gap-0.5">
              {LEGEND.map((g) => {
                const on = !kinds.hidden.has(g.group)
                return (
                  <li key={g.group}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => kinds.toggle(g.group)}
                      className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-start text-[0.72rem] transition hover:bg-canvas ${
                        on ? 'text-ink' : 'text-muted line-through opacity-50'
                      }`}
                    >
                      <span
                        className="flex h-4.5 w-4.5 flex-none items-center justify-center rounded-full border-[1.5px] border-white shadow [&_svg]:h-2.5 [&_svg]:w-2.5"
                        style={{ background: g.color }}
                        // a fixed drawing from placeIcons.js, never text from the data
                        dangerouslySetInnerHTML={{ __html: g.glyph }}
                      />
                      {g.label}
                      {!MAIN_GROUPS.has(g.group) && on && <span className="ms-auto text-[0.6rem] text-muted">عند التقريب أكثر</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </LayerRow>
          {show.water && (
            <LayerRow
              swatch={<span className="h-3.5 w-5 rounded-sm border-2 border-sky-700 bg-sky-500/40" />}
              label="مناطق المياه"
              hint="من «جدول المياه»"
              count={counts.water}
              checked={layers.water}
              onChange={(on) => onLayer('water', on)}
            >
              <select aria-label="يوم المياه" className={selectClass} value={water.day} onChange={(e) => water.setDay(Number(e.target.value))}>
                {DAYS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                    {i === water.today ? ' (اليوم)' : ''}
                  </option>
                ))}
              </select>
              <ul className="mt-2 space-y-1 text-[0.7rem] text-muted">
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-4 rounded-sm border-2 border-sky-700 bg-sky-500/40" /> تصلها المياه
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-4 rounded-sm border-2 border-dashed border-sky-500 bg-sky-300/30" /> في اليوم التالي
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-4 rounded-sm border-2 border-slate-500 bg-slate-400/20" /> لا تصلها
                </li>
              </ul>
              {!counts.water && water.canDraw && <p className="mt-1.5 text-[0.68rem] text-muted">ارسمها بأداة «رسم» من شريط الأدوات.</p>}
            </LayerRow>
          )}
          {show.pins && (
            <LayerRow
              swatch={
                <svg viewBox="0 0 24 32" width="14" height="18" aria-hidden="true">
                  <path d="M12 31s10-9.3 10-18A10 10 0 0 0 2 13c0 8.7 10 18 10 18z" fill="#ea580c" stroke="#fff" strokeWidth="2" />
                </svg>
              }
              label="نقاط الشكاوى"
              hint="المضافة بأداة «شكوى على الخريطة»"
              count={counts.pins}
              checked={layers.pins}
              onChange={(on) => onLayer('pins', on)}
            />
          )}
        </ul>
      </div>
    </section>
  )
}
