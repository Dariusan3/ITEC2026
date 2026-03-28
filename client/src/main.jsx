import { useState, useEffect, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingPage from './components/LandingPage'

const EditorApp = lazy(() => import('./App.jsx'))

function Root() {
  const [room, setRoom] = useState(() => window.location.hash.slice(1))

  useEffect(() => {
    const onHash = () => setRoom(window.location.hash.slice(1))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!room) return <LandingPage />

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
        Loading…
      </div>
    }>
      <EditorApp />
    </Suspense>
  )
}

createRoot(document.getElementById('root')).render(<Root />)
