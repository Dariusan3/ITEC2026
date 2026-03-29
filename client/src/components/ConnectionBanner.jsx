import { useState, useEffect } from 'react'
import { wsProvider } from '../lib/yjs'

export default function ConnectionBanner() {
  const [status, setStatus] = useState('connected')

  useEffect(() => {
    const onStatus = ({ status }) => setStatus(status)
    wsProvider.on('status', onStatus)
    setStatus(wsProvider.wsconnected ? 'connected' : 'disconnected')
    return () => wsProvider.off('status', onStatus)
  }, [])

  if (status === 'connected') return null

  const isConnecting = status === 'connecting'

  return (
    <div
      className="fixed left-1/2 top-12 z-50 -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-center gap-2 border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide sm:text-xs"
        style={{
          background: isConnecting ? 'var(--yellow)' : 'var(--red)',
          borderColor: isConnecting ? 'var(--yellow)' : 'var(--red)',
          color: 'var(--bg-primary)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-none"
          style={{
            background: 'var(--bg-primary)',
            animation: 'pulse 1.2s ease-in-out infinite',
            opacity: 0.9,
          }}
        />
        {isConnecting
          ? 'Reconnecting to collaboration server…'
          : 'Disconnected — changes will not sync'}
      </div>
    </div>
  )
}
