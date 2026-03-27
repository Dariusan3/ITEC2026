import { useState, useEffect, useRef } from 'react'
import Terminal from './Terminal'

export default function OutputPanel({ output }) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState('output')
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
        <button
          className="text-xs px-2 py-1 hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => setCollapsed(true)}
        >
          ▼
        </button>
      </div>

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
