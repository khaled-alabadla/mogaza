import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import {
  AlertIcon,
  ArrowLeftIcon,
  ChartIcon,
  CheckIcon,
  DropIcon,
  InboxIcon,
  MegaphoneIcon,
  PinIcon,
  QuestionIcon,
  ShieldIcon,
} from '../components/Icons'
import LoadingState from '../components/LoadingState'
import Segmented from '../components/Segmented'
import { useAuth } from '../context/AuthContext'
import { homeApi } from '../services/api'
import { displayName } from '../utils/format'

const SOURCES = [
  { value: 'mekorot', label: 'خط ماكروت', dot: 'bg-sky-500' },
  { value: 'wells', label: 'الآبار المحلية', dot: 'bg-gold-400' },
]
const SOURCE_DOTS = Object.fromEntries(SOURCES.map((s) => [s.value, s.dot]))
const AREAS_SHOWN = 24 // on large screens
const AREAS_SHOWN_PHONE = 10 // on phones, so the circulars below stay close
const REFRESH_EVERY = 3 * 60 * 1000 // the page is often left open all day
const REPORT_DATE = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
// the waiting tiles always fill their row (no empty slot beside two tiles)
const TILE_COLUMNS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }
const byArabicName = (a, b) => a.name.localeCompare(b.name, 'ar')

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
 * The home figures: loaded on opening, then again every few minutes and whenever the page comes back
 * into view (another tab, a minimised window). A failed refresh keeps the figures already shown.
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
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_EVERY)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

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

/**
 * One «needs attention» tile: an icon, a label, the figure (or a short text), a hint; links to its page.
 * `wide` (one or two tiles in the row): laid out on one line, the figure at the far end.
 */
function AttentionTile({ to, icon: Icon, label, value, text, hint, tone, wide }) {
  const tones = { danger: 'bg-danger-50 text-danger-700', gold: 'bg-gold-100 text-gold-700' }
  const figure = text ? (
    <p className={`text-sm font-bold text-gold-700 sm:text-base ${wide ? '' : 'mt-1'}`}>{text}</p>
  ) : (
    <p className={`text-2xl font-bold text-ink sm:text-3xl ${wide ? '' : 'mt-0.5'}`}>
      <span className="num">{value}</span>
    </p>
  )
  const icon = (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]} ${wide ? 'sm:h-12 sm:w-12' : ''}`}>
      <Icon className="h-5 w-5" />
    </span>
  )
  const arrow = (
    <ArrowLeftIcon className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:-translate-x-1 group-hover:text-brand-600" />
  )

  if (wide) {
    return (
      <Link to={to} className="card card-lift group flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 sm:contents">
          {icon}
          <span className="sm:hidden">{arrow}</span>
        </div>
        <div className="min-w-0 sm:flex-1">
          <p className="text-xs font-semibold text-muted sm:text-sm">{label}</p>
          {hint && <p className="mt-1 hidden text-xs text-muted sm:block">{hint}</p>}
        </div>
        {figure}
        {hint && <p className="text-xs text-muted sm:hidden">{hint}</p>}
        <span className="hidden sm:block">{arrow}</span>
      </Link>
    )
  }
  return (
    <Link to={to} className="card card-lift group flex flex-col gap-2.5 p-3.5 sm:gap-3 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        {icon}
        {arrow}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted sm:text-sm">{label}</p>
        {figure}
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </Link>
  )
}

/** A part with nothing waiting: a small green line (links to its page too). */
function CalmItem({ to, label, calmText }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-brand-100 transition-colors hover:bg-brand-50"
    >
      <CheckIcon className="h-4 w-4 text-brand-600" />
      <span className="text-muted">{label}:</span>
      <span className="font-semibold text-brand-700">{calmText}</span>
    </Link>
  )
}

/** What needs attention first (the tiles), then what is already done (small green lines). */
function Attention({ items }) {
  const waiting = items.filter((i) => !i.calm)
  const calm = items.filter((i) => i.calm)
  return (
    <section aria-label="يحتاج انتباهك" className="space-y-3">
      {waiting.length > 0 ? (
        <div className={`stagger grid gap-3 ${TILE_COLUMNS[Math.min(waiting.length, 4)]}`}>
          {waiting.map((t) => (
            <AttentionTile key={t.to} {...t} wide={waiting.length <= 2} />
          ))}
        </div>
      ) : (
        <div className="card flex items-center gap-3 border-brand-100 bg-brand-50/60 p-4 sm:p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
            <CheckIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold text-brand-800">ما في شي معلّق اليوم</p>
            <p className="text-sm text-muted">كل الشكاوى والاستفسارات مرفوعة، والتقرير اليومي محدَّث.</p>
          </div>
        </div>
      )}
      {waiting.length > 0 && calm.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {calm.map((t) => (
            <CalmItem key={t.to} {...t} />
          ))}
        </div>
      )}
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
  const { user } = useAuth()
  const { data, error, loadedAt, reload } = useHomeData()
  const now = useNow()
  const name = user ? user.first_name || displayName(user) : ''
  const items = data ? attentionItems(data) : []
  const nothing = data && !items.length && !data.water && !data.circulars

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          {greeting()}
          {name && `، ${name}`}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          هذا ما يحتاج انتباهك اليوم.
          {loadedAt && (
            <span className="inline-flex items-center gap-1.5 text-xs" aria-live="polite">
              <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-danger-600' : 'bg-brand-500'}`} aria-hidden="true" />
              آخر تحديث {updatedAgo(loadedAt, now)}
              {error && <span className="text-danger-700">(تعذر التحديث، سنحاول مجدداً)</span>}
            </span>
          )}
        </p>
      </header>

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
        <LoadingState />
      ) : nothing ? (
        <EmptyState
          icon={ShieldIcon}
          title="لا يوجد ما يُعرض هنا لحسابك"
          hint="استخدم القائمة الجانبية للوصول إلى الصفحات المتاحة لك، أو تواصل مع مسؤول النظام إن كنت تحتاج صلاحيات أخرى."
        />
      ) : (
        <>
          {items.length > 0 && <Attention items={items} />}

          {(data.water || data.circulars) && (
            <div className="grid items-start gap-4 lg:grid-cols-3">
              {data.water && <WaterPanel water={data.water} className={data.circulars ? 'lg:col-span-2' : 'lg:col-span-3'} />}
              {data.circulars && <CircularsPanel circulars={data.circulars} className={data.water ? '' : 'lg:col-span-3'} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
