export default function FileTree() {
  return (
    <div
      className="w-48 h-full border-r flex flex-col overflow-y-auto"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-wider font-semibold border-b"
        style={{
          color: "var(--text-secondary)",
          borderColor: "var(--border)",
          padding: "0.5rem 1rem",
        }}
      >
        Explorer
      </div>
      <div className="px-2">
        <div
          className="flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
          }}
        >
          <span style={{ color: "var(--yellow)" }}>JS</span>
          main.js
        </div>
        <div
          className="flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer"
          style={{
            color: "var(--text-primary)",
          }}
        >
          <span style={{ color: "var(--yellow)" }}>JS</span>
          mockup.js (nu merge)
        </div>
      </div>
    </div>
  );
}
