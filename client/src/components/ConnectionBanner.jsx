import { useState, useEffect } from 'react'
import { wsProvider } from '../lib/yjs'

export default function ConnectionBanner() {
  const [status, setStatus] = useState('connected')

  useEffect(() => {
    const onStatus = ({ status }) => setStatus(status)
    wsProvider.on('status', onStatus)
    // Set initial status
    setStatus(wsProvider.wsconnected ? 'connected' : 'disconnected')
    return () => wsProvider.off('status', onStatus)
  }, [])

  if (status === 'connected') return null

  return (
    <div
      className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-lg"
      style={{
        background: status === 'connecting' ? 'var(--yellow)' : 'var(--red)',
        color: 'var(--bg-primary)',
      }}
    >
      <span className="animate-pulse">●</span>
      {status === 'connecting'
        ? 'Reconnecting to collaboration server...'
        : 'Disconnected — changes will not sync'}
    </div>
  )
}
