import { useState, useEffect, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingPage from './components/LandingPage'

const EditorApp = lazy(() => import('./App.jsx'))
const EmbedApp = lazy(() => import('./components/EmbedApp.jsx'))
const ReplayApp = lazy(() => import('./components/ReplayApp.jsx'))

function Root() {
  const [room, setRoom] = useState(() => window.location.hash.slice(1))
  const params = new URLSearchParams(window.location.search)
  const isEmbed = params.has('embed')
  const replayId = params.get('replay')

  useEffect(() => {
    const onHash = () => setRoom(window.location.hash.slice(1))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (replayId) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <ReplayApp />
      </Suspense>
    )
  }

  if (!room) return <LandingPage />

  if (isEmbed) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <EmbedApp />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <EditorApp />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
      Loading…
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Root />)
