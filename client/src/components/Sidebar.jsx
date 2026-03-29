import { useState, useRef, useEffect, useCallback } from "react";
import * as monaco from "monaco-editor";
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

function buildOutline(code, language) {
  if (!code?.trim()) return [];
  const langKey = language === "react-jsx" ? "javascript" : language;

  const patternsByLanguage = {
    javascript: [
      /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
      /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/,
      /^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/,
    ],
    typescript: [
      /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
      /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/,
      /^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/,
      /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/,
      /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/,
    ],
    python: [/^\s*def\s+([A-Za-z0-9_]+)/, /^\s*class\s+([A-Za-z0-9_]+)/],
    go: [/^\s*func\s+([A-Za-z0-9_]+)/, /^\s*type\s+([A-Za-z0-9_]+)/],
    java: [
      /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+([A-Za-z0-9_]+)/,
      /^\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+([A-Za-z0-9_]+)\s*\(/,
    ],
    c: [
      /^\s*[A-Za-z_][\w\s\*]*\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{/,
      /^\s*struct\s+([A-Za-z_]\w*)/,
    ],
    rust: [
      /^\s*fn\s+([A-Za-z0-9_]+)/,
      /^\s*struct\s+([A-Za-z0-9_]+)/,
      /^\s*enum\s+([A-Za-z0-9_]+)/,
      /^\s*impl\s+([A-Za-z0-9_]+)/,
    ],
    html: [/^\s*<([a-zA-Z][\w-]*)\b/],
    css: [/^\s*([.#]?[A-Za-z0-9_-][^{]*)\s*\{/],
  };

  const patterns = patternsByLanguage[langKey] || patternsByLanguage.javascript;

  return code
    .split("\n")
    .map((lineText, index) => {
      for (const pattern of patterns) {
        const match = lineText.match(pattern);
        if (match?.[1]) {
          return {
            id: `${index + 1}-${match[1]}`,
            name: match[1].trim(),
            line: index + 1,
            preview: lineText.trim(),
          };
        }
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 80);
}

const ROLE_META = {
  user: { label: "You", accent: "var(--blue)", bubble: true },
  ai: { label: "AI", accent: "var(--accent)", bubble: false, aiIcon: true },
  explain: { label: "Explain", accent: "var(--accent)", bubble: false },
  fix: { label: "Fixed", accent: "var(--green)", bubble: false },
  tests: { label: "Tests", accent: "var(--yellow)", bubble: false },
  review: { label: "Review", accent: "var(--blue)", bubble: false },
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
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none border transition-all duration-150 hover:brightness-110 active:scale-[0.92] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)]"
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
      <div className="group/msg flex flex-col items-end gap-1">
        <div className="flex max-w-full flex-row-reverse items-start gap-2">
          <div
            className="soft-card max-w-[82%] rounded-none px-3 py-2.5"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--blue) 16%, var(--bg-tertiary)) 0%, color-mix(in srgb, var(--blue) 10%, var(--bg-secondary)) 100%)",
              borderColor: "color-mix(in srgb, var(--blue) 28%, var(--border))",
              boxShadow: "0 14px 26px rgba(0,0,0,0.14)",
            }}
          >
            <p
              className="whitespace-pre-wrap break-words text-[11px] leading-relaxed"
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
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-flex h-[24px] items-center gap-1 rounded-none border pl-1 pr-2 text-[9px] font-bold uppercase tracking-[0.16em] shadow-[0_10px_20px_rgba(0,0,0,0.08)]"
          style={{
            background: `color-mix(in srgb, ${meta.accent} 14%, var(--bg-tertiary))`,
            borderColor: `color-mix(in srgb, ${meta.accent} 22%, var(--border))`,
            color: meta.accent,
          }}
        >
          {meta.aiIcon ? (
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-none"
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
        className="soft-card rounded-none px-3.5 py-3 text-[11px] leading-relaxed"
        style={{
          color: "var(--text-primary)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-tertiary) 94%, white 6%) 0%, var(--bg-tertiary) 100%)",
        }}
      >
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i} className="whitespace-pre-wrap break-words">
              {seg.content}
            </span>
          ) : (
            <div
              key={i}
              className="my-2 overflow-hidden rounded-none"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {seg.lang && (
                <div
                  className="border-b px-2.5 py-1"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span
                    className="text-[8px] font-medium uppercase tracking-[0.16em] opacity-50"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {seg.lang}
                  </span>
                </div>
              )}
              <pre className="overflow-x-auto p-2.5 text-[10px] font-mono leading-snug">
                <code>{seg.content}</code>
              </pre>
            </div>
          ),
        )}
      </div>

      {msg.blockId && (
        <div
          className="mt-2 inline-flex items-center gap-1.5 rounded-none px-2 py-1 text-[9px] opacity-80"
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
    <div
      className="soft-card mx-2.5 my-2 flex items-center gap-3 px-3 py-3"
      style={{ background: "var(--bg-tertiary)" }}
    >
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-2 w-2 rounded-none animate-bounce"
            style={{
              background: "var(--accent)",
              animationDelay: `${i * 0.15}s`,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
      <div className="min-w-0">
        <p
          className="text-[11px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          AI is thinking
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
          Generating a response for your current file.
        </p>
      </div>
    </div>
  );
}

function EmptyState({ eyebrow, title, description, children }) {
  return (
    <div
      className="soft-card mx-2.5 my-3 flex flex-col items-center gap-2 px-4 py-6 text-center"
      style={{ background: "var(--bg-tertiary)" }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-none"
        style={{
          background:
            "color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))",
          color: "var(--accent)",
        }}
      >
        <AiGlyph className="h-4 w-4" />
      </div>
      {eyebrow && (
        <span
          className="text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--accent)" }}
        >
          {eyebrow}
        </span>
      )}
      <p
        className="text-[12px] font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </p>
      <p
        className="max-w-[18rem] text-[10px] leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        {description}
      </p>
      {children}
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
  { key: "review", icon: "◌", label: "Review", title: "Review current file" },
];

export default function Sidebar({ editorRef, activeFile, language, output }) {
  const [tab, setTab] = useState("ai");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const outline = buildOutline(
    activeFile ? getYText(activeFile).toString() : "",
    language,
  );

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
        } else if (action === "review") {
          if (!activeFile) throw new Error("No active file.");
          const code = getYText(activeFile).toString();
          if (!code.trim()) throw new Error("Current file is empty.");

          const res = await fetch(`${SERVER_URL}/api/ai/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, language }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Review failed.");

          const editor = editorRef?.current?.getEditor?.();
          const model = editor?.getModel?.();
          const issues = Array.isArray(data.issues) ? data.issues : [];

          if (model) {
            monaco.editor.setModelMarkers(
              model,
              "ai-review",
              issues.map((issue, index) => {
                const line = Math.max(
                  1,
                  Math.min(issue.line || 1, model.getLineCount()),
                );

                return {
                  startLineNumber: line,
                  startColumn: 1,
                  endLineNumber: line,
                  endColumn: model.getLineMaxColumn(line),
                  severity:
                    issue.severity === "error"
                      ? monaco.MarkerSeverity.Error
                      : issue.severity === "warning"
                        ? monaco.MarkerSeverity.Warning
                        : monaco.MarkerSeverity.Info,
                  message: issue.message || `Review issue ${index + 1}`,
                  source: "AI Review",
                };
              }),
            );
          }

          const summary = issues.length
            ? issues
                .map((issue) => {
                  const sev = (issue.severity || "info").toUpperCase();
                  const line = issue.line ? `L${issue.line}` : "L?";
                  return `[${sev}] ${line} ${issue.message}`;
                })
                .join("\n")
            : "No obvious issues found in the current file.";

          addMsg({ role: "review", content: summary });
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
    { id: "outline", label: "Outline" },
    { id: "presence", label: "Who's Here" },
  ];

  return (
    <div
      className="panel-shell flex h-full w-72 flex-col border-l"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Tab bar — same segment style as TopBar, înălțime generoasă */}
      <div
        className="flex shrink-0 items-stretch gap-2 border-b px-3 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="liquid-surface flex min-h-[2.9rem] flex-1 items-center justify-center rounded-none border px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] shadow-[0_12px_24px_rgba(0,0,0,0.14)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 active:scale-[0.95] sm:min-h-[3rem] sm:text-xs"
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
                className="shrink-0 rounded-none border px-2.5 py-1 font-mono text-[10px] shadow-[0_10px_18px_rgba(0,0,0,0.1)] sm:text-[11px]"
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
                className="liquid-surface shrink-0 rounded-none border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide shadow-[0_10px_18px_rgba(0,0,0,0.1)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 active:scale-[0.93] sm:text-[11px]"
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
              <EmptyState
                eyebrow="AI Workspace"
                title="Ask anything about your code"
                description="Explain logic, fix issues, generate tests or insert editor suggestions directly into the file."
              >
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
                      className="liquid-surface w-full rounded-none px-3 py-2.5 text-left text-[11px] font-medium shadow-[0_10px_18px_rgba(0,0,0,0.08)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 active:scale-[0.98]"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {hint} →
                    </button>
                  ))}
                </div>
              </EmptyState>
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
            className="shrink-0 border-t px-3 py-3.5 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Quick actions — deasupra textarea */}
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => handleQuick(a.key)}
                  disabled={loading}
                  title={a.title}
                  className="liquid-surface flex min-h-[4.1rem] flex-col items-center justify-center gap-1.5 rounded-none px-2 py-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] shadow-[0_10px_18px_rgba(0,0,0,0.08)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 active:scale-[0.93] disabled:pointer-events-none disabled:opacity-45"
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
              className="soft-card relative overflow-visible rounded-none"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--bg-tertiary) 92%, white 8%) 0%, color-mix(in srgb, var(--bg-primary) 72%, var(--bg-tertiary)) 100%)",
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
                rows={4}
                className="w-full resize-none bg-transparent px-3.5 py-3.5 pb-16 text-[12px] leading-relaxed outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              <div className="absolute bottom-3 left-3.5 flex items-center gap-2">
                <span
                  className="rounded-none px-2 py-1 text-[9px] uppercase tracking-[0.14em]"
                  style={{
                    background:
                      "color-mix(in srgb, var(--bg-primary) 72%, var(--border))",
                    color: "var(--text-secondary)",
                  }}
                >
                  Shift+Enter newline
                </span>
              </div>
              <div className="absolute bottom-3 right-3 flex items-center gap-2.5">
                <span
                  className="rounded-none px-2 py-1 text-[9px] uppercase tracking-[0.14em]"
                  style={{
                    background:
                      "color-mix(in srgb, var(--bg-primary) 72%, var(--border))",
                    color: "var(--text-secondary)",
                  }}
                >
                  {prompt.length > 0 ? `${prompt.length} chars` : "Ready"}
                </span>
                <button
                  type="button"
                  onClick={handleAsk}
                  disabled={loading || !prompt.trim()}
                  className="liquid-surface rounded-none border px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] shadow-[0_12px_20px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 active:scale-[0.93] disabled:pointer-events-none disabled:opacity-45"
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

      {/* ── Outline tab ── */}
      {tab === "outline" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex min-h-[3rem] shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:gap-2.5"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-wider sm:text-xs"
              style={{ color: "var(--accent)" }}
            >
              Outline
            </span>
            <span
              className="shrink-0 rounded-none border px-2 py-1 font-mono text-[10px] sm:text-[11px]"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {activeFile || "No file"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {outline.length === 0 ? (
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                No outline symbols detected for this file yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {outline.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      const editor = editorRef?.current?.getEditor?.();
                      const model = editor?.getModel?.();
                      if (!editor || !model) return;
                      const line = Math.max(
                        1,
                        Math.min(item.line, model.getLineCount()),
                      );
                      editor.revealLineInCenter(line);
                      editor.setPosition({ lineNumber: line, column: 1 });
                      editor.focus();
                    }}
                    className="w-full rounded-none border px-2.5 py-2 text-left transition-all hover:brightness-110"
                    style={{
                      background: "var(--bg-tertiary)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate text-[11px] font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.name}
                      </span>
                      <span
                        className="shrink-0 text-[9px] uppercase tracking-wide"
                        style={{ color: "var(--accent)" }}
                      >
                        L{item.line}
                      </span>
                    </div>
                    <p
                      className="truncate pt-0.5 text-[10px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {item.preview}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
              className="shrink-0 rounded-none border px-2.5 py-1 font-mono text-[10px] shadow-[0_10px_18px_rgba(0,0,0,0.1)] sm:text-[11px]"
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
              <EmptyState
                eyebrow="Presence"
                title="No collaborators here yet"
                description="When someone joins the room, they’ll appear here with their avatar, activity and live cursor color."
              />
            )}
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.clientId}
                  className="soft-card flex items-center gap-2.5 rounded-none px-3 py-2.5"
                  style={{
                    background: "var(--bg-tertiary)",
                    borderColor:
                      "color-mix(in srgb, var(--border) 92%, transparent)",
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none text-xs font-bold"
                    style={{ background: u.color, color: "#050806" }}
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
                      className="text-[10px] uppercase tracking-[0.16em]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      editing live
                    </p>
                  </div>
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-none shadow-[0_0_0_4px_rgba(143,247,167,0.12)]"
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
