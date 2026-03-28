import { useState, useEffect, useRef } from "react";
import Terminal from "./Terminal";

const MAX_HISTORY = 20;

export default function OutputPanel({
  output,
  stdin,
  onStdinChange,
  packages,
  onPackagesChange,
  envVars,
  onEnvVarsChange,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState("output");
  const [stdinOpen, setStdinOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("itecify:run-history") || "[]");
    } catch {
      return [];
    }
  });
  const scrollRef = useRef(null);

  // Persist run history
  useEffect(() => {
    if (!output || output.length === 0) return;
    const firstLine = output.find((l) => l.type !== "info");
    if (!firstLine) return;
    const entry = {
      ts: Date.now(),
      preview: firstLine.text.slice(0, 60),
      hasError: output.some((l) => l.type === "stderr"),
      lines: output,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY);
      localStorage.setItem("itecify:run-history", JSON.stringify(next));
      return next;
    });
  }, [output]);

  useEffect(() => {
    if (output && !collapsed) {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [output, collapsed]);

  const downloadOutput = () => {
    if (!output) return;
    const text = output.map((l) => l.text).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (collapsed) {
    return (
      <div
        className="flex h-8 min-h-8 shrink-0 cursor-pointer items-center px-3"
        style={{
          background: "var(--bg-secondary)",
        }}
        onClick={() => setCollapsed(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setCollapsed(false);
        }}
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
      className="flex h-[13.5rem] min-h-[11rem] max-h-[40vh] shrink-0 flex-col"
      style={{
        background: "var(--bg-secondary)",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex w-full shrink-0 flex-wrap items-center justify-between gap-2 px-2 py-1.5 sm:px-3"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          className="flex min-w-0 items-center gap-2 rounded-none p-1 sm:gap-3"
          role="tablist"
          aria-label="Output, Terminal sau istoric"
        >
          <PanelTab
            selected={tab === "output"}
            onClick={() => setTab("output")}
          >
            Output
          </PanelTab>
          <PanelTab
            selected={tab === "terminal"}
            onClick={() => setTab("terminal")}
          >
            Terminal
          </PanelTab>
          <PanelTab
            selected={tab === "history"}
            onClick={() => setTab("history")}
          >
            History{" "}
            {history.length > 0 && (
              <span className="opacity-60">({history.length})</span>
            )}
          </PanelTab>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {output && tab === "output" && (
            <button
              type="button"
              onClick={downloadOutput}
              className="rounded-none px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:opacity-80"
              style={{
                color: "var(--text-secondary)",
                marginRight: "10px",
              }}
              title="Download output as .txt"
            >
              Save
            </button>
          )}
          <button
            type="button"
            className="rounded-none px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors hover:opacity-90"
            style={{
              color: stdinOpen ? "var(--accent)" : "var(--text-secondary)",
              background: stdinOpen ? "var(--bg-tertiary)" : "transparent",
            }}
            onClick={() => setStdinOpen((o) => !o)}
          >
            stdin / pkgs
          </button>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none text-xs font-semibold transition-opacity hover:opacity-90"
            style={{
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
      </div>

      {/* Stdin + Packages + Env vars panel */}
      {stdinOpen && tab !== "terminal" && (
        <div className="space-y-2 overflow-auto max-h-48 px-3 py-2">
          <div>
            <Label>stdin</Label>
            <textarea
              value={stdin}
              onChange={(e) => onStdinChange(e.target.value)}
              placeholder="Each line = one line of stdin..."
              rows={2}
              className="w-full text-xs p-1.5 rounded border resize-none outline-none font-mono"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div>
            <Label>packages (npm/pip)</Label>
            <input
              value={packages}
              onChange={(e) => onPackagesChange(e.target.value)}
              placeholder="e.g. lodash axios  or  numpy pandas"
              className="w-full text-xs p-1.5 rounded border outline-none font-mono"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div>
            <Label>env vars (KEY=VALUE, one per line)</Label>
            <textarea
              value={envVars}
              onChange={(e) => onEnvVarsChange(e.target.value)}
              placeholder={"API_KEY=abc\nDEBUG=1"}
              rows={2}
              className="w-full text-xs p-1.5 rounded border resize-none outline-none font-mono"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "output" && (
          <div
            ref={scrollRef}
            className="h-full overflow-auto p-2.5 font-mono text-[11px] whitespace-pre-wrap"
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
        )}
        {tab === "terminal" && (
          <div className="h-full min-h-0">
            <Terminal />
          </div>
        )}
        {tab === "history" && (
          <div className="h-full overflow-auto p-2 space-y-1">
            {history.length === 0 ? (
              <p
                className="text-xs mt-4 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                No runs yet.
              </p>
            ) : (
              history.map((entry, i) => (
                <div
                  key={i}
                  className="rounded border px-2 py-1.5 cursor-pointer hover:opacity-80"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-tertiary)",
                  }}
                  onClick={() => {
                    setHistoryOpen(i === historyOpen ? null : i);
                    setTab("output");
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[10px] font-mono truncate"
                      style={{
                        color: entry.hasError
                          ? "var(--red)"
                          : "var(--text-primary)",
                      }}
                    >
                      {entry.hasError ? "✗ " : "✓ "}
                      {entry.preview}
                    </span>
                    <span
                      className="text-[9px] shrink-0"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <p
      className="text-[9px] uppercase tracking-wider mb-1"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </p>
  );
}

function PanelTab({ selected, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className="min-h-8 rounded-none px-6 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors sm:px-8 sm:text-[11px]"
      style={{
        border: "none",
        cursor: "pointer",
        background: selected ? "var(--accent)" : "transparent",
        color: selected ? "var(--bg-primary)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}
