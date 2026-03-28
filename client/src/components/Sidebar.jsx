import { useState, useRef, useEffect, useCallback } from "react";
import { yAiBlocks, getYText, yFiles, wsProvider } from "../lib/yjs";
import Chat from "./Chat";

// ─── helpers ────────────────────────────────────────────────────────────────

function getCursorLine(editorRef) {
  const pos = editorRef?.current?.getPosition?.();
  return pos ? pos.lineNumber : 1;
}

/** Split text into alternating plain-text / fenced-code segments */
function parseSegments(text) {
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1] || "", content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });
  return parts;
}

const ROLE_META = {
  user:    { label: "You",     accent: "var(--blue)",   bg: "var(--bg-tertiary)" },
  ai:      { label: "AI",      accent: "var(--accent)",  bg: "rgba(203,166,247,0.07)" },
  explain: { label: "Explain", accent: "var(--accent)",  bg: "rgba(203,166,247,0.07)" },
  fix:     { label: "Fixed",   accent: "var(--green)",   bg: "rgba(166,227,161,0.07)" },
  tests:   { label: "Tests",   accent: "var(--yellow)",  bg: "rgba(249,226,175,0.07)" },
  error:   { label: "Error",   accent: "var(--red)",     bg: "rgba(243,139,168,0.08)" },
};

// ─── AiMessage ───────────────────────────────────────────────────────────────

function AiMessage({ msg, onDelete }) {
  const [copied, setCopied] = useState(false);
  const meta = ROLE_META[msg.role] || ROLE_META.ai;
  const segments = parseSegments(msg.content || "");

  const copy = () => {
    navigator.clipboard.writeText(msg.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative rounded-lg px-3 py-2.5 text-xs"
      style={{ background: meta.bg, border: `1px solid ${meta.accent}22` }}>

      {/* Header row */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.accent }}>
          {meta.label}
          {msg.ts && (
            <span className="ml-2 font-normal opacity-50">
              {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {msg.role !== "user" && (
            <button onClick={copy} title="Copy"
              className="rounded px-1.5 py-0.5 text-[10px] hover:opacity-80"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              {copied ? "✓" : "⎘"}
            </button>
          )}
          <button onClick={onDelete} title="Delete message"
            className="rounded px-1.5 py-0.5 text-[10px] hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--red)" }}>
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i} className="whitespace-pre-wrap">{seg.content}</span>
          ) : (
            <div key={i} className="relative my-1.5 rounded overflow-x-auto"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
              {seg.lang && (
                <span className="absolute right-2 top-1 text-[9px] opacity-40 select-none">
                  {seg.lang}
                </span>
              )}
              <pre className="p-2 text-[11px] font-mono leading-relaxed overflow-x-auto">
                <code>{seg.content}</code>
              </pre>
            </div>
          )
        )}
      </div>

      {msg.blockId && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px]" style={{ color: "var(--text-secondary)" }}>
          <span>↗</span><span>Suggestion block inserted in editor</span>
        </div>
      )}
    </div>
  );
}

// ─── Thinking dots ───────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <span key={i} className="block h-1.5 w-1.5 rounded-full animate-bounce"
          style={{ background: "var(--accent)", animationDelay: `${i * 0.15}s` }} />
      ))}
      <span className="ml-1 text-[10px]" style={{ color: "var(--text-secondary)" }}>AI is thinking…</span>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { key: "explain",  icon: "◎", label: "Explain",   title: "Explain selected code" },
  { key: "fix",      icon: "⚡", label: "Fix",       title: "Fix errors from last run" },
  { key: "tests",    icon: "⬡", label: "Tests",     title: "Generate test file" },
];

export default function Sidebar({ editorRef, activeFile, language, output }) {
  const [tab, setTab]       = useState("ai");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [users, setUsers]       = useState([]);
  const scrollRef   = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Presence
  useEffect(() => {
    const awareness = wsProvider.awareness;
    const update = () => {
      const s = [];
      awareness.getStates().forEach((state, clientId) => {
        if (state.user) s.push({ ...state.user, clientId });
      });
      setUsers(s);
    };
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, []);

  const addMsg = (msg) =>
    setMessages(prev => [...prev, { ...msg, ts: Date.now() }]);

  const deleteMsg = (index) =>
    setMessages(prev => prev.filter((_, i) => i !== index));

  // ── Ask AI (suggest + code block) ─────────────────────────────────────────
  const handleAsk = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    const userMsg = prompt.trim();
    addMsg({ role: "user", content: userMsg });
    setPrompt("");
    setLoading(true);
    try {
      const code = activeFile ? getYText(activeFile).toString() : "";
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, prompt: userMsg, language: language || "javascript" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      addMsg({ role: "ai", content: data.explanation, blockId: data.id });
      yAiBlocks.set(data.id, {
        id: data.id,
        suggestion: data.suggestion,
        explanation: data.explanation,
        status: "pending",
        line: getCursorLine(editorRef),
      });
    } catch (err) {
      addMsg({ role: "error", content: err.message });
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, activeFile, language, editorRef]);

  // ── Quick actions ──────────────────────────────────────────────────────────
  const handleQuick = useCallback(async (action) => {
    if (loading) return;
    setLoading(true);
    try {
      if (action === "explain") {
        const editor = editorRef?.current?.getEditor?.();
        const selection = editor?.getModel()?.getValueInRange(editor.getSelection());
        if (!selection?.trim()) throw new Error("Select some code first.");
        const res = await fetch("/api/ai/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selection, language }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        addMsg({ role: "explain", content: data.explanation });

      } else if (action === "fix") {
        const stderrLines = (output || [])
          .filter(l => l.type === "stderr").map(l => l.text).join("\n");
        if (!stderrLines.trim()) throw new Error("No errors found in last run output.");
        const code = activeFile ? getYText(activeFile).toString() : "";
        const res = await fetch("/api/ai/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, error: stderrLines, language }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.fixed && activeFile) {
          const yText = getYText(activeFile);
          yText.delete(0, yText.length);
          yText.insert(0, data.fixed);
        }
        addMsg({ role: "fix", content: data.explanation });

      } else if (action === "tests") {
        if (!activeFile) throw new Error("No active file.");
        const code = getYText(activeFile).toString();
        const res = await fetch("/api/ai/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const ext = activeFile.includes(".") ? activeFile.split(".").pop() : "js";
        const base = activeFile.replace(/\.[^.]+$/, "");
        const testFile = `${base}.test.${ext}`;
        yFiles.set(testFile, { language });
        getYText(testFile).insert(0, data.tests);
        addMsg({ role: "tests", content: `Test file created: **${testFile}**` });
      }
    } catch (err) {
      addMsg({ role: "error", content: err.message });
    } finally {
      setLoading(false);
    }
  }, [loading, activeFile, language, output, editorRef]);

  const TABS = [
    { id: "ai",       label: "AI" },
    { id: "chat",     label: "Chat" },
    { id: "presence", label: "Who's Here" },
  ];

  return (
    <div className="flex h-full w-72 flex-col border-l"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className="flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{
              color: tab === t.id ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── AI tab ── */}
      {tab === "ai" && (
        <>
          {/* AI header */}
          <div className="flex shrink-0 items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                AI Assistant
              </span>
              <span className="text-[10px] rounded px-1.5 py-0.5"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                Llama 3.3
              </span>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])}
                className="text-[10px] rounded px-2 py-0.5 hover:opacity-80 transition-opacity"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                title="Clear conversation">
                Clear
              </button>
            )}
          </div>

          {/* Quick action pills */}
          <div className="flex shrink-0 gap-1 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            {QUICK_ACTIONS.map(a => (
              <button key={a.key} type="button"
                onClick={() => handleQuick(a.key)}
                disabled={loading}
                title={a.title}
                className="flex flex-1 items-center justify-center gap-1 rounded-full py-1 text-[10px] font-semibold transition-all hover:opacity-90"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  opacity: loading ? 0.5 : 1,
                }}>
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && !loading && (
              <div className="mt-10 flex flex-col items-center gap-3 text-center">
                <div className="text-2xl">✦</div>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Ask anything about your code.
                  <br />
                  <span className="opacity-60">Suggestions appear as editor blocks.</span>
                </p>
                <div className="mt-2 space-y-1 w-full">
                  {[
                    "Refactor this function",
                    "Add error handling",
                    "Write a docstring",
                  ].map(hint => (
                    <button key={hint} type="button"
                      onClick={() => { setPrompt(hint); textareaRef.current?.focus(); }}
                      className="w-full rounded-lg px-3 py-1.5 text-left text-[11px] hover:opacity-80 transition-opacity"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                      {hint} →
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <AiMessage key={i} msg={msg} onDelete={() => deleteMsg(i)} />
            ))}

            {loading && <ThinkingDots />}
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
            <div className="relative rounded-lg border"
              style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)" }}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); }
                }}
                placeholder="Ask AI… (Enter to send, Shift+Enter for newline)"
                rows={3}
                className="w-full resize-none rounded-lg bg-transparent p-2.5 pb-8 text-xs outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>
                  {prompt.length > 0 ? `${prompt.length} chars` : ""}
                </span>
                <button type="button" onClick={handleAsk}
                  disabled={loading || !prompt.trim()}
                  className="rounded px-2.5 py-1 text-[10px] font-bold transition-all"
                  style={{
                    background: prompt.trim() && !loading ? "var(--accent)" : "var(--bg-primary)",
                    color: prompt.trim() && !loading ? "var(--bg-primary)" : "var(--text-secondary)",
                  }}>
                  {loading ? "…" : "Send ↵"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Chat tab ── */}
      {tab === "chat" && <Chat />}

      {/* ── Who's Here tab ── */}
      {tab === "presence" && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}>
            {users.length} user{users.length !== 1 ? "s" : ""} in this room
          </p>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.clientId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                style={{ background: "var(--bg-tertiary)" }}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: u.color, color: "#1e1e2e" }}>
                  {u.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{u.name}</p>
                  <p className="text-[9px]" style={{ color: "var(--text-secondary)" }}>editing</p>
                </div>
                <div className="ml-auto h-2 w-2 rounded-full" style={{ background: "var(--green)" }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
