import { useState, useEffect } from 'react'
import { saveRoomNow } from './saveRoom'

const ROOM_KEY = 'itecify:pre-auth-room'

export function useAuth() {
  const [user, setUser] = useState(undefined) // undefined = loading, null = not logged in

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setUser(d.user || null))
      .catch(() => setUser(null))

    // After OAuth redirect — restore room if hash was lost
    const params = new URLSearchParams(window.location.search)
    if (params.has('auth')) {
      const currentHash = window.location.hash.slice(1)
      const savedRoom = sessionStorage.getItem(ROOM_KEY)

      if (!currentHash && savedRoom) {
        // Hash was lost in the redirect — restore it
        window.location.replace(
          window.location.origin +
          window.location.pathname +
          `?auth=${params.get('auth')}` +
          `#${savedRoom}`
        )
        return
      }

      sessionStorage.removeItem(ROOM_KEY)
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }, [])

  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : ''

  const loginGitHub = async () => {
    const room = window.location.hash.slice(1)
    if (room) sessionStorage.setItem(ROOM_KEY, room)
    await saveRoomNow()
    window.location.href = `${apiBase}/auth/github${room ? `?room=${room}` : ''}`
  }

  const loginGoogle = async () => {
    const room = window.location.hash.slice(1)
    if (room) sessionStorage.setItem(ROOM_KEY, room)
    await saveRoomNow()
    window.location.href = `${apiBase}/auth/google${room ? `?room=${room}` : ''}`
  }

  const login = loginGitHub

  const logout = () => {
    fetch('/auth/logout', { method: 'POST', credentials: 'include' })
      .then(() => setUser(null))
  }

  return { user, login, loginGitHub, loginGoogle, logout }
}
