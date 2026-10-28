import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useDismiss from '../hooks/useDismiss'
import { displayName } from '../utils/format'
import Avatar from './Avatar'
import { ChevronDownIcon, LogoutIcon, UserIcon } from './Icons'

const itemClass =
  'tap flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-offset-0'

/** Account button (avatar + name + role) with a small menu: the profile page, sign out. */
export default function UserMenu() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useDismiss(menuOpen, closeMenu, menuRef, buttonRef)

  // Keyboard users land on the first item; ↑/↓ move between the items.
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [menuOpen])

  function onMenuKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')]
    const next = items.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1)
    items[(next + items.length) % items.length]?.focus()
  }

  // While the session is being checked, keep the space without flashing «تسجيل الدخول».
  if (loading) return <span className="block h-11 w-11" aria-hidden="true" />

  if (!user) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
        تسجيل الدخول
      </button>
    )
  }

  const name = displayName(user)

  return (
    <div className="relative md:border-s md:border-line md:ps-3">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`حساب ${name}`}
        className={`flex items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-canvas sm:py-1.5 sm:ps-1.5 sm:pe-2 ${
          menuOpen ? 'bg-canvas' : ''
        }`}
      >
        <Avatar user={user} />
        <span className="hidden text-right leading-snug sm:block">
          <span className="block text-sm font-semibold text-ink">{name}</span>
          <span className="block text-xs text-muted">{user.role_display}</span>
        </span>
        <ChevronDownIcon
          className={`hidden h-3.5 w-3.5 text-muted transition-transform sm:block ${menuOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`حساب ${name}`}
          onKeyDown={onMenuKeyDown}
          className="absolute end-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-3 pt-2 pb-3 sm:hidden">
            <div className="text-sm font-semibold text-ink">{name}</div>
            <div className="text-xs text-muted">{user.role_display}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-ink hover:bg-canvas focus-visible:bg-canvas`}
            onClick={() => {
              setMenuOpen(false)
              navigate('/profile')
            }}
          >
            <UserIcon className="h-4 w-4 text-muted" />
            الملف الشخصي
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-danger-700 hover:bg-danger-50 focus-visible:bg-danger-50`}
            onClick={async () => {
              setMenuOpen(false)
              await logout()
              navigate('/login')
            }}
          >
            <LogoutIcon className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      )}
    </div>
  )
}
