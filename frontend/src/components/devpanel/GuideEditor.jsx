import { useEffect, useMemo, useRef, useState } from 'react'
import { CONTENT_FIELDS } from '../../content/registry'
import { ChevronDownIcon, ExternalIcon, PlusIcon, RestoreIcon, TrashIcon } from '../Icons'
import { GUIDE_IMAGES } from '../GuideBlocks'
import useContentField from './useContentField'

/*
 * «دليل القسم» editor: sections → stages → blocks, all added, edited, reordered and deleted on screen.
 * Lists are typed one item per line; a table is one row per line, its cells separated by «|».
 * Nothing is saved until «حفظ الدليل».
 */

const BLOCK_TYPES = {
  p: 'فقرة',
  steps: 'خطوات مرقّمة',
  bullets: 'نقاط',
  table: 'جدول',
  note: 'ملاحظة',
  script: 'صيغة جاهزة للنسخ',
  figure: 'صورة',
  checklist: 'قائمة تدقيق',
  ref: 'رابط لقسم آخر',
}
const NOTE_TONES = { tip: 'نصيحة', info: 'معلومة', warn: 'تنبيه', danger: 'تحذير' }
const IMAGE_LABELS = { population: 'شاشة سجل السكان', 'city-map': 'مستكشف المدينة', drafts: 'شاشة المسودات' }
const NEW_BLOCKS = {
  p: { text: '' },
  steps: { items: [''] },
  bullets: { items: [''] },
  table: { head: ['', ''], rows: [['', '']] },
  note: { tone: 'tip', text: '' },
  script: { title: '', lines: [''] },
  figure: { image: 'population', caption: '' },
  checklist: { items: [''] },
  ref: { section: '', text: '' },
}

let counter = 0
const uid = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`

/** Give every section / stage / block a key for React (stripped again on save). */
function withKeys(sections) {
  return sections.map((s) => ({
    ...s,
    _k: uid(),
    stages: (s.stages || []).map((st) => ({ ...st, _k: uid(), blocks: (st.blocks || []).map((b) => ({ ...b, _k: uid() })) })),
  }))
}

const clean = (lines) => lines.map((l) => String(l).trim()).filter(Boolean)
const opt = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/** The saved form: no React keys, no empty lines / optional fields. */
function forSave(sections) {
  return sections.map(({ _k, stages, ...s }) => ({
    ...s,
    title: s.title.trim(),
    summary: opt(s.summary),
    url: opt(s.url),
    stages: stages.map(({ _k: _sk, blocks, ...st }) => ({
      ...st,
      title: st.title.trim(),
      blocks: blocks.map(({ _k: _bk, ...b }) => {
        const out = { ...b, title: opt(b.title), lead: opt(b.lead) }
        if (b.items) out.items = clean(b.items)
        if (b.lines) out.lines = clean(b.lines)
        if (b.rows) out.rows = b.rows.filter((r) => r.some((c) => String(c).trim()))
        return out
      }),
    })),
  }))
}

function guideProblem(sections) {
  if (!sections.length) return 'أضف قسماً واحداً على الأقل.'
  for (const s of sections) {
    if (!s.title.trim()) return 'لكل قسم عنوان.'
    for (const st of s.stages) if (!st.title.trim()) return `لكل مرحلة في «${s.title}» عنوان.`
  }
  return ''
}

const move = (list, i, step) => {
  const j = i + step
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/* --- small inputs ------------------------------------------------------------------------------ */

function Input({ label, value, onChange, dir, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input className="input py-2" dir={dir} placeholder={placeholder} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** A textarea whose text is kept as typed, while the parsed value goes up (one item per line). */
function LinesInput({ label, hint, value, toText, fromText, rows = 4 }) {
  const [text, setText] = useState(() => toText(value))
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label} {hint && <span className="font-normal">({hint})</span>}
      </span>
      <textarea
        className="input py-2 leading-7"
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          fromText(e.target.value)
        }}
      />
    </label>
  )
}

function Lines({ label, value, onChange, hint = 'كل سطر بند' }) {
  return <LinesInput label={label} hint={hint} value={value || []} toText={(v) => v.join('\n')} fromText={(t) => onChange(t.split('\n'))} />
}

function TableInput({ block, onChange }) {
  return (
    <LinesInput
      label="الجدول"
      hint="السطر الأول عناوين الأعمدة، وكل سطر بعده صف؛ افصل الخانات بـ |"
      rows={Math.min(10, 2 + (block.rows?.length || 0))}
      value={block}
      toText={(b) => [b.head || [], ...(b.rows || [])].map((r) => r.join(' | ')).join('\n')}
      fromText={(t) => {
        const [head = [], ...rows] = t.split('\n').map((l) => l.split('|').map((c) => c.trim()))
        onChange({ ...block, head, rows })
      }}
    />
  )
}

/** Up / down / delete for one item of a list. */
function ItemActions({ index, count, onMove, onDelete, label }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" className="icon-action h-8 w-8" aria-label={`نقل ${label} لأعلى`} title="لأعلى" disabled={index === 0} onClick={() => onMove(-1)}>
        <ChevronDownIcon className="h-4 w-4 rotate-180" />
      </button>
      <button type="button" className="icon-action h-8 w-8" aria-label={`نقل ${label} لأسفل`} title="لأسفل" disabled={index === count - 1} onClick={() => onMove(1)}>
        <ChevronDownIcon className="h-4 w-4" />
      </button>
      <button type="button" className="icon-action icon-action-danger h-8 w-8" aria-label={`حذف ${label}`} title="حذف" onClick={onDelete}>
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/* --- blocks ------------------------------------------------------------------------------------ */

function BlockFields({ block, set, sections }) {
  const field = (key, label, props = {}) => <Input label={label} value={block[key]} onChange={(v) => set({ [key]: v })} {...props} />
  switch (block.type) {
    case 'p':
      return (
        <>
          {field('title', 'عنوان (اختياري)')}
          <LinesInput label="النص" value={block.text || ''} toText={(v) => v} fromText={(t) => set({ text: t })} rows={3} />
        </>
      )
    case 'steps':
    case 'bullets':
    case 'checklist':
      return (
        <>
          {block.type !== 'checklist' && field('title', 'عنوان (اختياري)')}
          {field('lead', 'جملة قبلها (اختياري)')}
          <Lines label="البنود" value={block.items} onChange={(items) => set({ items })} />
        </>
      )
    case 'table':
      return (
        <>
          {field('title', 'عنوان (اختياري)')}
          {field('lead', 'جملة قبله (اختياري)')}
          <TableInput block={block} onChange={(b) => set({ head: b.head, rows: b.rows })} />
        </>
      )
    case 'note':
      return (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">النوع</span>
            <select className="input py-2" value={block.tone || 'info'} onChange={(e) => set({ tone: e.target.value })}>
              {Object.entries(NOTE_TONES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {field('title', 'عنوان (اختياري)')}
          <LinesInput label="النص" value={block.text || ''} toText={(v) => v} fromText={(t) => set({ text: t })} rows={2} />
        </>
      )
    case 'script':
      return (
        <>
          {field('title', 'العنوان')}
          <Lines label="الأسطر" value={block.lines} onChange={(lines) => set({ lines })} hint="كل سطر جملة" />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={Boolean(block.letter)} onChange={(e) => set({ letter: e.target.checked })} />
            نص واحد متصل (مثل الصيغة الرسمية)
          </label>
        </>
      )
    case 'figure':
      return (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">الصورة</span>
            <select className="input py-2" value={block.image || ''} onChange={(e) => set({ image: e.target.value })}>
              {Object.keys(GUIDE_IMAGES).map((k) => (
                <option key={k} value={k}>
                  {IMAGE_LABELS[k] || k}
                </option>
              ))}
            </select>
          </label>
          {field('caption', 'الوصف تحت الصورة')}
        </>
      )
    case 'ref': {
      const target = sections.find((s) => s.id === block.section)
      return (
        <>
          {field('text', 'نص الرابط')}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">القسم</span>
              <select className="input py-2" value={block.section || ''} onChange={(e) => set({ section: e.target.value, stage: undefined })}>
                <option value="">اختر القسم</option>
                {sections.map((s) => (
                  <option key={s._k} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">المرحلة (اختياري)</span>
              <select className="input py-2" value={block.stage || ''} onChange={(e) => set({ stage: e.target.value || undefined })}>
                <option value="">بدون</option>
                {(target?.stages || []).map((st) => (
                  <option key={st._k} value={st.id}>
                    {st.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )
    }
    default:
      return <p className="text-sm text-muted">نوع غير معروف ({block.type})، يبقى كما هو.</p>
  }
}

function BlockCard({ block, index, count, onChange, onMove, onDelete, sections }) {
  const set = (patch) => onChange({ ...block, ...patch })
  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="text-xs font-semibold text-brand-700">{BLOCK_TYPES[block.type] || block.type}</span>
        <ItemActions index={index} count={count} onMove={onMove} onDelete={onDelete} label="العنصر" />
      </div>
      <div className="space-y-3 p-3">
        <BlockFields block={block} set={set} sections={sections} />
      </div>
    </div>
  )
}

function AddBlock({ onAdd }) {
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">إضافة عنصر</span>
      <select
        className="input w-auto py-1.5 text-sm"
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value)
        }}
      >
        <option value="">+ إضافة عنصر…</option>
        {Object.entries(BLOCK_TYPES).map(([t, l]) => (
          <option key={t} value={t}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

/* --- stages and sections ------------------------------------------------------------------------- */

function StageCard({ stage, index, count, onChange, onMove, onDelete, sections }) {
  const [open, setOpen] = useState(false)
  const setBlocks = (blocks) => onChange({ ...stage, blocks })
  return (
    <div className="rounded-xl border border-line bg-canvas/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className="icon-action h-8 w-8" aria-label={open ? 'طي المرحلة' : 'فتح المرحلة'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <span className="num w-5 text-sm text-muted">{index + 1}</span>
        <input
          className="input flex-1 py-1.5 font-semibold"
          aria-label="عنوان المرحلة"
          placeholder="عنوان المرحلة"
          value={stage.title}
          onChange={(e) => onChange({ ...stage, title: e.target.value })}
        />
        <span className="hidden text-xs text-muted sm:inline">
          <span className="num">{stage.blocks.length}</span> عنصر
        </span>
        <ItemActions index={index} count={count} onMove={onMove} onDelete={onDelete} label="المرحلة" />
      </div>
      {open && (
        <div className="space-y-3 border-t border-line p-3">
          {stage.blocks.map((b, i) => (
            <BlockCard
              key={b._k}
              block={b}
              index={i}
              count={stage.blocks.length}
              sections={sections}
              onChange={(nb) => setBlocks(stage.blocks.map((x, j) => (j === i ? nb : x)))}
              onMove={(step) => setBlocks(move(stage.blocks, i, step))}
              onDelete={() => setBlocks(stage.blocks.filter((_, j) => j !== i))}
            />
          ))}
          <AddBlock onAdd={(type) => setBlocks([...stage.blocks, { type, ...structuredClone(NEW_BLOCKS[type]), _k: uid() }])} />
        </div>
      )}
    </div>
  )
}

function SectionEditor({ section, onChange, sections }) {
  const setStages = (stages) => onChange({ ...section, stages })
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="عنوان القسم" value={section.title} onChange={(title) => onChange({ ...section, title })} />
        <Input label="وصف قصير" value={section.summary} onChange={(summary) => onChange({ ...section, summary })} />
        <div className="sm:col-span-2">
          <Input
            label="رابط صفحة النظام لزر «فتح الصفحة» (اتركه فارغاً إن لم يوجد)"
            dir="ltr"
            placeholder="https://tracking.mogaza.org/wf/…"
            value={section.url}
            onChange={(url) => onChange({ ...section, url })}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">المراحل</p>
        <div className="space-y-2">
          {section.stages.map((st, i) => (
            <StageCard
              key={st._k}
              stage={st}
              index={i}
              count={section.stages.length}
              sections={sections}
              onChange={(ns) => setStages(section.stages.map((x, j) => (j === i ? ns : x)))}
              onMove={(step) => setStages(move(section.stages, i, step))}
              onDelete={() => {
                if (window.confirm(`حذف المرحلة «${st.title || 'بدون عنوان'}» وكل محتواها؟`)) setStages(section.stages.filter((_, j) => j !== i))
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary mt-2 py-1.5"
          onClick={() => setStages([...section.stages, { id: uid(), title: '', blocks: [], _k: uid() }])}
        >
          <PlusIcon className="h-4 w-4" /> إضافة مرحلة
        </button>
      </div>
    </div>
  )
}

/* --- the editor ---------------------------------------------------------------------------------- */

export default function GuideEditor() {
  const field = CONTENT_FIELDS['guide.sections']
  const { overridden, busy, save, reset, current } = useContentField(field.key)
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(null) // JSON of the last loaded / saved guide, to spot unsaved changes
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const justSaved = useRef(null) // our own save coming back from the store: keep the editor as it is

  // the edited guide, else the site's default (loaded on demand)
  useEffect(() => {
    if (Array.isArray(current) && JSON.stringify(current) === justSaved.current) return undefined
    let alive = true
    Promise.resolve(Array.isArray(current) ? current : field.loadDefault()).then((value) => {
      if (!alive) return
      const keyed = withKeys(value)
      setDraft(keyed)
      setSaved(JSON.stringify(forSave(keyed)))
    })
    return () => {
      alive = false
    }
  }, [current, field])

  const dirty = useMemo(() => draft && JSON.stringify(forSave(draft)) !== saved, [draft, saved])
  if (!draft) return <p className="card px-5 py-10 text-center text-sm text-muted">جارٍ التحميل…</p>

  const section = draft[Math.min(selected, draft.length - 1)]
  const setSection = (ns) => setDraft(draft.map((s) => (s === section ? ns : s)))

  async function handleSave() {
    const problem = guideProblem(draft)
    setError(problem)
    if (problem) return
    const value = forSave(draft)
    justSaved.current = JSON.stringify(value)
    if (await save(value)) setSaved(justSaved.current)
  }

  return (
    <div className="space-y-4">
      {/* save bar */}
      <div className="card sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm">
          {dirty ? <span className="font-semibold text-gold-700">● تعديلات غير محفوظة</span> : <span className="text-muted">كل التعديلات محفوظة</span>}
          {overridden && !dirty && <span className="text-muted"> · الدليل معدّل عن الأصل</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary py-1.5" href="/guide" target="_blank" rel="noopener noreferrer">
            <ExternalIcon className="h-4 w-4" /> معاينة
          </a>
          {overridden && (
            <button
              type="button"
              className="btn btn-secondary py-1.5"
              disabled={busy}
              onClick={() => window.confirm('إرجاع الدليل كله إلى محتواه الأصلي؟ ستُحذف كل التعديلات.') && reset()}
            >
              <RestoreIcon className="h-4 w-4" /> استعادة الأصل
            </button>
          )}
          {dirty && (
            <button type="button" className="btn btn-secondary py-1.5" onClick={() => setDraft(withKeys(JSON.parse(saved)))}>
              تراجع
            </button>
          )}
          <button type="button" className="btn btn-primary py-1.5" disabled={busy || !dirty} onClick={handleSave}>
            حفظ الدليل
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* sections */}
        <nav className="card p-2" aria-label="أقسام الدليل">
          <ul className="space-y-0.5">
            {draft.map((s, i) => (
              <li key={s._k} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-current={s === section ? 'true' : undefined}
                  className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-start text-sm transition-colors ${
                    s === section ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink hover:bg-canvas'
                  }`}
                >
                  {s.title || 'قسم بدون عنوان'}
                </button>
                {s === section && (
                  <ItemActions
                    index={i}
                    count={draft.length}
                    label="القسم"
                    onMove={(step) => {
                      setDraft(move(draft, i, step))
                      setSelected(Math.min(Math.max(i + step, 0), draft.length - 1))
                    }}
                    onDelete={() => {
                      if (!window.confirm(`حذف القسم «${s.title || 'بدون عنوان'}» وكل مراحله؟`)) return
                      setDraft(draft.filter((_, j) => j !== i))
                      setSelected(Math.max(0, i - 1))
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-secondary mt-2 w-full py-1.5"
            onClick={() => {
              setDraft([...draft, { id: uid(), title: 'قسم جديد', summary: '', stages: [], _k: uid() }])
              setSelected(draft.length)
            }}
          >
            <PlusIcon className="h-4 w-4" /> إضافة قسم
          </button>
        </nav>

        <div className="card p-4 sm:p-5">
          {section ? <SectionEditor key={section._k} section={section} onChange={setSection} sections={draft} /> : <p className="text-sm text-muted">لا توجد أقسام.</p>}
        </div>
      </div>
    </div>
  )
}
