import { useState, useEffect, useRef, useCallback } from "react";
import Terminal from "./Terminal";
import { ArchiveIcon, ChevronRightIcon } from "./ui/Icons";
import { featureFlags } from "../lib/featureFlags";

const MAX_HISTORY = 20;

function EmptyPanel({ title, description, icon = null }) {
  return (
    <div
      className="soft-card mx-3.5 my-3 flex flex-col items-center gap-2 px-4 py-6 text-center"
      style={{ background: "var(--bg-tertiary)" }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-none"
        style={{
          background: "color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))",
          color: "var(--accent)",
        }}
      >
        {icon || <ArchiveIcon className="h-4 w-4" />}
      </div>
      <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p
        className="max-w-[20rem] text-[10px] leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        {description}
      </p>
    </div>
  );
}

export default function OutputPanel({
  output,
  stdin,
  onStdinChange,
  packages,
  onPackagesChange,
  envVars,
  onEnvVarsChange,
  previewIframeSrc = null,
  previewError = null,
  previewNotice = null,
  previewSyncInfo = null,
  previewBusy = false,
  focusPreviewSignal = 0,
  onPreviewStop,
  previewDisabled = false,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState("output");
  const [stdinOpen, setStdinOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panelH, setPanelH] = useState(232);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("itecify:run-history") || "[]");
    } catch {
      return [];
    }
  });
  const scrollRef = useRef(null);
  const dragRef = useRef(null);

  const onDragStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelH;
    const onMove = (ev) => {
      const delta = startY - ev.clientY;
      const next = Math.max(140, Math.min(window.innerHeight * 0.7, startH + delta));
      setPanelH(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelH]);

  useEffect(() => {
    if (focusPreviewSignal > 0) setTab("preview");
  }, [focusPreviewSignal]);

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
        className="panel-shell flex h-9 min-h-9 shrink-0 cursor-pointer items-center gap-2 border-t px-3.5"
        style={{
          borderColor: "var(--border)",
        }}
        onClick={() => setCollapsed(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setCollapsed(false);
        }}
      >
        <ChevronRightIcon className="h-3.5 w-3.5" stroke="var(--text-secondary)" />
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--text-secondary)" }}
        >
          ▶ Output / Terminal / Preview
        </span>
      </div>
    );
  }

  return (
    <div
      className="panel-shell flex shrink-0 flex-col"
      style={{ height: `${panelH}px`, minHeight: 140, maxHeight: "70vh" }}
    >
      {/* Drag handle */}
      <div
        ref={dragRef}
        onMouseDown={onDragStart}
        className="h-1.5 cursor-row-resize select-none hover:bg-[var(--accent)]"
        style={{ background: "var(--border)", transition: "background 0.15s" }}
        title="Trage pentru a redimensiona"
      />
      {/* Tab bar */}
      <div
        className="flex w-full shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-3.5"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          className="soft-card flex min-w-0 items-center gap-1 p-1 sm:gap-1.5"
          role="tablist"
          aria-label="Output, Terminal, Preview sau istoric"
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
          {!previewDisabled && (
            <PanelTab
              selected={tab === "preview"}
              onClick={() => setTab("preview")}
            >
              Preview
            </PanelTab>
          )}
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
          {tab === "preview" && previewIframeSrc && onPreviewStop && (
            <button
              type="button"
              onClick={onPreviewStop}
              className="rounded-none px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:opacity-80"
              style={{ color: "var(--red)", marginRight: "6px" }}
            >
              Stop preview
            </button>
          )}
          {output && tab === "output" && (
            <button
              type="button"
              onClick={downloadOutput}
              className="liquid-surface rounded-none border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide shadow-[0_10px_20px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:opacity-90"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
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
            className="liquid-surface rounded-none border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide shadow-[0_10px_20px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:opacity-90"
            style={{
              borderColor: stdinOpen ? "var(--accent)" : "var(--border)",
              color: stdinOpen ? "var(--accent)" : "var(--text-secondary)",
              background: stdinOpen ? "var(--bg-tertiary)" : "transparent",
            }}
            onClick={() => setStdinOpen((o) => !o)}
            disabled={tab === "preview"}
          >
            stdin / pkgs
          </button>
          <button
            type="button"
            className="liquid-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-none border text-xs font-semibold shadow-[0_10px_20px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:opacity-90"
            style={{
              background: "var(--bg-tertiary)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse panel"
            title="Collapse"
          >
            ▾
          </button>
        </div>
      </div>

      {/* Stdin + Packages + Env vars panel */}
      {stdinOpen && tab !== "terminal" && tab !== "preview" && (
        <div className="space-y-2 overflow-auto max-h-48 px-3.5 py-3">
          <div>
            <Label>stdin (mod batch, nu terminal interactiv)</Label>
            <textarea
              value={stdin}
              onChange={(e) => onStdinChange(e.target.value)}
              placeholder="Each line = one line of stdin..."
              rows={2}
              className="w-full resize-none rounded-none border p-2.5 text-xs font-mono outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <p
              className="mt-1.5 text-[10px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              On Run, <strong>all</strong> text above is sent at once to the program — you cannot type "after each
              prompt" like in a terminal. Put all values here in order (one line per{" "}
              <code className="rounded-none bg-[var(--bg-primary)] px-0.5">scanf</code>). Numbers in prompts (e.g. "enter
              0…9") come from your <code className="rounded-none bg-[var(--bg-primary)] px-0.5">printf</code> / variables,
              not injected automatically by the sandbox.
            </p>
          </div>
          <div>
            <Label>packages (npm/pip)</Label>
            <input
              value={packages}
              onChange={(e) => onPackagesChange(e.target.value)}
              placeholder="e.g. lodash axios  or  numpy pandas"
              className="w-full rounded-none border p-2.5 text-xs font-mono outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
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
              className="w-full resize-none rounded-none border p-2.5 text-xs font-mono outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
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
            className="h-full overflow-auto px-3.5 py-3 font-mono text-[11px] whitespace-pre-wrap"
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
              <EmptyPanel
                title="No output yet"
                description="Run the active file to see logs, results and errors streamed here in real time."
              />
            )}
          </div>
        )}
        {tab === "terminal" && (
          <div className="h-full min-h-0">
            <Terminal />
          </div>
        )}
        {!previewDisabled && tab === "preview" && (
          <div className="flex h-full min-h-0 flex-col">
            {previewIframeSrc && (previewSyncInfo || previewBusy) && (
              <p
                className="shrink-0 px-2 py-1 font-mono text-[10px] leading-snug"
                style={{
                  color: "var(--text-secondary)",
                  background: "var(--bg-tertiary)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {previewBusy
                  ? "Sincronizare preview…"
                  : previewSyncInfo
                    ? `Ultimul sync: ${new Date(previewSyncInfo.at).toLocaleTimeString()} · ` +
                      `${previewSyncInfo.ms} ms · mod ${previewSyncInfo.mode}` +
                      (featureFlags.livePreviewSync ? " · auto-sync" : "")
                    : null}
              </p>
            )}
            {previewNotice && (
              <p
                className="shrink-0 px-2 py-1.5 text-[11px] leading-snug"
                style={{
                  color: "var(--green)",
                  background: "color-mix(in srgb, var(--green) 12%, var(--bg-tertiary))",
                }}
              >
                {previewNotice}
              </p>
            )}
            {previewError && (
              <p
                className="shrink-0 px-2 py-1.5 text-[11px]"
                style={{ color: "var(--red)", background: "var(--bg-tertiary)" }}
              >
                {previewError}
              </p>
            )}
            {!previewIframeSrc ? (
              <p
                className="p-3 text-xs leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                Start <strong>Preview</strong> from the top bar (next to Run). Requires{" "}
                <strong>Docker</strong> and a project with <code className="text-[10px]">package.json</code>{" "}
                (e.g. Vite or Next). Use <strong>Vite demo</strong> to load a React example.
                The preview opens on a local container port (not the same URL as the editor)
                so Vite scripts don't accidentally load the iTECify app.
              </p>
            ) : (
              <iframe
                title="Live preview"
                className="min-h-0 w-full flex-1 border-0 bg-white"
                src={previewIframeSrc}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        )}
        {tab === "history" && (
          <div className="h-full overflow-auto p-2 space-y-1">
            {history.length === 0 ? (
              <EmptyPanel
                title="No run history yet"
                description="Each execution is saved here so you can quickly revisit previous outputs and failures."
              />
            ) : (
              history.map((entry, i) => {
                const expanded = historyOpen === i;

                return (
                  <div
                    key={i}
                    className="cursor-pointer rounded-none border px-3 py-2 transition-all duration-150 hover:-translate-y-px hover:opacity-90"
                    style={{
                      borderColor: expanded ? "var(--accent)" : "var(--border)",
                      background: "var(--bg-tertiary)",
                    }}
                    onClick={() => {
                      setHistoryOpen(expanded ? null : i);
                      setTab("output");
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="min-w-0 flex-1 truncate text-[10px] font-mono"
                        style={{
                          color: entry.hasError
                            ? "var(--red)"
                            : "var(--text-primary)",
                        }}
                      >
                        {entry.hasError ? "✗ " : "✓ "}
                        {entry.preview}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="text-[9px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {new Date(entry.ts).toLocaleTimeString()}
                        </span>
                        <span
                          className="text-[9px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {expanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {expanded && (
                      <div
                        className="mt-2 max-h-36 overflow-auto border-t px-2 pb-2 pt-2 font-mono text-[10px] whitespace-pre-wrap"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {entry.lines.map((line, j) => (
                          <div
                            key={j}
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
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
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
      className="mb-1 text-[9px] uppercase tracking-[0.18em]"
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
      className="liquid-surface min-h-9 rounded-none px-5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all duration-150 hover:-translate-y-px sm:px-6 sm:text-[11px]"
      style={{
        border: selected ? "1px solid var(--accent)" : "1px solid transparent",
        cursor: "pointer",
        background: selected ? "var(--accent)" : "transparent",
        color: selected ? "var(--bg-primary)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}
