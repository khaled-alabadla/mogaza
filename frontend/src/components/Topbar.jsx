import { forwardRef } from 'react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import logo from '../assets/logo-88.webp'
import { MenuIcon } from './Icons'
import Tricolor from './Tricolor'
import UserMenu from './UserMenu'

/** The section / page the visitor is on («الشكاوى والاستفسارات › الاستفسارات»), from the sidebar sections. */
function useCurrentPage(sections) {
  const { pathname } = useLocation()
  for (const section of sections) {
    const link = section.links.find((l) => matchPath({ path: l.to, end: l.to === '/' }, pathname))
    if (link) return { section, link }
  }
  return null
}

/**
 * Slim sticky bar above the content: the menu button + brand on small screens, the current page on
 * desktop (the brand is in the sidebar there), and the account menu.
 */
const Topbar = forwardRef(function Topbar({ sections, hasNav, drawerOpen, onOpenDrawer }, menuButtonRef) {
  const current = useCurrentPage(sections)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur print:hidden">
      {/* the desktop sidebar carries the stripe; without it, the bar does */}
      <Tricolor className={`flex h-1 ${hasNav ? 'lg:hidden' : ''}`} />
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        {hasNav && (
          <button
            ref={menuButtonRef}
            type="button"
            className="btn btn-secondary h-11 w-11 shrink-0 p-0 lg:hidden"
            onClick={onOpenDrawer}
            aria-expanded={drawerOpen}
            aria-controls="app-drawer"
            aria-haspopup="dialog"
            aria-label="فتح القائمة"
          >
            <MenuIcon />
          </button>
        )}

        <Link
          to="/"
          className={`flex min-w-0 items-center gap-3 rounded-lg ${hasNav ? 'lg:hidden' : ''}`}
          aria-label="الصفحة الرئيسية"
        >
          <img src={logo} alt="شعار بلدية غزة" className="h-10 w-auto shrink-0" width="22" height="40" decoding="async" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.95rem] font-bold text-ink">قسم المعلومات والشكاوي</span>
            <span className="block text-xs text-muted">بلدية غزة</span>
          </span>
        </Link>

        {hasNav && current && (
          <p className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
            <span className="text-muted">{current.section.title}</span>
            <span className="text-line" aria-hidden="true">
              /
            </span>
            <span className="truncate font-semibold text-ink" aria-current="page">
              {current.link.label}
            </span>
          </p>
        )}

        <div className="ms-auto flex shrink-0 items-center gap-2">
          <UserMenu />
        </div>
      </div>
    </header>
  )
})

export default Topbar
