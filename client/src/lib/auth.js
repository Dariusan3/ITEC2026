import { useState, useEffect } from 'react'

export function useAuth() {
  const [user, setUser] = useState(undefined) // undefined = loading, null = not logged in

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setUser(d.user || null))
      .catch(() => setUser(null))

    // Handle ?auth=ok / ?auth=error after OAuth redirect
    const params = new URLSearchParams(window.location.search)
    if (params.has('auth')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }, [])

  const login = () => {
    // Direct to API server so the 302 to GitHub happens server-side cleanly
    const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : ''
    window.location.href = `${apiBase}/auth/github`
  }

  const logout = () => {
    fetch('/auth/logout', { method: 'POST', credentials: 'include' })
      .then(() => setUser(null))
  }

  return { user, login, logout }
}
