import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, setCsrfToken, setUnauthorizedHandler } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [publicSearch, setPublicSearch] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await authApi.me()
      setCsrfToken(data.csrf_token)
      setUser(data.user)
      setPublicSearch(Boolean(data.public_search))
      return data.user
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    // If the session expires, the next API call returns 401/403: re-check who we are.
    setUnauthorizedHandler(() => {
      refresh()
    })
    return () => setUnauthorizedHandler(null)
  }, [refresh])

  const login = useCallback(async (username, password) => {
    await authApi.me() // make sure a CSRF cookie exists
    const data = await authApi.login(username, password)
    setCsrfToken(data.csrf_token)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      await refresh()
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      user,
      loading,
      publicSearch,
      isAuthenticated: Boolean(user),
      canEdit: Boolean(user?.can_edit),
      isAdmin: Boolean(user?.is_admin),
      login,
      logout,
      refresh,
    }),
    [user, loading, publicSearch, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
