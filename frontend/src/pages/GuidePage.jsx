import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import GuideBlocks from '../components/GuideBlocks'
import { BookIcon, ChevronDownIcon, ExternalIcon, MapIcon, PlusIcon, QuestionIcon, RestoreIcon, SearchIcon, UsersIcon } from '../components/Icons'
import PageHeader from '../components/PageHeader'
import { useContentValue, useText } from '../context/ContentContext'
import { GUIDE_DEFAULT } from './guideSections'

/**
 * Show the tracking pages inside the site (true) or only link to them (false). Browsers don't send the
 * tracking system's login to a page framed in another site, so a framed page keeps asking to log in:
 * turn this on only once the tracking system allows being framed by this site.
 */
const EMBED_PAGES = false

/** An icon for each known section (sections added from the dashboard get the book). */
const SECTION_ICONS = {
  'add-complaint': PlusIcon,
  'search-complaint': SearchIcon,
  'add-inquiry': QuestionIcon,
  'complaints-map': MapIcon,
  citizens: UsersIcon,
}
const sectionIcon = (id) => SECTION_ICONS[id] || BookIcon

/**
 * The guide's sections: a column of cards beside the content on large screens, a row that scrolls
 * sideways on small ones.
 */
function SectionNav({ sections, value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="أقسام الدليل"
      aria-orientation="vertical"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {sections.map((s) => {
        const active = s.id === value
        const Icon = sectionIcon(s.id)
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={s.title}
            onClick={() => onChange(s.id)}
            className={`tap flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors lg:py-3 ${
              active ? 'border-brand-500 bg-white shadow-sm ring-2 ring-brand-100' : 'border-line bg-white hover:border-gray-300 lg:border-transparent lg:bg-transparent lg:hover:border-line lg:hover:bg-white'
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'
              }`}
            >
              <Icon className="h-[1.1rem] w-[1.1rem]" />
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold whitespace-nowrap ${active ? 'text-brand-700' : 'text-ink'}`}>{s.title}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** «فتح الصفحة»: the section's tracking-system page, in a new tab of the same browser. */
function OpenPageButton({ section }) {
  return (
    <a className="btn btn-primary shrink-0" href={section.url} target="_blank" rel="noopener noreferrer">
      <ExternalIcon className="h-4 w-4" /> فتح الصفحة
    </a>
  )
}

/** The tracking page framed inside the site (only when EMBED_PAGES is on). */
function EmbeddedPage({ section }) {
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas px-4 py-2.5">
        <span className="min-w-0 truncate text-xs text-muted" dir="ltr">
          {section.url}
        </span>
        <button
          type="button"
          className="btn btn-secondary px-3 py-1.5 text-sm"
          onClick={() => {
            setLoading(true)
            setReloadKey((k) => k + 1)
          }}
        >
          <RestoreIcon className="h-4 w-4" /> إعادة تحميل
        </button>
      </div>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white text-sm text-muted" role="status">
            جارٍ تحميل الصفحة…
          </div>
        )}
        <iframe
          key={`${section.id}-${reloadKey}`}
          src={section.url}
          title={section.title}
          className="block h-[75vh] min-h-[32rem] w-full border-0"
          allow="geolocation; clipboard-write"
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}

/** The section's title card: its icon, what it covers, and the button to its page in the tracking system. */
function SectionIntro({ section }) {
  const Icon = sectionIcon(section.id)
  return (
    <div className="card relative flex flex-wrap items-center gap-4 overflow-hidden p-4 sm:p-5">
      <span className="absolute inset-y-0 start-0 w-1 bg-brand-500" aria-hidden="true" />
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-ink">{section.title}</h2>
        {section.summary && <p className="mt-0.5 text-sm text-muted">{section.summary}</p>}
      </div>
      {section.url && (
        <div className="w-full sm:w-auto [&>a]:w-full">
          <OpenPageButton section={section} />
        </div>
      )}
    </div>
  )
}

/** One stage of a section: a numbered row that opens and closes. */
function Stage({ stage, number, last, open, onToggle, onNavigate }) {
  const panelId = `stage-${stage.id}-panel`
  return (
    <section id={`stage-${stage.id}`} className="relative scroll-mt-24">
      {/* the line joining the numbered circles */}
      {!last && <span className="absolute top-10 bottom-0 start-8 w-px bg-line sm:start-9" aria-hidden="true" />}
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="group relative flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-start sm:px-5"
        >
          <span
            className={`num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
              open ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-brand-700 ring-1 ring-brand-100 group-hover:bg-brand-50'
            }`}
          >
            {number}
          </span>
          <span className={`flex-1 font-semibold transition-colors ${open ? 'text-brand-700' : 'text-ink group-hover:text-brand-700'}`}>{stage.title}</span>
          <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="relative ps-[3.75rem] pe-4 pt-1 pb-6 sm:ps-[4.25rem] sm:pe-6">
          <GuideBlocks blocks={stage.blocks} onNavigate={onNavigate} />
        </div>
      )}
    </section>
  )
}

/** Short sections open fully; a long one (e.g. «إضافة شكوى») starts as a list of its stages. */
const initiallyOpen = (stages) => (stages.length <= 2 ? stages.map((s) => s.id) : [])

/** «دليل القسم»: the department's work guide, with each tracking-system page one click away. */
export default function GuidePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // the content can be replaced from the developer dashboard; an empty / broken edit falls back to the default
  const edited = useContentValue('guide.sections')
  const sections = Array.isArray(edited) && edited.some((s) => s?.id && s?.title) ? edited.filter((s) => s?.id && s?.title) : GUIDE_DEFAULT
  const title = useText('guide.title')
  const subtitle = useText('guide.subtitle')
  const section = sections.find((s) => s.id === searchParams.get('tab')) || sections[0]
  const stages = Array.isArray(section.stages) ? section.stages.filter((s) => s?.id && Array.isArray(s.blocks)) : []
  const [open, setOpen] = useState(() => new Set(initiallyOpen(stages)))
  const scrollTo = useRef(null)

  // switching section: reset which stages are open (or open the one a link asked for)
  const [shownId, setShownId] = useState(section.id)
  if (shownId !== section.id) {
    setShownId(section.id)
    setOpen(new Set(scrollTo.current ? [scrollTo.current] : initiallyOpen(stages)))
  }

  useEffect(() => {
    if (!scrollTo.current) return
    document.getElementById(`stage-${scrollTo.current}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    scrollTo.current = null
  })

  function navigate(sectionId, stageId) {
    scrollTo.current = stageId || null
    if (sectionId && sectionId !== section.id) {
      setSearchParams({ tab: sectionId }, { replace: true })
    } else if (stageId) {
      setOpen((o) => new Set(o).add(stageId))
    }
  }

  const toggle = (id) =>
    setOpen((o) => {
      const next = new Set(o)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allOpen = stages.length > 0 && stages.every((s) => open.has(s.id))

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <SectionNav sections={sections} value={section.id} onChange={(id) => setSearchParams({ tab: id }, { replace: true })} />

        <div className="min-w-0 space-y-4" role="tabpanel" aria-label={section.title}>
          <SectionIntro section={section} />

          {stages.length > 0 && (
            <div className="card overflow-hidden">
              {stages.length > 2 && (
                <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas/60 px-4 py-2.5 sm:px-5">
                  <p className="text-sm text-muted">
                    <span className="num font-semibold text-ink">{stages.length}</span> مراحل
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(allOpen ? new Set() : new Set(stages.map((s) => s.id)))}
                    className="tap shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
                  >
                    {allOpen ? 'طي الكل' : 'فتح الكل'}
                  </button>
                </div>
              )}
              <div className="py-2">
                {stages.map((s, i) => (
                  <Stage
                    key={s.id}
                    stage={s}
                    number={i + 1}
                    last={i === stages.length - 1}
                    open={open.has(s.id)}
                    onToggle={() => toggle(s.id)}
                    onNavigate={navigate}
                  />
                ))}
              </div>
            </div>
          )}

          {!stages.length && (
            <p className="card px-4 py-8 text-center text-sm text-muted">سيتم إضافة التفاصيل والإرشادات الخاصة بهذا القسم قريباً.</p>
          )}

          {EMBED_PAGES && section.url && <EmbeddedPage key={section.id} section={section} />}
        </div>
      </div>
    </div>
  )
}
