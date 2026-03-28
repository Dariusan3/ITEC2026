import { useState, useEffect } from 'react'
import { wsProvider, roomId, getYText } from '../lib/yjs'
import { useAuth } from '../lib/auth'

const LANGUAGES = ['javascript', 'python', 'rust', 'typescript', 'html', 'css', 'json']

export default function TopBar({ filename, language, onLanguageChange, onRun, running }) {
  const [users, setUsers] = useState([])
  const [copied, setCopied] = useState(false)
  const [gistState, setGistState] = useState('idle') // idle | saving | done | error
  const { user, login, logout } = useAuth()

  // Sync GitHub name/avatar into Yjs awareness when logged in
  useEffect(() => {
    if (user) {
      wsProvider.awareness.setLocalStateField('user', {
        name: user.name || user.login,
        color: wsProvider.awareness.getLocalState()?.user?.color || '#cba6f7',
        avatar: user.avatar,
      })
    }
  }, [user])

  useEffect(() => {
    const awareness = wsProvider.awareness
    const update = () => {
      const seen = new Set()
      const states = []
      awareness.getStates().forEach((state, clientId) => {
        if (state.user && !seen.has(state.user.name)) {
          seen.add(state.user.name)
          states.push({ ...state.user, clientId })
        }
      })
      setUsers(states)
    }
    awareness.on('change', update)
    update()
    return () => awareness.off('change', update)
  }, [])

  const handleGist = async () => {
    if (gistState === 'saving') return
    setGistState('saving')
    try {
      const content = getYText(filename).toString()
      const res = await fetch('/api/gist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGistState('done')
      window.open(data.url, '_blank', 'noopener')
      setTimeout(() => setGistState('idle'), 3000)
    } catch {
      setGistState('error')
      setTimeout(() => setGistState('idle'), 3000)
    }
  }

  const handleShare = () => {
    const url = `${window.location.origin}${window.location.pathname}#${roomId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-center justify-between h-11 px-4 border-b"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3">
        <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>
          iTECify
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          #{roomId}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {filename}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          className="text-xs px-2 py-1 rounded border outline-none cursor-pointer"
          style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          {LANGUAGES.map(lang => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>

        <button
          onClick={handleShare}
          className="text-xs font-semibold px-3 py-1 rounded transition-all"
          style={{ background: copied ? 'var(--green)' : 'var(--bg-tertiary)', color: copied ? 'var(--bg-primary)' : 'var(--accent)', border: '1px solid var(--accent)' }}
        >
          {copied ? '✓ Copied!' : '⎘ Share'}
        </button>

        <button
          onClick={handleGist}
          disabled={gistState === 'saving'}
          className="text-xs font-semibold px-3 py-1 rounded transition-all"
          style={{
            background: gistState === 'done' ? 'var(--green)' : gistState === 'error' ? 'var(--red)' : 'var(--bg-tertiary)',
            color: gistState === 'done' || gistState === 'error' ? 'var(--bg-primary)' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
            opacity: gistState === 'saving' ? 0.6 : 1,
          }}
        >
          {gistState === 'saving' ? '...' : gistState === 'done' ? '✓ Gist' : gistState === 'error' ? '✗ Failed' : '↗ Gist'}
        </button>

        <button
          onClick={onRun}
          disabled={running}
          className="text-xs font-semibold px-3 py-1 rounded transition-opacity"
          style={{ background: 'var(--green)', color: 'var(--bg-primary)', opacity: running ? 0.5 : 1 }}
        >
          {running ? '⏳ Running...' : '▶ Run'}
        </button>

        {/* Auth */}
        {user === null && (
          <button
            onClick={login}
            className="text-xs font-semibold px-3 py-1 rounded"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            ⇢ Login with GitHub
          </button>
        )}
        {user && (
          <div className="flex items-center gap-1.5">
            {user.avatar && (
              <img src={user.avatar} alt={user.name} className="w-6 h-6 rounded-full" />
            )}
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{user.name || user.login}</span>
            <button
              onClick={logout}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >out</button>
          </div>
        )}

        <div className="flex items-center -space-x-2">
          {users.map(user => (
            <div
              key={user.clientId}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2"
              style={{ background: user.color, borderColor: 'var(--bg-secondary)', color: 'var(--bg-primary)' }}
              title={user.name}
            >
              {user.name[0]}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
