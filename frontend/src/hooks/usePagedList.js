import { useCallback, useEffect, useState } from 'react'
import { parseApiError } from '../utils/errors'

const EMPTY = { count: 0, results: [], next: null, previous: null }

/**
 * Fetch a paginated DRF list from the server whenever `fetcher` or `params` change.
 * `fetcher` must be a stable function (e.g. locationsApi.list); switching to another
 * one (locations <-> streets) triggers a new request even if the params are identical.
 * Nothing is searched client-side: every query goes to the API.
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
  return { data, loading, error, reload }
}
