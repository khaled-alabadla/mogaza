import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Footer from '../components/Footer'
import LoadingState from '../components/LoadingState'
import { useNavSections } from '../components/navLinks'
import Sidebar, { MobileDrawer } from '../components/Sidebar'
import Topbar from '../components/Topbar'

const COLLAPSED_KEY = 'sidebar-collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * App shell: the sidebar on the right (RTL start) on desktop, an off-canvas drawer on smaller
 * screens, a slim sticky top bar (account menu) and the footer at the end of the content column.
 */
export default function MainLayout() {
  const sections = useNavSections()
  const hasNav = sections.length > 0
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      } catch {
        /* private mode / blocked storage: the choice just isn't remembered */
      }
      return !c
    })
  }, [])

  // close the drawer after navigating, and when the screen grows to the desktop layout
  useEffect(closeDrawer, [pathname, closeDrawer])
  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e) => e.matches && closeDrawer()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [drawerOpen, closeDrawer])

  return (
    <div className="flex min-h-screen">
      {hasNav && <Sidebar sections={sections} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          ref={menuButtonRef}
          sections={sections}
          hasNav={hasNav}
          drawerOpen={drawerOpen}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        {/* At least one screen tall (minus the ~69px top bar): while a page or its data loads, the
            content is momentarily short, and the footer would otherwise flash into view and jump away. */}
        <main className="mx-auto min-h-[calc(100svh-4.3rem)] w-full max-w-6xl flex-1 px-4 py-6 sm:py-8 lg:px-8 print:min-h-0 print:max-w-none print:p-0">
          {/* pages are lazy-loaded: keep the shell while a page's code downloads */}
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
        <Footer />
      </div>

      {hasNav && <MobileDrawer open={drawerOpen} onClose={closeDrawer} sections={sections} toggleRef={menuButtonRef} />}
    </div>
  )
}
