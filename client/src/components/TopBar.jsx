import { useState, useEffect } from 'react'
import { wsProvider } from '../lib/yjs'

const LANGUAGES = ['javascript', 'python', 'rust', 'typescript', 'html', 'css', 'json']

export default function TopBar({ language, onLanguageChange }) {
  const [users, setUsers] = useState([])

  useEffect(() => {
    const awareness = wsProvider.awareness
    const update = () => {
      const states = []
      awareness.getStates().forEach((state, clientId) => {
        if (state.user) {
          states.push({ ...state.user, clientId })
        }
      })
      setUsers(states)
    }
    awareness.on('change', update)
    update()
    return () => awareness.off('change', update)
  }, [])

  return (
    <div className="flex items-center justify-between h-11 px-4 border-b"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3">
        <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>
          iTECify
        </span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          main.js
        </span>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          className="text-xs px-2 py-1 rounded border outline-none cursor-pointer"
          style={{
            background: 'var(--bg-tertiary)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {LANGUAGES.map(lang => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>

        <button
          className="text-xs font-semibold px-3 py-1 rounded"
          style={{ background: 'var(--green)', color: 'var(--bg-primary)' }}
        >
          ▶ Run
        </button>

        <div className="flex items-center -space-x-2">
          {users.map(user => (
            <div
              key={user.clientId}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2"
              style={{
                background: user.color,
                borderColor: 'var(--bg-secondary)',
                color: 'var(--bg-primary)',
              }}
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
