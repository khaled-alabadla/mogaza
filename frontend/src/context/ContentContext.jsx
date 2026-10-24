/* eslint-disable react-refresh/only-export-components -- the provider and its hooks belong together */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { CONTENT_FIELDS } from '../content/registry'
import { contentApi } from '../services/api'

const ContentContext = createContext(null)

/**
 * Loads the texts edited in the developer dashboard once, and lets components read any registered
 * text (falling back to the site's own default until — or if — the edits arrive).
 */
export function ContentProvider({ children }) {
  const [overrides, setOverrides] = useState({})

  const reload = useCallback(
    () =>
      contentApi
        .all()
        .then((data) => setOverrides(data && typeof data === 'object' ? data : {}))
        .catch(() => {}), // the defaults are fine without them
    [],
  )
  useEffect(() => {
    reload()
  }, [reload])

  const value = useMemo(() => ({ overrides, setOverrides, reload }), [overrides, reload])
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}

/** The edited value of `key`, else its registered default (works outside the provider too, e.g. in tests). */
export function useContentValue(key) {
  const ctx = useContext(ContentContext)
  const field = CONTENT_FIELDS[key]
  const edited = ctx?.overrides?.[key]
  if (edited === undefined || edited === null) return field?.default
  // a JSON value must keep the default's shape (e.g. a list), or the page would break
  if (field?.type === 'json') return field.default === null || Array.isArray(field.default) === Array.isArray(edited) ? edited : field.default
  if (field && field.type !== 'json' && typeof edited !== 'string') return field.default
  return edited
}

/** A registered text, e.g. useText('login.welcome'). */
export const useText = (key) => useContentValue(key) ?? ''

/** For the dashboard: every override plus a way to update the local copy after a save. */
export function useContentStore() {
  return useContext(ContentContext)
}
