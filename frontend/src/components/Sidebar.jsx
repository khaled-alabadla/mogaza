import { useEffect, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import logo from '../assets/logo-88.webp'
import { ChevronIcon, CloseIcon } from './Icons'
import Tricolor from './Tricolor'
import { useText } from '../context/ContentContext'

const linkClass =
  (collapsed) =>
  ({ isActive }) =>
    `tap group relative flex items-center gap-3 rounded-lg text-sm font-semibold transition-colors before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full ${
      collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
    } ${
      isActive
        ? 'bg-white/10 text-white before:bg-gold-400'
        : 'text-white/75 before:bg-transparent hover:bg-white/5 hover:text-white'
    }`

/** Logo + «قسم المعلومات والشكاوي / بلدية غزة» on the green panel. */
function Brand({ collapsed = false }) {
  const brandName = useText('brand.name')
  const brandOrg = useText('brand.org')
  return (
    <Link
      to="/"
      className={`flex items-center gap-3 rounded-lg ${collapsed ? 'justify-center' : ''}`}
      aria-label="الصفحة الرئيسية"
    >
      <span className="shrink-0 rounded-lg bg-white p-1.5 shadow-sm">
        <img src={logo} alt="شعار بلدية غزة" className="h-9 w-auto" width="20" height="36" decoding="async" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[0.95rem] font-bold text-white">{brandName}</span>
          <span className="block text-xs text-white/65">{brandOrg}</span>
        </span>
      )}
    </Link>
  )
}

/** The sections and their links (shared by the desktop sidebar and the mobile drawer). */
export function SidebarNav({ sections, collapsed = false }) {
  return (
    <nav aria-label="القائمة الرئيسية" className="space-y-5">
      {sections.map((section) => (
        <div key={section.id} role="group" aria-labelledby={`nav-${section.id}`}>
          <h2
            id={`nav-${section.id}`}
            className={
              collapsed
                ? 'sr-only'
                : 'mb-1.5 px-3 text-[0.7rem] font-bold tracking-wide text-white/50'
            }
          >
            {section.title}
          </h2>
          {collapsed && <hr className="mx-3 mb-2 border-white/10" aria-hidden="true" />}
          <ul className="space-y-0.5">
            {section.links.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'} className={linkClass(collapsed)} title={collapsed ? label : undefined}>
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`h-5 w-5 shrink-0 ${isActive ? 'text-gold-400' : 'text-white/60 group-hover:text-white'}`}
                      />
                      <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Desktop (lg+) sidebar on the right side (RTL start), full height, optionally collapsed to icons. */
export default function Sidebar({ sections, collapsed, onToggleCollapsed }) {
  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-brand-800 text-white shadow-[inset_1px_0_0_rgb(255_255_255/0.04)] transition-[width] duration-200 lg:flex print:hidden ${
        collapsed ? 'w-[4.5rem]' : 'w-64'
      }`}
      aria-label="الشريط الجانبي"
    >
      <Tricolor green="bg-brand-500" />
      <div className={`flex h-[4.75rem] shrink-0 items-center border-b border-white/10 ${collapsed ? 'px-2' : 'px-4'}`}>
        <Brand collapsed={collapsed} />
      </div>
      <div className={`flex-1 overflow-y-auto py-5 ${collapsed ? 'px-2' : 'px-3'} [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin]`}>
        <SidebarNav sections={sections} collapsed={collapsed} />
      </div>
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          className={`tap flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          {/* points towards the content (left) to collapse, back to the right to expand */}
          <ChevronIcon className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </div>
    </aside>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Mobile / tablet off-canvas drawer sliding in from the right. The parent closes it on route change;
 * here: Escape and the backdrop close it, Tab stays inside, and the page behind does not scroll.
 */
export function MobileDrawer({ open, onClose, sections, toggleRef }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const toggle = toggleRef?.current
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      // hand the focus back to the menu button (when it is still on screen)
      if (toggle?.isConnected) toggle.focus()
    }
  }, [open, onClose, toggleRef])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden print:hidden">
      <div className="drawer-backdrop absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" data-testid="drawer-backdrop" />
      <div
        ref={panelRef}
        id="app-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="القائمة الرئيسية"
        className="drawer-panel absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-brand-800 text-white shadow-2xl"
      >
        <Tricolor green="bg-brand-500" />
        <div className="flex h-[4.75rem] shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4">
          <Brand />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="tap inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-5">
          <SidebarNav sections={sections} />
        </div>
      </div>
    </div>
  )
}
