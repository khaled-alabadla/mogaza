import { useEffect, useRef } from 'react'

export const LIVE_REFRESH_EVERY = 30 * 1000

/**
 * Keeps a page in step with what colleagues add or change: calls `refresh` every 30 seconds while the
 * page is in front of the user, and right away when they come back to it (another tab, a minimised
 * window). Nothing runs while the page is hidden. `refresh` should update quietly (no loading state).
 */
export default function useLiveRefresh(refresh, { every = LIVE_REFRESH_EVERY, enabled = true } = {}) {
  const latest = useRef(refresh)
  latest.current = refresh

  useEffect(() => {
    if (!enabled) return undefined
    let lastRun = Date.now()
    const run = () => {
      // «focus» and «visibilitychange» often fire together: one refresh is enough
      if (document.visibilityState !== 'visible' || Date.now() - lastRun < 2000) return
      lastRun = Date.now()
      latest.current()
    }
    const timer = setInterval(run, every)
    document.addEventListener('visibilitychange', run)
    window.addEventListener('focus', run)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('focus', run)
    }
  }, [every, enabled])
}
