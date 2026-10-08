import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import logo from '../assets/logo-88.webp'
import useDismiss from '../hooks/useDismiss'
import { CloseIcon, MenuIcon } from './Icons'
import { useNavLinks } from './navLinks'
import Tricolor from './Tricolor'
import UserMenu from './UserMenu'

const desktopLink = ({ isActive }) =>
  `relative flex h-16 items-center gap-2 px-3 text-sm font-semibold transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full ${
    isActive ? 'text-brand-700 after:bg-brand-600' : 'text-muted after:bg-transparent hover:text-ink'
  }`

const mobileLink = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-canvas'
  }`

export default function Navbar() {
  const links = useNavLinks()
  const showLinks = links.length > 0
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const toggleRef = useRef(null)
  const mobileRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])

  // close the mobile menu after navigating, on Escape, or on a tap outside it (e.g. the account menu)
  useEffect(close, [pathname, close])
  useDismiss(open, close, mobileRef, toggleRef)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur print:hidden">
      <Tricolor />
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-3 rounded-lg" aria-label="الصفحة الرئيسية">
          <img src={logo} alt="شعار بلدية غزة" className="h-11 w-auto" width="24" height="44" decoding="async" />
          <span className="leading-tight">
            <span className="block text-[0.95rem] font-bold text-ink">قسم المعلومات والشكاوي</span>
            <span className="block text-xs text-muted">بلدية غزة</span>
          </span>
        </Link>

        {showLinks && (
          <nav className="mx-2 hidden items-stretch md:flex" aria-label="القائمة الرئيسية">
            {links.map(({ to, short, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={desktopLink}>
                <Icon className="h-4 w-4" />
                {short}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="ms-auto flex items-center gap-2">
          <UserMenu />
          {showLinks && (
            <button
              ref={toggleRef}
              type="button"
              className="btn btn-secondary h-11 w-11 p-0 md:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            >
              {open ? <CloseIcon /> : <MenuIcon />}
            </button>
          )}
        </div>
      </div>

      {showLinks && open && (
        <nav ref={mobileRef} id="mobile-menu" className="border-t border-line bg-white px-4 py-3 md:hidden" aria-label="القائمة الرئيسية">
          <ul className="space-y-1">
            {links.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'} className={mobileLink}>
                  <Icon className="h-5 w-5" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
