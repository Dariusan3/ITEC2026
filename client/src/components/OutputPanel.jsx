import { useState, useEffect, useRef } from "react";
import Terminal from "./Terminal";

export default function OutputPanel({ output }) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState("output");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (output && !collapsed) {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [output, collapsed]);

  if (collapsed) {
    return (
      <div
        className="flex h-8 min-h-8 shrink-0 cursor-pointer items-center border-t px-3 sm:px-4"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
        onClick={() => setCollapsed(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed(false);
          }
        }}
        aria-expanded={false}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          ▶ Output &amp; Terminal
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex h-[13.5rem] min-h-[11rem] max-h-[40vh] shrink-0 flex-col border-t sm:h-52"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="flex w-full shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5 sm:px-3"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div
          className="flex items-center "
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-primary)",
            gap: "10px",
          }}
          role="tablist"
          aria-label="Output sau Terminal"
        >
          <PanelTab
            id="tab-output"
            selected={tab === "output"}
            onClick={() => setTab("output")}
          >
            Output
          </PanelTab>
          <PanelTab
            id="tab-terminal"
            selected={tab === "terminal"}
            onClick={() => setTab("terminal")}
          >
            Terminal
          </PanelTab>
        </div>

        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border text-xs font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
          }}
          onClick={() => setCollapsed(true)}
          aria-label="Restrânge panoul"
          title="Restrânge"
        >
          ▾
        </button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-hidden"
        role="tabpanel"
        aria-labelledby={tab === "output" ? "tab-output" : "tab-terminal"}
      >
        {tab === "output" ? (
          <div
            ref={scrollRef}
            className="h-full overflow-auto p-2.5 font-mono text-[11px] whitespace-pre-wrap sm:p-3 sm:text-sm"
            style={{ color: "var(--text-primary)" }}
          >
            {output ? (
              output.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color:
                      line.type === "stderr"
                        ? "var(--red)"
                        : line.type === "info"
                          ? "var(--text-secondary)"
                          : "var(--text-primary)",
                    fontStyle: line.type === "info" ? "italic" : "normal",
                  }}
                >
                  {line.text}
                </div>
              ))
            ) : (
              <span style={{ color: "var(--accent-dim)" }}>
                // Run your code to see output here
              </span>
            )}
          </div>
        ) : (
          <div className="h-full min-h-0">
            <Terminal />
          </div>
        )}
      </div>
    </div>
  );
}

function PanelTab({ id, selected, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      tabIndex={0}
      onClick={onClick}
      className="min-h-8 rounded-none px-6 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors sm:px-8 sm:text-[11px]"
      style={{
        border: "none",
        cursor: "pointer",
        background: selected ? "var(--accent)" : "transparent",
        color: selected ? "var(--bg-primary)" : "var(--text-secondary)",
        padding: "0 10px 0 10px",
      }}
    >
      {children}
    </button>
  );
}
