import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import GuideBlocks from '../components/GuideBlocks'
import { ChevronDownIcon, ExternalIcon, RestoreIcon } from '../components/Icons'
import PageHeader from '../components/PageHeader'
import Segmented from '../components/Segmented'
import { useContentValue, useText } from '../context/ContentContext'
import { GUIDE_DEFAULT } from './guideSections'

/**
 * Show the tracking pages inside the site (true) or only link to them (false). Browsers don't send the
 * tracking system's login to a page framed in another site, so a framed page keeps asking to log in:
 * turn this on only once the tracking system allows being framed by this site.
 */
const EMBED_PAGES = false

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

/** One stage of a section: a numbered row that opens and closes. */
function Stage({ stage, number, open, onToggle, onNavigate }) {
  const panelId = `stage-${stage.id}-panel`
  return (
    <section id={`stage-${stage.id}`} className="scroll-mt-24">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover:bg-canvas sm:px-5"
        >
          <span className="num w-5 shrink-0 text-sm font-semibold text-muted">{number}</span>
          <span className={`flex-1 font-semibold ${open ? 'text-brand-700' : 'text-ink'}`}>{stage.title}</span>
          <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="px-4 pt-1 pb-6 sm:ps-13 sm:pe-6">
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

      <Segmented
        className="mb-6"
        label="أقسام الدليل"
        value={section.id}
        onChange={(id) => setSearchParams({ tab: id }, { replace: true })}
        options={sections.map((s) => ({ value: s.id, label: s.title }))}
      />

      <div className="min-w-0 space-y-3" role="tabpanel" aria-label={section.title}>
        {section.url && (
          <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <p className="text-sm text-muted">
              صفحة «<span className="font-semibold text-ink">{section.title}</span>» في نظام الشكاوى
            </p>
            <OpenPageButton section={section} />
          </div>
        )}

        {stages.length > 0 && (
          <div className="card divide-y divide-line overflow-hidden">
            {stages.length > 2 && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <p className="text-sm text-muted">{section.summary}</p>
                <button
                  type="button"
                  onClick={() => setOpen(allOpen ? new Set() : new Set(stages.map((s) => s.id)))}
                  className="tap shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  {allOpen ? 'طي الكل' : 'فتح الكل'}
                </button>
              </div>
            )}
            {stages.map((s, i) => (
              <Stage key={s.id} stage={s} number={i + 1} open={open.has(s.id)} onToggle={() => toggle(s.id)} onNavigate={navigate} />
            ))}
          </div>
        )}

        {!stages.length && (
          <p className="card px-4 py-8 text-center text-sm text-muted">سيتم إضافة التفاصيل والإرشادات الخاصة بهذا القسم قريباً.</p>
        )}

        {EMBED_PAGES && section.url && <EmbeddedPage key={section.id} section={section} />}
      </div>
    </div>
  )
}
