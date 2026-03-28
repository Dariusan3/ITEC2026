import { useEffect, useRef } from 'react'

const THEMES = [
  { id: 'vs-dark',         label: 'Dark (default)' },
  { id: 'vs',              label: 'Light' },
  { id: 'hc-black',        label: 'High Contrast' },
]

const KEYMAPS = [
  { id: 'default', label: 'Default' },
  { id: 'vim',     label: 'Vim' },
  { id: 'emacs',   label: 'Emacs' },
]

export default function SettingsPanel({ settings, onChange, onClose }) {
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const set = (key, value) => onChange({ ...settings, [key]: value })

  return (
    <div
      ref={ref}
      className="absolute right-2 top-10 z-50 rounded-lg border shadow-xl p-4 w-72 flex flex-col gap-3"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
          Editor Settings
        </span>
        <button onClick={onClose} className="text-xs hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>✕</button>
      </div>

      {/* Theme */}
      <Row label="Theme">
        <Select value={settings.theme} onChange={v => set('theme', v)}>
          {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </Row>

      {/* Keymap */}
      <Row label="Keymap">
        <Select value={settings.keymap} onChange={v => set('keymap', v)}>
          {KEYMAPS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </Select>
      </Row>

      {/* Font size */}
      <Row label={`Font size — ${settings.fontSize}px`}>
        <input
          type="range" min={10} max={24} step={1}
          value={settings.fontSize}
          onChange={e => set('fontSize', Number(e.target.value))}
          className="w-full accent-violet-400"
        />
      </Row>

      {/* Tab size */}
      <Row label="Tab size">
        <div className="flex gap-1">
          {[2, 4, 8].map(n => (
            <button
              key={n}
              onClick={() => set('tabSize', n)}
              className="flex-1 text-xs py-0.5 rounded"
              style={{
                background: settings.tabSize === n ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: settings.tabSize === n ? 'var(--bg-primary)' : 'var(--text-secondary)',
              }}
            >{n}</button>
          ))}
        </div>
      </Row>

      {/* Toggles */}
      <Row label="Word wrap">
        <Toggle value={settings.wordWrap} onChange={v => set('wordWrap', v)} />
      </Row>
      <Row label="Minimap">
        <Toggle value={settings.minimap} onChange={v => set('minimap', v)} />
      </Row>
      <Row label="Line numbers">
        <Toggle value={settings.lineNumbers} onChange={v => set('lineNumbers', v)} />
      </Row>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full text-xs px-2 py-1 rounded outline-none"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
    >
      {children}
    </select>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-10 h-5 rounded-full relative transition-colors flex-shrink-0 float-right"
      style={{ background: value ? 'var(--accent)' : 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{
          background: value ? 'var(--bg-primary)' : 'var(--text-secondary)',
          left: value ? '22px' : '2px',
        }}
      />
    </button>
  )
}
