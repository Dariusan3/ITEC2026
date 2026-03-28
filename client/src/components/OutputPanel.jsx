import { useState, useEffect, useRef } from 'react'
import Terminal from './Terminal'

export default function OutputPanel({ output, stdin, onStdinChange, packages, onPackagesChange }) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState('output')
  const [stdinOpen, setStdinOpen] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (output && !collapsed) {
      setTab('output')
      setCollapsed(false)
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
    }
  }, [output, collapsed])

  if (collapsed) {
    return (
      <div
        className="h-8 flex items-center px-3 border-t cursor-pointer"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        onClick={() => setCollapsed(false)}
      >
        <span className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--text-secondary)' }}>
          ▶ Output
        </span>
      </div>
    )
  }

  return (
    <div className="h-56 flex flex-col border-t"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>

      {/* Tab bar */}
      <div className="flex items-center justify-between px-1 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex">
          <TabButton active={tab === 'output'} onClick={() => setTab('output')}>Output</TabButton>
          <TabButton active={tab === 'terminal'} onClick={() => setTab('terminal')}>Terminal</TabButton>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStdinOpen(o => !o)}
            className="text-[10px] px-2 py-1 rounded font-semibold transition-colors"
            style={{
              color: stdinOpen ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${stdinOpen ? 'var(--accent)' : 'var(--border)'}`,
            }}
            title="Toggle stdin / packages"
          >stdin {packages?.trim() ? '· pkgs' : ''}</button>
          <button
            className="text-xs px-2 py-1 hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setCollapsed(true)}
          >▼</button>
        </div>
      </div>

      {/* Stdin + Packages panel */}
      {stdinOpen && tab === 'output' && (
        <div className="px-3 py-2 border-b space-y-2" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
              stdin — input for your program
            </p>
            <textarea
              value={stdin}
              onChange={e => onStdinChange(e.target.value)}
              placeholder="Each line = one line of stdin..."
              rows={2}
              className="w-full text-xs p-2 rounded border resize-none outline-none font-mono"
              style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
              packages — npm/pip (space or comma separated)
            </p>
            <input
              value={packages}
              onChange={e => onPackagesChange(e.target.value)}
              placeholder="e.g. lodash axios  or  numpy pandas"
              className="w-full text-xs p-2 rounded border outline-none font-mono"
              style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              Requires Docker. Network enabled only for install step.
            </p>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === 'output' ? (
        <div ref={scrollRef} className="flex-1 p-3 overflow-auto font-mono text-xs whitespace-pre-wrap"
          style={{ color: 'var(--text-primary)' }}>
          {output ? (
            output.map((line, i) => (
              <div key={i} style={{
                color: line.type === 'stderr' ? 'var(--red)'
                     : line.type === 'info' ? 'var(--text-secondary)'
                     : 'var(--text-primary)',
                fontStyle: line.type === 'info' ? 'italic' : 'normal',
              }}>
                {line.text}
              </div>
            ))
          ) : (
            <span style={{ color: 'var(--accent-dim)' }}>
              // Run your code to see output here
            </span>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <Terminal />
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] uppercase tracking-wider font-semibold px-3 py-1.5 transition-colors"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {children}
    </button>
  )
}
