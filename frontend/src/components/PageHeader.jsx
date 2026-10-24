import { useInRouterContext, useLocation } from 'react-router-dom'
import { NAV_LINKS } from './navLinks'

/** The current page's sidebar entry (for its icon), if the page is one of them. */
function useNavLink() {
  const inRouter = useInRouterContext()
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the router context never appears/disappears at runtime
  const pathname = inRouter ? useLocation().pathname : ''
  return NAV_LINKS.find((l) => l.to === pathname)
}

/**
 * Title (+ optional subtitle) of an inner page, with its main actions on the other side.
 * The page's sidebar icon sits beside the title.
 */
export default function PageHeader({ title, subtitle, children }) {
  const Icon = useNavLink()?.icon
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {Icon && (
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:flex">
              <Icon className="h-[1.35rem] w-[1.35rem]" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap gap-2 print:hidden">{children}</div>}
      </div>
    </header>
  )
}
