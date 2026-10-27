import { useCallback, useEffect, useRef, useState } from 'react'
import { parseApiError } from '../utils/errors'
import useLiveRefresh from './useLiveRefresh'

const EMPTY = { count: 0, results: [], next: null, previous: null }

/**
 * Fetch a paginated DRF list from the server whenever `fetcher` or `params` change.
 * `fetcher` must be a stable function (e.g. locationsApi.list); switching to another
 * one (locations <-> streets) triggers a new request even if the params are identical.
 * Nothing is searched client-side: every query goes to the API.
 * The list also refreshes itself quietly (useLiveRefresh), so what colleagues add shows without a reload.
 */
export default function usePagedList(fetcher, params) {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const key = JSON.stringify(params)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    // Drop the previous list right away so cards of one type never render with the other's data.
    setData(EMPTY)
    fetcher(JSON.parse(key), controller.signal)
      .then((result) => setData(result))
      .catch((err) => {
        if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return
        setError(parseApiError(err, 'تعذر تحميل البيانات.').message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [fetcher, key, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // the quiet refresh: same request, no loading state, the list replaced only if something changed
  const current = useRef({ fetcher, key })
  current.current = { fetcher, key }
  const refresh = useCallback(async () => {
    const asked = current.current
    try {
      const result = await asked.fetcher(JSON.parse(asked.key))
      // ignore the answer if the user moved on (other filters / page) meanwhile
      if (current.current.fetcher !== asked.fetcher || current.current.key !== asked.key) return
      setData((previous) => (JSON.stringify(previous) === JSON.stringify(result) ? previous : result))
    } catch {
      /* offline for a moment: the list stays as it is, the next refresh will try again */
    }
  }, [])
  useLiveRefresh(refresh, { enabled: !loading && !error })

  return { data, loading, error, reload }
}
