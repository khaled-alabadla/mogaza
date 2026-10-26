import { useState } from 'react'
import cityMap from '../assets/guide/city-map.webp'
import drafts from '../assets/guide/drafts.webp'
import population from '../assets/guide/population.webp'
import { AlertIcon, ArrowLeftIcon, BulbIcon, CheckIcon, CloseIcon, CopyIcon, InfoIcon, RestoreIcon } from './Icons'
import Modal from './Modal'

/*
 * The building blocks of «دليل القسم» (content in pages/guideSections.js). `onNavigate(section, stage)`
 * opens another part of the guide («ref» links).
 */

function BlockTitle({ title, lead }) {
  if (!title && !lead) return null
  return (
    <div className="mb-3">
      {title && <h4 className="font-bold text-brand-700">{title}</h4>}
      {lead && <p className={`text-[0.95rem] leading-7 text-ink ${title ? 'mt-1' : ''}`}>{lead}</p>}
    </div>
  )
}

function Paragraph({ title, text }) {
  return (
    <div>
      {title && <h4 className="mb-1.5 font-bold text-brand-700">{title}</h4>}
      <p className="text-[0.95rem] leading-8 text-ink">{text}</p>
    </div>
  )
}

/** Numbered steps joined by a line, like the paper's red numbers. */
function Steps({ title, lead, items }) {
  return (
    <div>
      <BlockTitle title={title} lead={lead} />
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
              {i + 1}
            </span>
            <p className="text-[0.95rem] leading-7 text-ink">{item}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Bullets({ title, lead, items }) {
  return (
    <div>
      <BlockTitle title={title} lead={lead} />
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[0.95rem] leading-7 text-ink">
            <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const TONE_MARK = {
  do: <CheckIcon className="h-4 w-4 text-brand-600" />,
  dont: <CloseIcon className="h-4 w-4 text-danger-600" />,
}

const PHONE = /^0\d{8,9}$/

/** A table cell: a phone number becomes a «call» link (kept left-to-right). */
function Cell({ value }) {
  const text = String(value ?? '')
  if (PHONE.test(text.trim())) {
    return (
      <a href={`tel:${text.trim()}`} className="num font-semibold text-brand-700 hover:underline">
        {text.trim()}
      </a>
    )
  }
  return text
}

/** A bordered table (scrolls sideways on a phone). `tones` marks «do» / «don't» columns. */
function Table({ title, lead, head, rows, tones = [] }) {
  return (
    <div>
      <BlockTitle title={title} lead={lead} />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[32rem] border-collapse text-[0.92rem]">
          <thead>
            <tr className="bg-canvas text-ink">
              {head.map((h, i) => (
                <th key={i} scope="col" className="px-4 py-2.5 text-start text-[0.85rem] font-semibold text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    {tones[i] && TONE_MARK[tones[i]]}
                    {h}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-line bg-white">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-4 py-3 align-top leading-7 ${
                      c === 0 && !tones[0] ? 'font-semibold text-ink' : 'text-ink'
                    } ${tones[c] === 'dont' ? 'text-muted' : ''}`}
                  >
                    <Cell value={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Calm notes: a soft background and a coloured icon; only «danger» uses red.
const NOTE_TONES = {
  tip: { box: 'bg-canvas', title: 'text-brand-700', icon: BulbIcon, label: 'نصيحة' },
  info: { box: 'bg-canvas', title: 'text-brand-700', icon: InfoIcon, label: 'معلومة' },
  warn: { box: 'bg-gold-100/50', title: 'text-gold-700', icon: AlertIcon, label: 'تنبيه' },
  danger: { box: 'bg-danger-50/70', title: 'text-danger-700', icon: AlertIcon, label: 'انتبه' },
}

function Note({ tone = 'info', title, text, quote }) {
  const t = NOTE_TONES[tone]
  const Icon = t.icon
  return (
    <aside className={`flex gap-3 rounded-xl px-4 py-3 ${t.box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${t.title}`} />
      <div className="min-w-0 text-[0.95rem] leading-7 text-ink">
        {title && <p className={`font-semibold ${t.title}`}>{title}</p>}
        <p>{text}</p>
        {quote && <p className="mt-1 font-semibold">«{quote}»</p>}
      </div>
    </aside>
  )
}

/** Wording to say (or paste into the system), with a copy button. `letter` keeps it as one text. */
function Script({ title, lines, letter }) {
  const [copied, setCopied] = useState(false)
  const text = lines.join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked (e.g. no permission): nothing to do, the text stays selectable
    }
  }

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-white">
      <figcaption className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="text-sm font-semibold text-muted">{title}</span>
        <button type="button" onClick={copy} className="tap flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-white hover:text-ink">
          {copied ? <CheckIcon className="h-4 w-4 text-brand-600" /> : <CopyIcon className="h-4 w-4" />}
          {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </figcaption>
      {letter ? (
        <p className="px-4 pt-1 pb-3.5 text-[0.95rem] leading-8 whitespace-pre-line text-ink">{text}</p>
      ) : (
        <div className="space-y-1 px-4 pt-1 pb-3.5">
          {lines.map((line, i) => (
            <blockquote key={i} className="text-[0.95rem] leading-7 text-ink">
              «{line}»
            </blockquote>
          ))}
        </div>
      )}
    </figure>
  )
}

/** The screenshots a «figure» block can show, by key. */
export const GUIDE_IMAGES = { population, 'city-map': cityMap, drafts }

/** A screenshot from the paper guide; click to see it larger. */
function Figure({ image, caption }) {
  const src = GUIDE_IMAGES[image]
  const [open, setOpen] = useState(false)
  if (!src) return null
  return (
    <figure>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full overflow-hidden rounded-xl border border-line bg-white shadow-sm transition hover:shadow-md"
        aria-label={`تكبير الصورة: ${caption}`}
      >
        <img src={src} alt={caption} loading="lazy" className="w-full transition duration-300 group-hover:scale-[1.015]" />
      </button>
      <figcaption className="mt-2 text-center text-xs text-muted">{caption}</figcaption>
      <Modal size="lg" open={open} title={caption} onClose={() => setOpen(false)}>
        <img src={src} alt={caption} className="w-full rounded-lg border border-line" />
      </Modal>
    </figure>
  )
}

/** «قائمة التدقيق قبل الحفظ»: tick each item before saving; resets with one click. */
function Checklist({ lead, items }) {
  const [done, setDone] = useState(() => new Set())
  const toggle = (i) =>
    setDone((d) => {
      const next = new Set(d)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  const all = done.size === items.length

  return (
    <div>
      <BlockTitle lead={lead} />
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(done.size / items.length) * 100}%` }} />
        </div>
        <span className="num text-sm font-semibold text-muted">
          {done.size} / {items.length}
        </span>
        {done.size > 0 && (
          <button type="button" onClick={() => setDone(new Set())} className="tap flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-canvas hover:text-ink">
            <RestoreIcon className="h-3.5 w-3.5" /> بدء من جديد
          </button>
        )}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {items.map((item, i) => (
          <li key={item}>
            <label className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors ${done.has(i) ? 'bg-brand-50' : 'bg-white hover:bg-canvas'}`}>
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-600" checked={done.has(i)} onChange={() => toggle(i)} />
              <span className={`text-[0.95rem] ${done.has(i) ? 'text-brand-700' : 'text-ink'}`}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      {all && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-bold text-white" role="status">
          <CheckIcon className="h-5 w-5" /> كل البنود مكتملة، الشكوى جاهزة لـ «حفظ مع التحويل».
        </p>
      )}
    </div>
  )
}

function Ref({ section, stage, text, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(section, stage)}
      className="tap inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-brand-700 hover:underline"
    >
      {text}
      <ArrowLeftIcon className="h-4 w-4" />
    </button>
  )
}

const BLOCKS = {
  p: Paragraph,
  steps: Steps,
  bullets: Bullets,
  table: Table,
  note: Note,
  script: Script,
  figure: Figure,
  checklist: Checklist,
  ref: Ref,
}

export default function GuideBlocks({ blocks, onNavigate }) {
  return (
    <div className="space-y-6">
      {blocks.map((block, i) => {
        const Block = BLOCKS[block?.type]
        // the content is editable from the developer dashboard: skip a block of an unknown type
        return Block ? <Block key={i} {...block} onNavigate={onNavigate} /> : null
      })}
    </div>
  )
}
