import { useState, useRef, useEffect } from "react";
import { yAiBlocks, ytext } from "../lib/yjs";

export default function Sidebar({ editorRef }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAsk = async () => {
    if (!prompt.trim() || loading) return;

    const userMsg = prompt.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setPrompt("");
    setLoading(true);

    try {
      const code = ytext.toString();
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, prompt: userMsg, language: "javascript" }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: data.explanation,
          blockId: data.id,
        },
      ]);

      // Store AI block in Yjs for all users to see
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
        {
          role: "error",
          content: err.message,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div
      className="w-72 h-full border-l flex flex-col"
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
        AI Assistant
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p
            className="text-xs text-center mt-8"
            style={{ color: "var(--text-secondary)", padding: "0.5rem 1rem" }}
          >
            Ask Claude for code suggestions.
            <br />
            They'll appear as blocks in the editor.
          </p>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} />
        ))}

        {loading && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--accent)" }}
          >
            <span className="animate-pulse">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="p-3 border-t flex flex-col "
        style={{ borderColor: "var(--border)" }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI for help..."
          rows={3}
          className="w-full text-xs p-2  border resize-none outline-none"
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
            padding: "0.5rem 1rem",
          }}
        />
        <button
          onClick={handleAsk}
          disabled={loading || !prompt.trim()}
          className="w-full text-xs font-semibold transition-opacity"
          style={{
            background: "var(--accent)",
            color: "var(--bg-primary)",
            opacity: loading || !prompt.trim() ? 0.5 : 1,
            padding: "0.5rem 1rem",
          }}
        >
          {loading ? "Thinking..." : "Ask AI"}
        </button>
      </div>
    </div>
  );
}

function ChatMessage({ msg }) {
  if (msg.role === "user") {
    return (
      <div
        className="text-xs p-2 rounded"
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
        className="text-xs p-2 rounded border"
        style={{
          background: "rgba(203, 166, 247, 0.08)",
          borderColor: "var(--accent)",
          borderStyle: "dashed",
          color: "var(--text-primary)",
        }}
      >
        <span className="font-semibold" style={{ color: "var(--accent)" }}>
          Claude:{" "}
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
      className="text-xs p-2 rounded"
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
