export default function Sidebar() {
  return (
    <div className="w-72 h-full border-l flex flex-col"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold px-3 py-2 border-b"
        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
        AI Assistant
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          Click "Ask AI" to get code suggestions powered by Claude.
          <br /><br />
          <span style={{ color: 'var(--accent)' }}>Coming in Phase 2</span>
        </p>
      </div>
    </div>
  )
}
