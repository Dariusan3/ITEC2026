import { useState, useRef, useEffect } from "react";
import { yAiBlocks, getYText, wsProvider } from "../lib/yjs";
import Chat from "./Chat";

export default function Sidebar({ editorRef, activeFile, language }) {
  const [tab, setTab] = useState("ai");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const awareness = wsProvider.awareness;
    const update = () => {
      const states = [];
      awareness.getStates().forEach((state, clientId) => {
        if (state.user) states.push({ ...state.user, clientId });
      });
      setUsers(states);
    };
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, []);

  const handleAsk = async () => {
    if (!prompt.trim() || loading) return;
    const userMsg = prompt.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setPrompt("");
    setLoading(true);
    try {
      const code = activeFile ? getYText(activeFile).toString() : "";
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          prompt: userMsg,
          language: language || "javascript",
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed");
      }
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: data.explanation, blockId: data.id },
      ]);
      yAiBlocks.set(data.id, {
        id: data.id,
        suggestion: data.suggestion,
        explanation: data.explanation,
        status: "pending",
        line: getCursorLine(editorRef),
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: err.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

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
      <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{
              color:
                tab === t.id
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              borderBottom:
                tab === t.id
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ai" && (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p
                className="mt-8 text-center text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Ask AI for code suggestions.
                <br />
                They&apos;ll appear as blocks in the editor.
              </p>
            )}
            {messages.map((msg, i) => (
              <AiMessage key={i} msg={msg} />
            ))}
            {loading && (
              <div
                className="animate-pulse text-xs"
                style={{ color: "var(--accent)" }}
              >
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Ask AI for help..."
              rows={3}
              className="w-full resize-none rounded border p-2 text-xs outline-none"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <button
              type="button"
              onClick={handleAsk}
              disabled={loading || !prompt.trim()}
              className="mt-2 w-full rounded py-1.5 text-xs font-semibold"
              style={{
                background: "var(--accent)",
                color: "var(--bg-primary)",
                opacity: loading || !prompt.trim() ? 0.5 : 1,
              }}
            >
              {loading ? "Thinking..." : "Ask AI"}
            </button>
          </div>
        </>
      )}

      {tab === "chat" && <Chat />}

      {tab === "presence" && (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          <p
            className="mb-3 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            {users.length} user{users.length !== 1 ? "s" : ""} in this room
          </p>
          {users.map((u) => (
            <div key={u.clientId} className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: u.color, color: "var(--bg-primary)" }}
              >
                {u.name[0]}
              </div>
              <span className="text-xs" style={{ color: "var(--text-primary)" }}>
                {u.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AiMessage({ msg }) {
  if (msg.role === "user") {
    return (
      <div
        className="rounded p-2 text-xs"
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-primary)",
        }}
      >
        <span className="font-semibold" style={{ color: "var(--blue)" }}>
          You:{" "}
        </span>
        {msg.content}
      </div>
    );
  }
  if (msg.role === "ai") {
    return (
      <div
        className="rounded border border-dashed p-2 text-xs"
        style={{
          background: "rgba(203, 166, 247, 0.08)",
          borderColor: "var(--accent)",
          color: "var(--text-primary)",
        }}
      >
        <span className="font-semibold" style={{ color: "var(--accent)" }}>
          AI:{" "}
        </span>
        {msg.content}
        {msg.blockId && (
          <div
            className="mt-1 text-[10px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Block inserted in editor
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className="rounded p-2 text-xs"
      style={{ background: "rgba(243, 139, 168, 0.1)", color: "var(--red)" }}
    >
      Error: {msg.content}
    </div>
  );
}

function getCursorLine(editorRef) {
  if (editorRef?.current) {
    const pos = editorRef.current.getPosition();
    return pos ? pos.lineNumber : 1;
  }
  return 1;
}
