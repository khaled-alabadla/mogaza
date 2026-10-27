import { lazy } from 'react'

const RELOADED_AT = 'page-code-reloaded-at'

/**
 * React.lazy for a page, surviving a new deployment: a tab opened before the update still asks for
 * the previous build's page files, which no longer exist (the host answers with the HTML page, so the
 * import fails). Then the site reloads once to pick up the new build; a second failure within a short
 * while is a real error and is thrown (shown by the error boundary).
 */
export function lazyPage(load) {
  return lazy(() =>
    load().catch((error) => {
      let last = 0
      try {
        last = Number(window.sessionStorage.getItem(RELOADED_AT)) || 0
      } catch {
        /* storage blocked: reload anyway, once per page view */
      }
      if (Date.now() - last > 15000) {
        try {
          window.sessionStorage.setItem(RELOADED_AT, String(Date.now()))
        } catch {
          /* ignore */
        }
        window.location.reload()
        return new Promise(() => {}) // keep the loading state until the reload happens
      }
      throw error
    }),
  )
}
