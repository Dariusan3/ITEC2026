import { useState, useEffect, useRef } from 'react'

export default function OutputPanel({ output }) {
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (output && !collapsed) {
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
    <div className="h-48 flex flex-col border-t"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-1 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--text-secondary)' }}>
          Output
        </span>
        <button
          className="text-xs px-1 hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => setCollapsed(true)}
        >
          ▼
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 p-3 overflow-auto font-mono text-xs whitespace-pre-wrap"
        style={{ color: 'var(--text-primary)' }}>
        {output ? (
          output.map((line, i) => (
            <div key={i} style={{ color: line.type === 'stderr' ? 'var(--red)' : 'var(--text-primary)' }}>
              {line.text}
            </div>
          ))
        ) : (
          <span style={{ color: 'var(--accent-dim)' }}>
            // Run your code to see output here
          </span>
        )}
      </div>
    </div>
  )
}
