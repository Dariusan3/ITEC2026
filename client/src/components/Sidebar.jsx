import { useState, useRef, useEffect, useCallback } from "react";
import { yAiBlocks, getYText, yFiles, wsProvider } from "../lib/yjs";
import { SERVER_URL } from "../lib/config";
import Chat from "./Chat";

// ─── helpers ────────────────────────────────────────────────────────────────

function getCursorLine(editorRef) {
  const pos = editorRef?.current?.getPosition?.();
  return pos ? pos.lineNumber : 1;
}

/** Extrage un număr de linie din ieșirea compilatorului / runtime (pentru Fix AI). */
function extractErrorLineHint(text) {
  if (!text) return null;
  const patterns = [
    /:(\d+):\d+:/,
    /:(\d+):(?:\d+:)?\s/,
    /line\s+(\d+)/i,
    /at line\s+(\d+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** Construiește contextul de eroare: stderr + linii stdout care par diagnostice. */
function buildFixErrorContext(output) {
  if (!output?.length) return "";
  const lines = [];
  const errLike =
    /error|traceback|syntaxerror|referenceerror|exception|warning:|fatal|cannot find|unexpected/i;
  for (const row of output) {
    if (row.type === "stderr") {
      if (!row.text.includes("Warning: dangerous pattern"))
        lines.push(row.text);
      continue;
    }
    if (row.type === "stdout" && errLike.test(row.text)) lines.push(row.text);
  }
  return lines.join("\n").trim();
}

/** Split text into alternating plain-text / fenced-code segments */
function parseSegments(text) {
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0,
    m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1] || "", content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length)
    parts.push({ type: "text", content: text.slice(last) });
  return parts;
}

const ROLE_META = {
  user: { label: "You", accent: "var(--blue)", bubble: true },
  ai: { label: "AI", accent: "var(--accent)", bubble: false, aiIcon: true },
  explain: { label: "Explain", accent: "var(--accent)", bubble: false },
  fix: { label: "Fixed", accent: "var(--green)", bubble: false },
  tests: { label: "Tests", accent: "var(--yellow)", bubble: false },
  error: { label: "Error", accent: "var(--red)", bubble: false },
};

/** Mic spark / AI glyph — același limbaj vizual ca badge-ul de chat */
function AiGlyph({ className = "", style }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      <path d="M6.34 6.34l1.42 1.42M16.24 16.24l1.42 1.42M6.34 17.66l1.42-1.42M16.24 7.76l1.42-1.42" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Buton icon pentru mesaje — delete / copy */
function MsgActionBtn({ onClick, title, variant, children }) {
  const isDanger = variant === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all duration-150 hover:brightness-110 active:scale-[0.92] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)]"
      style={{
        background: isDanger
          ? "color-mix(in srgb, var(--red) 6%, var(--bg-tertiary))"
          : "var(--bg-tertiary)",
        borderColor: "var(--border)",
        color: isDanger ? "var(--red)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

function TrashIcon({ size = 11 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
    </svg>
  );
}

function CopyIcon({ size = 11 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 11 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// ─── AiMessage ───────────────────────────────────────────────────────────────

function AiMessage({ msg, onDelete }) {
  const [copied, setCopied] = useState(false);
  const meta = ROLE_META[msg.role] || ROLE_META.ai;
  const segments = parseSegments(msg.content || "");
  const isUser = meta.bubble;

  const copy = () => {
    navigator.clipboard.writeText(msg.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const timeStr = msg.ts
    ? new Date(msg.ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  /* ── User message: bulă la dreapta; ștergere în stânga bulei (fără suprapunere pe text) ── */
  if (isUser) {
    return (
      <div className="group/msg flex flex-col items-end gap-0.5">
        <div className="flex max-w-full flex-row-reverse items-start gap-1">
          <div
            className="max-w-[82%] rounded-xl rounded-tr-sm px-2.5 py-1.5"
            style={{
              background:
                "color-mix(in srgb, var(--blue) 15%, var(--bg-tertiary))",
              border:
                "1px solid color-mix(in srgb, var(--blue) 20%, var(--border))",
              padding: "4px",
            }}
          >
            <p
              className="whitespace-pre-wrap break-words text-[11px] leading-snug"
              style={{ color: "var(--text-primary)" }}
            >
              {msg.content}
            </p>
          </div>
          <div className="shrink-0 pt-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
            <MsgActionBtn
              onClick={onDelete}
              title="Șterge mesajul"
              variant="danger"
            >
              <TrashIcon />
            </MsgActionBtn>
          </div>
        </div>
        {timeStr && (
          <span
            className="mr-0.5 text-[9px] tabular-nums opacity-40"
            style={{ color: "var(--text-secondary)" }}
          >
            {timeStr}
          </span>
        )}
      </div>
    );
  }

  /* ── AI / system message: no bubble, flowing text ── */
  return (
    <div className="group/msg">
      {/* Label + time + actions */}
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="inline-flex h-[22px] items-center gap-1 rounded-md border pl-1 pr-1.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            background: `color-mix(in srgb, ${meta.accent} 14%, var(--bg-tertiary))`,
            borderColor: `color-mix(in srgb, ${meta.accent} 22%, var(--border))`,
            color: meta.accent,
            padding: "10px",
          }}
        >
          {meta.aiIcon ? (
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded"
              style={{
                background: `color-mix(in srgb, ${meta.accent} 20%, var(--bg-primary))`,
                color: meta.accent,
              }}
            >
              <AiGlyph className="opacity-95" />
            </span>
          ) : null}
          <span className={meta.aiIcon ? "pr-0.5" : "pl-1.5"}>
            {meta.label}
          </span>
        </span>
        {timeStr && (
          <span
            className="text-[9px] tabular-nums opacity-35"
            style={{ color: "var(--text-secondary)" }}
          >
            {timeStr}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
          <MsgActionBtn onClick={copy} title="Copiază mesajul">
            {copied ? <CheckIcon /> : <CopyIcon />}
          </MsgActionBtn>
          <MsgActionBtn
            onClick={onDelete}
            title="Șterge mesajul"
            variant="danger"
          >
            <TrashIcon />
          </MsgActionBtn>
        </div>
      </div>

      {/* Content */}
      <div
        className="text-[11px] leading-relaxed"
        style={{ color: "var(--text-primary)" }}
      >
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i} className="whitespace-pre-wrap break-words">
              {seg.content}
            </span>
          ) : (
            <div
              key={i}
              className="my-1.5 overflow-hidden rounded"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {seg.lang && (
                <div
                  className="border-b px-2 py-0.5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span
                    className="text-[8px] font-medium uppercase tracking-wider opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {seg.lang}
                  </span>
                </div>
              )}
              <pre className="overflow-x-auto p-2 text-[10px] font-mono leading-snug">
                <code>{seg.content}</code>
              </pre>
            </div>
          ),
        )}
      </div>

      {msg.blockId && (
        <div
          className="mt-1 inline-flex items-center gap-1 text-[9px] opacity-60"
          style={{ color: "var(--accent)" }}
        >
          <span>↗</span>
          <span>Suggestion inserted</span>
        </div>
      )}
    </div>
  );
}

// ─── Thinking dots ───────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-1 w-1 rounded-full animate-bounce"
          style={{
            background: "var(--accent)",
            animationDelay: `${i * 0.15}s`,
            opacity: 0.6,
          }}
        />
      ))}
      <span
        className="ml-1 text-[9px] opacity-50"
        style={{ color: "var(--text-secondary)" }}
      >
        thinking…
      </span>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    key: "explain",
    icon: "◎",
    label: "Explain",
    title: "Explain selected code",
  },
  { key: "fix", icon: "⚡", label: "Fix", title: "Fix errors from last run" },
  { key: "tests", icon: "⬡", label: "Tests", title: "Generate test file" },
];

export default function Sidebar({ editorRef, activeFile, language, output }) {
  const [tab, setTab] = useState("ai");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
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
    setMessages((prev) => [...prev, { ...msg, ts: Date.now() }]);

  const deleteMsg = (index) =>
    setMessages((prev) => prev.filter((_, i) => i !== index));

  // ── Ask AI (suggest + code block) ─────────────────────────────────────────
  const handleAsk = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    const userMsg = prompt.trim();
    addMsg({ role: "user", content: userMsg });
    setPrompt("");
    setLoading(true);
    try {
      const code = activeFile ? getYText(activeFile).toString() : "";
      const res = await fetch(`${SERVER_URL}/api/ai/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          prompt: userMsg,
          language: language || "javascript",
        }),
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
  const handleQuick = useCallback(
    async (action) => {
      if (loading) return;
      setLoading(true);
      try {
        if (action === "explain") {
          const editor = editorRef?.current?.getEditor?.();
          const selection = editor
            ?.getModel()
            ?.getValueInRange(editor.getSelection());
          if (!selection?.trim()) throw new Error("Select some code first.");
          const res = await fetch(`${SERVER_URL}/api/ai/explain`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selection, language }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          addMsg({ role: "explain", content: data.explanation });
        } else if (action === "fix") {
          const errorBlob = buildFixErrorContext(output);
          if (!errorBlob)
            throw new Error(
              "Nu am găsit erori în ultimul run. Rulează din nou cu stderr sau mesaj de compilare în panoul Output.",
            );
          const code = activeFile ? getYText(activeFile).toString() : "";
          const hintLine = extractErrorLineHint(errorBlob);
          const res = await fetch(`${SERVER_URL}/api/ai/fix`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              error: errorBlob,
              language,
              ...(hintLine != null ? { hintLine } : {}),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (data.fixed && activeFile) {
            const yText = getYText(activeFile);
            yText.delete(0, yText.length);
            yText.insert(0, data.fixed);
            const ed = editorRef?.current?.getEditor?.();
            if (ed && hintLine != null) {
              const line = Math.min(
                hintLine,
                ed.getModel()?.getLineCount?.() ?? hintLine,
              );
              ed.revealLineInCenter(line);
              ed.setPosition({ lineNumber: line, column: 1 });
            }
          }
          addMsg({ role: "fix", content: data.explanation });
        } else if (action === "tests") {
          if (!activeFile) throw new Error("No active file.");
          const code = getYText(activeFile).toString();
          const res = await fetch(`${SERVER_URL}/api/ai/tests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, language }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          const ext = activeFile.includes(".")
            ? activeFile.split(".").pop()
            : "js";
          const base = activeFile.replace(/\.[^.]+$/, "");
          const testFile = `${base}.test.${ext}`;
          yFiles.set(testFile, { language });
          getYText(testFile).insert(0, data.tests);
          addMsg({
            role: "tests",
            content: `Test file created: **${testFile}**`,
          });
        }
      } catch (err) {
        addMsg({ role: "error", content: err.message });
      } finally {
        setLoading(false);
      }
    },
    [loading, activeFile, language, output, editorRef],
  );

  const TABS = [
    { id: "ai", label: "AI" },
    { id: "chat", label: "Chat" },
    { id: "presence", label: "Who's Here" },
  ];

  return (
    <div
      className="flex h-full w-72 flex-col border-l"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      {/* Tab bar — same segment style as TopBar, înălțime generoasă */}
      <div
        className="flex shrink-0 items-stretch gap-px border-b px-2 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex min-h-[2.75rem] flex-1 items-center justify-center rounded-none border px-2 py-3 text-[11px] font-semibold uppercase tracking-wider transition-all duration-100 hover:brightness-110 active:scale-[0.95] sm:min-h-[3rem] sm:text-xs"
            style={{
              background: tab === t.id ? "var(--accent)" : "var(--bg-tertiary)",
              color:
                tab === t.id ? "var(--bg-primary)" : "var(--text-secondary)",
              borderColor: tab === t.id ? "var(--accent)" : "var(--border)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── AI tab ── */}
      {tab === "ai" && (
        <>
          {/* AI header */}
          <div
            className="flex min-h-[3rem] shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
              <span
                className="text-[11px] font-bold uppercase tracking-wider sm:text-xs"
                style={{ color: "var(--accent)" }}
              >
                AI Assistant
              </span>
              <span
                className="shrink-0 rounded-none border px-2 py-1 font-mono text-[10px] sm:text-[11px]"
                style={{
                  background: "var(--bg-tertiary)",
                  borderColor: "var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                Llama 3.3
              </span>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="shrink-0 rounded-none border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all hover:brightness-110 active:scale-[0.93] sm:text-[11px]"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  borderColor: "var(--border)",
                }}
                title="Clear conversation"
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-2.5 py-2">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-1.5 px-2 py-10 text-center">
                <span className="text-xl leading-none opacity-25" aria-hidden>
                  ✦
                </span>
                <p
                  className="text-[11px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Ask anything about your code
                </p>
                <p
                  className="text-[10px] leading-snug opacity-50"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Suggestions appear as editor blocks.
                </p>
                <div className="mt-2 w-full space-y-1">
                  {[
                    "Refactor this function",
                    "Add error handling",
                    "Write a docstring",
                  ].map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() => {
                        setPrompt(hint);
                        textareaRef.current?.focus();
                      }}
                      className="w-full rounded px-2.5 py-2 text-left text-[11px] font-medium transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {hint} →
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg, i) => (
                <AiMessage key={i} msg={msg} onDelete={() => deleteMsg(i)} />
              ))}
            </div>

            {loading && <ThinkingDots />}
          </div>

          {/* Input area */}
          <div
            className="shrink-0 border-t p-3 space-y-2"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Quick actions — deasupra textarea */}
            <div className="flex gap-0.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => handleQuick(a.key)}
                  disabled={loading}
                  title={a.title}
                  className="flex flex-1 flex-col items-center justify-center gap-1 rounded-none  py-3 text-[10px] font-semibold uppercase tracking-wide transition-all duration-100 hover:brightness-110 active:scale-[0.93] disabled:pointer-events-none disabled:opacity-45"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    minHeight: "2.25rem",
                  }}
                >
                  <span className="text-base leading-none">{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>

            <div
              className="relative rounded-none border"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
              }}
            >
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                placeholder="Ask AI… (Enter to send, Shift+Enter for newline)"
                rows={3}
                className="w-full resize-none bg-transparent p-2.5 pb-8 text-xs outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                <span
                  className="text-[9px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {prompt.length > 0 ? `${prompt.length} chars` : ""}
                </span>
                <button
                  type="button"
                  onClick={handleAsk}
                  disabled={loading || !prompt.trim()}
                  className="rounded-none border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-all duration-100 hover:brightness-110 active:scale-[0.93] disabled:pointer-events-none disabled:opacity-45"
                  style={{
                    background:
                      prompt.trim() && !loading
                        ? "var(--accent)"
                        : "var(--bg-tertiary)",
                    borderColor:
                      prompt.trim() && !loading
                        ? "var(--accent)"
                        : "var(--border)",
                    color:
                      prompt.trim() && !loading
                        ? "var(--bg-primary)"
                        : "var(--text-secondary)",
                  }}
                >
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex min-h-[3rem] shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:gap-2.5"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-wider sm:text-xs"
              style={{ color: "var(--accent)" }}
            >
              Who&apos;s Here
            </span>
            <span
              className="shrink-0 rounded-none border px-2 py-1 font-mono text-[10px] sm:text-[11px]"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {users.length} online
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {users.length === 0 && (
              <p
                className="mb-2 text-[11px] sm:text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                No one else connected yet.
              </p>
            )}
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.clientId}
                  className="flex items-center gap-2.5 rounded-none border px-2.5 py-2"
                  style={{
                    background: "var(--bg-tertiary)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: u.color, color: "#1e1e2e" }}
                  >
                    {u.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-xs font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {u.name}
                    </p>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      editing
                    </p>
                  </div>
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: "var(--green)" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
