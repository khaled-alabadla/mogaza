import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import {
  AlertIcon,
  ArrowLeftIcon,
  BulbIcon,
  ChartIcon,
  CheckIcon,
  DropIcon,
  InboxIcon,
  MegaphoneIcon,
  PinIcon,
  QuestionIcon,
  ShieldIcon,
} from '../components/Icons'
import Segmented from '../components/Segmented'
import BrandBand from '../components/BrandBand'
import { useAuth } from '../context/AuthContext'
import { useContentValue } from '../context/ContentContext'
import { homeApi } from '../services/api'
import { displayName } from '../utils/format'
import { guideTips } from './guideTips'
import { GUIDE_DEFAULT } from './guideSections'
import useLiveRefresh from '../hooks/useLiveRefresh'

const SOURCES = [
  { value: 'mekorot', label: 'خط ماكروت', dot: 'bg-sky-500' },
  { value: 'wells', label: 'الآبار المحلية', dot: 'bg-gold-400' },
]
const SOURCE_DOTS = Object.fromEntries(SOURCES.map((s) => [s.value, s.dot]))
const AREAS_SHOWN = 24 // on large screens
const AREAS_SHOWN_PHONE = 10 // on phones, so the circulars below stay close
const TIPS_SHOWN = 6 // two even rows of three on a wide screen
const REPORT_DATE = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
// the waiting tiles always fill their row (no empty slot beside two tiles)
const TILE_COLUMNS = { 1: 'grid-cols-1 sm:grid-cols-2', 2: 'grid-cols-2', 3: 'grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }
const byArabicName = (a, b) => a.name.localeCompare(b.name, 'ar')

// «الثلاثاء، 27 أكتوبر» and «5 جمادى الأولى 1448 هـ» (Western digits, like the rest of the site)
const GREGORIAN = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
const HIJRI = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })

function hijriDate(date) {
  try {
    return HIJRI.format(date)
  } catch {
    return '' // a browser without the Islamic calendar: the Gregorian date alone
  }
}

/** «شيء واحد يحتاج…» / «شيئان يحتاجان…» / «3 أشياء تحتاج…» / «12 شيئاً يحتاج…» */
function waitingSentence(n) {
  if (n === 1) return 'شيء واحد يحتاج انتباهك اليوم.'
  if (n === 2) return 'شيئان يحتاجان انتباهك اليوم.'
  if (n <= 10) return `${n} أشياء تحتاج انتباهك اليوم.`
  return `${n} شيئاً يحتاج انتباهك اليوم.`
}

/**
 * Counts from 0 up to `value` in about half a second when it first shows (and from the old figure to
 * the new one after a refresh). Without animation (reduced motion, hidden tab) it is just `value`;
 * a timer makes sure the final figure always lands even if animation frames are paused.
 */
function useCountUp(value, duration = 600) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    const start = from.current
    from.current = value
    const still =
      typeof value !== 'number' ||
      document.visibilityState === 'hidden' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still || start === value) {
      setShown(value)
      return undefined
    }
    let frame = 0
    const began = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - began) / duration)
      setShown(Math.round(start + (value - start) * (1 - (1 - t) ** 3))) // ease-out
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    const done = setTimeout(() => setShown(value), duration + 100)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(done)
    }
  }, [value, duration])

  return shown
}

function greeting() {
  return new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير'
}

/** «اليوم» / «أمس» / «منذ 3 أيام» for a date (YYYY-MM-DD or ISO). */
function daysAgo(value) {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(value).setHours(0, 0, 0, 0)) / 86400000)
  if (days <= 0) return 'اليوم'
  if (days === 1) return 'أمس'
  if (days === 2) return 'منذ يومين'
  return days <= 10 ? `منذ ${days} أيام` : `منذ ${days} يوماً`
}

/** «الآن» / «قبل دقيقة» / «قبل 5 دقائق»: how fresh the figures are. */
function updatedAgo(time, now) {
  const minutes = Math.floor((now - time) / 60000)
  if (minutes < 1) return 'الآن'
  if (minutes === 1) return 'قبل دقيقة'
  if (minutes === 2) return 'قبل دقيقتين'
  return minutes <= 10 ? `قبل ${minutes} دقائق` : `قبل ${minutes} دقيقة`
}

/**
 * The home figures: loaded on opening, then kept fresh by useLiveRefresh (every 30 seconds while
 * the page is shown, and when it comes back into view). A failed refresh keeps the figures already shown.
 */
function useHomeData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [loadedAt, setLoadedAt] = useState(null)
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      setData(await homeApi.get())
      setLoadedAt(Date.now())
      setError(false)
    } catch {
      setError(true)
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])
  useLiveRefresh(load)

  return { data, error, loadedAt, reload: load }
}

/** Re-renders every half minute (for «آخر تحديث قبل …»). */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** A figure that counts up when it appears; screen readers get the final figure only. */
function CountUp({ value }) {
  const shown = useCountUp(value)
  return (
    <>
      <span className="num" aria-hidden="true">
        {shown}
      </span>
      <span className="sr-only">{value}</span>
    </>
  )
}

/**
 * One status box (they all look alike, whatever their state): an icon, a label, then either the figure
 * waiting (a coloured stripe on top: red for the urgent complaints, gold for the rest) or a green ✓
 * when nothing waits. Links to its page.
 */
function StatusTile({ to, icon: Icon, label, value, text, hint, tone, calm, calmText }) {
  const tones = {
    danger: { tile: 'bg-danger-50 text-danger-700', stripe: 'bg-danger-600', text: 'text-danger-700' },
    gold: { tile: 'bg-gold-100 text-gold-700', stripe: 'bg-gold-400', text: 'text-gold-700' },
  }
  const look = tones[tone]
  return (
    <Link to={to} className="card card-lift group relative flex flex-col gap-3 overflow-hidden p-4 sm:p-5">
      {!calm && <span className={`absolute inset-x-0 top-0 h-1 ${look.stripe}`} aria-hidden="true" />}
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${calm ? 'bg-brand-50 text-brand-700' : look.tile}`}>
          {calm ? <CheckIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <ArrowLeftIcon className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:-translate-x-1 group-hover:text-brand-600" />
      </div>
      <div className="flex flex-1 flex-col">
        <p className="text-xs font-semibold text-muted sm:text-sm">{label}</p>
        {calm ? (
          <p className="mt-1 text-base font-bold text-brand-700 sm:text-lg">{calmText}</p>
        ) : text ? (
          <p className={`mt-1 text-base font-bold sm:text-lg ${look.text}`}>{text}</p>
        ) : (
          <p className="mt-0.5 text-2xl font-bold text-ink sm:text-3xl">
            <CountUp value={value} />
          </p>
        )}
        {hint && <p className="mt-auto pt-1.5 text-xs text-muted">{hint}</p>}
      </div>
    </Link>
  )
}

/** The status boxes, all the same size in one row: what waits first, then what is done. */
function Attention({ items }) {
  const ordered = [...items.filter((i) => !i.calm), ...items.filter((i) => i.calm)]
  return (
    <section aria-label="يحتاج انتباهك" className={`stagger grid auto-rows-fr gap-3 ${TILE_COLUMNS[Math.min(ordered.length, 4)]}`}>
      {ordered.map((t) => (
        <StatusTile key={t.to} {...t} />
      ))}
    </section>
  )
}

/** A titled card section of the home page, with a «عرض الكل» link. */
function Panel({ icon: Icon, title, badge, tools, to, linkLabel = 'عرض الكل', children, className = '' }) {
  return (
    <section className={`card flex flex-col overflow-hidden ${className}`} aria-label={title}>
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <Icon className="h-5 w-5 text-brand-600" />
        <h2 className="font-bold text-ink">{title}</h2>
        {badge}
        {tools}
        {to && (
          <Link to={to} className="ms-auto inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            {linkLabel}
            <ArrowLeftIcon className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      <div className="flex-1 p-4 sm:p-5">{children}</div>
    </section>
  )
}

function WaterPanel({ water, className }) {
  const [when, setWhen] = useState('today')
  const [expanded, setExpanded] = useState(false)
  const tomorrow = water.tomorrow
  const day = when === 'tomorrow' && tomorrow ? { display: tomorrow.display, areas: tomorrow.areas } : { display: water.today_display, areas: water.areas }
  const sorted = [...day.areas].sort(byArabicName)
  const shown = sorted.slice(0, AREAS_SHOWN)
  const more = sorted.length - shown.length
  const hiddenOnPhone = !expanded && shown.length > AREAS_SHOWN_PHONE
  const usedSources = SOURCES.filter((s) => sorted.some((a) => a.source === s.value))

  return (
    <Panel
      icon={DropIcon}
      title={when === 'tomorrow' ? 'تصل المياه غداً' : 'تصل المياه اليوم'}
      badge={<span className="badge bg-brand-50 text-brand-700">{day.display}</span>}
      to="/water"
      linkLabel="الجدول كاملاً"
      className={className}
      tools={
        tomorrow && (
          <Segmented
            className="ms-1 [&_button]:px-3 [&_button]:py-1 [&_button]:text-xs"
            label="يوم المياه"
            value={when}
            onChange={(value) => {
              setWhen(value)
              setExpanded(false)
            }}
            options={[
              { value: 'today', label: 'اليوم' },
              { value: 'tomorrow', label: 'غداً' },
            ]}
          />
        )
      }
    >
      {shown.length ? (
        <>
          <ul className="columns-2 gap-x-6 text-[0.95rem] leading-8 text-ink sm:columns-3">
            {shown.map((a, i) => (
              <li
                key={a.name}
                className={`items-baseline gap-2 break-inside-avoid ${hiddenOnPhone && i >= AREAS_SHOWN_PHONE ? 'hidden sm:flex' : 'flex'}`}
              >
                <span className={`mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full ${SOURCE_DOTS[a.source] || 'bg-gray-300'}`} aria-hidden="true" />
                {a.name}
              </li>
            ))}
          </ul>
          {hiddenOnPhone && (
            <button type="button" onClick={() => setExpanded(true)} className="mt-2 text-sm font-medium text-brand-700 hover:underline sm:hidden">
              عرض كل المناطق (<span className="num">{sorted.length}</span>)
            </button>
          )}
          {more > 0 && (
            <Link to="/water" className={`mt-3 text-sm font-medium text-brand-700 hover:underline ${hiddenOnPhone ? 'hidden sm:inline-block' : 'inline-block'}`}>
              و<span className="num">{more}</span> مناطق أخرى في الجدول…
            </Link>
          )}
          {usedSources.length > 0 && (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
              {usedSources.map((s) => (
                <span key={s.value} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
                  {s.label}
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">{when === 'tomorrow' ? 'لا توجد مواعيد مياه غداً.' : 'لا توجد مواعيد مياه اليوم.'}</p>
      )}
    </Panel>
  )
}

function CircularsPanel({ circulars, className }) {
  return (
    <Panel icon={MegaphoneIcon} title="آخر التعميمات" to="/circulars" className={className}>
      {circulars.length ? (
        <ul className="-my-2 divide-y divide-line">
          {circulars.map((c) => (
            <li key={c.id} className="py-2.5">
              {/* opens the circulars page on this circular */}
              <Link to={`/circulars?open=${c.id}`} className="group flex items-start gap-2.5">
                {c.pinned ? (
                  <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" />
                ) : (
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug text-ink group-hover:text-brand-700">{c.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{daysAgo(c.updated_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">لا توجد تعميمات بعد.</p>
      )}
    </Panel>
  )
}

/**
 * The welcome band in the municipality's colours: the date (Gregorian and Hijri), the greeting, and one
 * sentence saying how the day looks.
 */
function WelcomeBand({ name, summary, loadedAt, now, error }) {
  const today = new Date(now)
  const hijri = hijriDate(today)
  return (
    <BrandBand label="ترحيب" className="px-5 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7">
      <div>
        <p className="text-sm text-white/70">
          {GREGORIAN.format(today)}
          {hijri && (
            <>
              <span className="mx-2 text-gold-400" aria-hidden="true">
                ◆
              </span>
              {hijri}
            </>
          )}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting()}
          {name && `، ${name}`}
        </h1>
        <p className="mt-2 text-base text-white/90">{summary}</p>
        {loadedAt && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/60" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-danger-600' : 'bg-gold-400'}`} aria-hidden="true" />
            آخر تحديث {updatedAgo(loadedAt, now)}
            {error && <span className="text-white/80">(تعذر التحديث، سنحاول مجدداً)</span>}
          </p>
        )}
      </div>
    </BrandBand>
  )
}

/**
 * «نصائح للتعامل مع المواطن»: the guide's golden rules, always the same; the whole card opens the
 * guide on «التعامل مع المواطن».
 */
function CitizenTips({ tips }) {
  return (
    <Link
      to="/guide?tab=citizens"
      aria-label="نصائح للتعامل مع المواطن، افتح «التعامل مع المواطن» في دليل القسم"
      className="card card-lift group relative block overflow-hidden border-gold-400/50 p-4 sm:p-5"
    >
      <span className="absolute inset-y-0 start-0 w-1 bg-gold-400" aria-hidden="true" />
      <h2 className="flex items-center gap-2 font-bold text-ink">
        <BulbIcon className="h-5 w-5 text-gold-700" />
        نصائح للتعامل مع المواطن
      </h2>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {tips.slice(0, TIPS_SHOWN).map((tip) => (
          <li key={tip} className="flex items-start gap-2 text-sm leading-6 text-ink">
            <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-brand-600" />
            {tip}
          </li>
        ))}
      </ul>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 group-hover:underline">
        المزيد في دليل القسم
        <ArrowLeftIcon className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
      </span>
    </Link>
  )
}

/** While the figures load: the shape of the page itself (tiles, then the two panels). */
function HomeSkeleton() {
  const bar = (className) => <span className={`skeleton block rounded-md ${className}`} />
  return (
    <div role="status" aria-live="polite" className="space-y-7">
      <span className="sr-only">جارٍ تحميل ملخص اليوم…</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-3 p-4 sm:p-5">
            {bar('h-10 w-10 rounded-xl')}
            {bar('h-3 w-24')}
            {bar('h-6 w-12')}
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3" aria-hidden="true">
        <div className="card space-y-3 p-5 lg:col-span-2">
          {bar('h-4 w-40')}
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-3 gap-6">
              {bar('h-3')}
              {bar('h-3')}
              {bar('h-3')}
            </div>
          ))}
        </div>
        <div className="card space-y-3 p-5">
          {bar('h-4 w-28')}
          {bar('h-3 w-full')}
          {bar('h-3 w-2/3')}
        </div>
      </div>
    </div>
  )
}

/** The figures as tile descriptions: { to, icon, label, value | text, hint, tone, calm, calmText }. */
function attentionItems(data) {
  const items = []
  if (data.urgent) {
    const { open, oldest_days: oldest } = data.urgent
    items.push({
      to: '/urgent',
      icon: AlertIcon,
      label: 'شكاوى عاجلة لم تُحل',
      value: open,
      tone: 'danger',
      calm: open === 0,
      calmText: 'لا يوجد',
      hint: open > 0 && oldest !== null ? `الأقدم مقدمة منذ ${oldest} يوم` : null,
    })
  }
  if (data.complaints) {
    const n = data.complaints.pending
    items.push({ to: '/complaints', icon: InboxIcon, label: 'شكاوى بانتظار الرفع', value: n, tone: 'gold', calm: n === 0, calmText: 'كلها مرفوعة' })
  }
  if (data.inquiries) {
    const n = data.inquiries.pending
    items.push({ to: '/inquiries', icon: QuestionIcon, label: 'استفسارات بانتظار الرفع', value: n, tone: 'gold', calm: n === 0, calmText: 'كلها مرفوعة' })
  }
  if ('report' in data) {
    const r = data.report
    items.push({
      to: '/daily-report',
      icon: ChartIcon,
      label: 'التقرير اليومي',
      tone: 'gold',
      calm: Boolean(r?.updated_today),
      calmText: 'محدَّث اليوم',
      text: 'لم يُحدَّث اليوم',
      hint: r ? `آخر تقرير: ${REPORT_DATE.format(new Date(`${r.report_date}T12:00:00`))}` : 'لم يُعبّأ أي تقرير بعد',
    })
  }
  return items
}

/** «الرئيسية»: what needs attention today, each part only for those allowed to see it. */
export default function HomePage() {
  const { user, can } = useAuth()
  const { data, error, loadedAt, reload } = useHomeData()
  const now = useNow()
  const editedGuide = useContentValue('guide.sections')
  const name = user ? user.first_name || displayName(user) : ''
  const items = data ? attentionItems(data) : []
  const waiting = items.filter((i) => !i.calm).length
  const nothing = data && !items.length && !data.water && !data.circulars
  // the tips follow the guide as edited from the dashboard (falling back to the default guide)
  const editedTips = guideTips(editedGuide)
  const tips = can('guide.view') ? (editedTips.length ? editedTips : guideTips(GUIDE_DEFAULT)) : []
  const tip = tips.length > 0

  let summary = 'جارٍ تجهيز ملخص اليوم…'
  if (data && items.length) summary = waiting ? waitingSentence(waiting) : 'كل شيء على ما يرام اليوم، لا يوجد ما هو معلّق.'
  else if (data && (data.water || data.circulars)) summary = 'إليك مواعيد المياه وآخر التعميمات لهذا اليوم.'
  else if (data || error) summary = 'أهلاً بك في قسم المعلومات والشكاوي.'

  return (
    <div className="space-y-7">
      <WelcomeBand name={name} summary={summary} loadedAt={loadedAt} now={now} error={error && Boolean(data)} />

      {!data && error ? (
        <EmptyState
          title="تعذر تحميل ملخص اليوم"
          hint="تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى."
          action={
            <button type="button" className="btn btn-secondary" onClick={reload}>
              إعادة المحاولة
            </button>
          }
        />
      ) : !data ? (
        <HomeSkeleton />
      ) : nothing && !tip ? (
        <EmptyState
          icon={ShieldIcon}
          title="لا يوجد ما يُعرض هنا لحسابك"
          hint="استخدم القائمة الجانبية للوصول إلى الصفحات المتاحة لك، أو تواصل مع مسؤول النظام إن كنت تحتاج صلاحيات أخرى."
        />
      ) : (
        <>
          {items.length > 0 && <Attention items={items} />}

          {/* water and circulars side by side, the same height; the citizen tips across the page below */}
          {(data.water || data.circulars) && (
            <div className="grid gap-4 lg:grid-cols-3">
              {data.water && <WaterPanel water={data.water} className={data.circulars ? 'lg:col-span-2' : 'lg:col-span-3'} />}
              {data.circulars && <CircularsPanel circulars={data.circulars} className={data.water ? '' : 'lg:col-span-3'} />}
            </div>
          )}
          {tip && <CitizenTips tips={tips} />}
        </>
      )}
    </div>
  )
}
