import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { normalizeArabic } from '../utils/arabic'
import { ChevronDownIcon, CloseIcon } from './Icons'

/**
 * A select whose list scrolls and can be narrowed by typing (e.g. «زيت» → «الزيتون»).
 * `options` is [{ value, label }]; `onChange(value)` gets the chosen value, or '' when cleared.
 * Keyboard: ↑ ↓ move, Enter picks, Escape closes (without closing the dialog around it).
 */
export default function SearchableSelect({ id, value, options, onChange, placeholder, className, ...aria }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  const selected = options.find((o) => String(o.value) === String(value ?? ''))
  const matches = useMemo(() => {
    const term = normalizeArabic(query)
    return term ? options.filter((o) => normalizeArabic(o.label).includes(term)) : options
  }, [options, query])

  function close() {
    setOpen(false)
    setQuery('')
  }
  function openList() {
    if (open) return
    setOpen(true)
    // start on the current choice so the list opens scrolled to it
    setActive(Math.max(0, options.indexOf(selected)))
  }
  function pick(option) {
    onChange(option.value)
    close()
  }

  // a press anywhere outside closes the list
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) close()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // keep the highlighted option visible while moving with the arrow keys
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openList()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(Math.max(i + step, 0), Math.max(matches.length - 1, 0)))
    } else if (e.key === 'Enter') {
      if (!open) return
      e.preventDefault() // pick, don't submit the form
      if (matches[active]) pick(matches[active])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab' && open) {
      close()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        className={`${className} pe-16`}
        placeholder={selected && !open ? undefined : placeholder}
        value={open ? query : selected?.label ?? ''}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onClick={openList}
        onFocus={openList}
        onKeyDown={onKeyDown}
        {...aria}
      />
      <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center gap-1 pe-3 text-muted">
        {selected && (
          <button
            type="button"
            className="pointer-events-auto rounded p-0.5 hover:bg-canvas hover:text-ink"
            aria-label="مسح الاختيار"
            onClick={() => {
              onChange('')
              close()
            }}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-lg"
        >
          {matches.length ? (
            matches.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o === selected}
                // keep the focus in the input; pick on click so a finger scrolling the list doesn't pick
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${
                  i === active ? 'bg-brand-50 text-brand-700' : 'text-ink'
                } ${o === selected ? 'font-bold' : ''}`}
              >
                {o.label}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-muted">لا توجد نتائج مطابقة</li>
          )}
        </ul>
      )}
    </div>
  )
}
