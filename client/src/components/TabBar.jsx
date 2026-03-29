import { useRef, useState, useEffect, useCallback } from "react";

const LANG_COLOR = {
  javascript: "#f9e2af",
  typescript: "#89b4fa",
  python: "#a6e3a1",
  rust: "#fab387",
  go: "#89dceb",
  java: "#f38ba8",
  kotlin: "#89b4fa",
  scala: "#f38ba8",
  c: "#fab387",
  cpp: "#fab387",
  html: "#f38ba8",
  css: "#89dceb",
  json: "#cba6f7",
  yaml: "#a6e3a1",
  xml: "#f38ba8",
  markdown: "#cba6f7",
  sql: "#cba6f7",
  toml: "#fab387",
  dockerfile: "#89dceb",
  shell: "#a6e3a1",
  ruby: "#f38ba8",
  php: "#89b4fa",
  lua: "#89b4fa",
  r: "#89b4fa",
  swift: "#fab387",
};

const LANG_ABBR = {
  javascript: "JS",
  typescript: "TS",
  python: "PY",
  rust: "RS",
  go: "GO",
  java: "JV",
  kotlin: "KT",
  scala: "SC",
  c: "C",
  cpp: "C++",
  html: "HT",
  css: "CS",
  json: "{}",
  yaml: "YML",
  xml: "XML",
  markdown: "MD",
  sql: "SQL",
  toml: "TM",
  dockerfile: "DF",
  shell: "SH",
  ruby: "RB",
  php: "PHP",
  lua: "LU",
  r: "R",
  swift: "SW",
};

/** VS-Code-style right-click context menu for a tab */
function TabContextMenu({
  x,
  y,
  filename,
  idx,
  totalTabs,
  onClose,
  onDismiss,
  onCloseOthers,
  onCloseToRight,
  onCloseToLeft,
  onCloseAll,
}) {
  const menuRef = useRef(null);

  // Dismiss on outside click or Escape
  useEffect(() => {
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) onDismiss();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  // Clamp position to viewport
  const style = {
    position: "fixed",
    top: y,
    left: x,
    zIndex: 9999,
    minWidth: 210,
  };

  const items = [
    {
      label: "Close",
      shortcut: "Ctrl+W",
      onClick: () => {
        onClose(filename);
        onDismiss();
      },
    },
    {
      label: "Close Others",
      disabled: totalTabs <= 1,
      onClick: () => {
        onCloseOthers(filename);
        onDismiss();
      },
    },
    {
      label: "Close to the Left",
      disabled: idx === 0,
      onClick: () => {
        onCloseToLeft(filename);
        onDismiss();
      },
    },
    {
      label: "Close to the Right",
      disabled: idx >= totalTabs - 1,
      onClick: () => {
        onCloseToRight(filename);
        onDismiss();
      },
    },
    { divider: true },
    {
      label: "Close All",
      onClick: () => {
        onCloseAll();
        onDismiss();
      },
    },
  ];

  return (
    <div
      ref={menuRef}
      className="rounded-2xl border py-1 shadow-[0_20px_48px_rgba(0,0,0,0.42)]"
      style={{
        ...style,
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div
            key={i}
            className="my-1 mx-2 h-px"
            style={{ background: "var(--border)" }}
          />
        ) : (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={item.onClick}
            className="flex w-full items-center justify-between gap-6 px-3.5 py-2 text-left text-[11px] font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-35"
            style={{
              color: "var(--text-primary)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled)
                e.currentTarget.style.background =
                  "color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-[9px] opacity-40">{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

/** Draggable VS-Code-style file tab bar with right-click context menu. */
export default function TabBar({
  tabs,
  activeFile,
  yFiles,
  onSelect,
  onClose,
  onReorder,
  onCloseOthers,
  onCloseToRight,
  onCloseToLeft,
  onCloseAll,
}) {
  const dragSrc = useRef(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, filename, idx }

  const handleDragStart = (e, idx) => {
    dragSrc.current = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragSrc.current !== idx) {
      setDragOverIdx(idx);
    }
  };

  const handleDrop = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(null);
    const from = dragSrc.current;
    if (from === null || from === idx) return;
    onReorder(from, idx);
    dragSrc.current = null;
  };

  const handleDragEnd = () => {
    dragSrc.current = null;
    setDragOverIdx(null);
  };

  const handleContextMenu = useCallback((e, filename, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, filename, idx });
  }, []);

  const dismissMenu = useCallback(() => setContextMenu(null), []);

  if (tabs.length === 0) return null;

  return (
    <>
      <div
        className="flex items-end overflow-x-auto shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          minHeight: "2.25rem",
        }}
        onDragLeave={() => setDragOverIdx(null)}
      >
        {tabs.map((filename, idx) => {
          const isActive = filename === activeFile;
          const meta = yFiles?.get(filename);
          const lang = meta?.language || "javascript";
          const color = LANG_COLOR[lang] || "#cba6f7";
          const abbr = LANG_ABBR[lang] || "??";
          const shortName = filename.includes("/")
            ? filename.split("/").pop()
            : filename;
          const isDragOver = dragOverIdx === idx;

          return (
            <div
              key={filename}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelect(filename, lang)}
              onContextMenu={(e) => handleContextMenu(e, filename, idx)}
              className="group relative flex shrink-0 cursor-pointer select-none items-center gap-1.5 px-3"
              style={{
                height: "2.25rem",
                maxWidth: "10rem",
                background: isActive
                  ? "var(--bg-primary)"
                  : isDragOver
                    ? "rgba(203,166,247,0.08)"
                    : "transparent",
                borderRight: "1px solid var(--border)",
                borderTop: isActive
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                color: isActive
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                transition: "background 0.1s, color 0.1s",
                outline: isDragOver
                  ? "1px solid rgba(203,166,247,0.4)"
                  : "none",
                outlineOffset: -1,
              }}
            >
              {/* Language badge */}
              <span
                className="shrink-0 font-bold"
                style={{ fontSize: 8, color, minWidth: 14 }}
              >
                {abbr}
              </span>

              {/* Filename */}
              <span
                className="truncate text-[11px] font-medium"
                style={{ maxWidth: "6.5rem" }}
                title={filename}
              >
                {shortName}
              </span>

              {/* Close button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(filename);
                }}
                className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-sm opacity-0 group-hover:opacity-60 hover:opacity-100! transition-opacity"
                style={{
                  color: "var(--text-secondary)",
                  background: "transparent",
                  ...(isActive ? { opacity: 0.5 } : {}),
                }}
                title="Close tab"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                  <path
                    d="M1 1l6 6M7 1L1 7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Right-click context menu — rendered in a portal-like fixed position */}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filename={contextMenu.filename}
          idx={contextMenu.idx}
          totalTabs={tabs.length}
          onClose={onClose}
          onDismiss={dismissMenu}
          onCloseOthers={onCloseOthers}
          onCloseToRight={onCloseToRight}
          onCloseToLeft={onCloseToLeft}
          onCloseAll={onCloseAll}
        />
      )}
    </>
  );
}
