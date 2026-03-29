import { useState, useEffect, useRef } from "react";
import { ydoc, name, color, wsProvider } from "../lib/yjs";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typers, setTypers] = useState([]);
  const endRef = useRef(null);
  const typingTimer = useRef(null);
  const yMessages = useRef(ydoc.getArray("chat"));

  useEffect(() => {
    const update = () => setMessages(yMessages.current.toArray());
    yMessages.current.observe(update);
    update();
    return () => yMessages.current.unobserve(update);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Typing indicators via Yjs awareness
  useEffect(() => {
    const awareness = wsProvider.awareness;
    const update = () => {
      const typing = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        if (state.typing && state.user?.name) {
          typing.push(state.user.name);
        }
      });
      setTypers(typing);
    };
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, []);

  const setTyping = (isTyping) => {
    wsProvider.awareness.setLocalStateField("typing", isTyping);
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 2000);
  };

  const send = () => {
    if (!input.trim()) return;
    yMessages.current.push([
      {
        id: `${Date.now()}-${Math.random()}`,
        author: name,
        color,
        text: input.trim(),
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setInput("");
    clearTimeout(typingTimer.current);
    setTyping(false);
  };

  const EmptyChatState = () => (
    <div
      className="soft-card mx-2.5 my-4 flex flex-col items-center gap-2 px-4 py-6 text-center"
      style={{ background: "var(--bg-tertiary)" }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-none text-sm font-bold"
        style={{
          background: "color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))",
          color: "var(--accent)",
        }}
      >
        C
      </div>
      <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
        Start the conversation
      </p>
      <p className="max-w-[18rem] text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Messages here are shared live with everyone in the room through Yjs sync.
      </p>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header — același limbaj ca „AI Assistant” + badge în Sidebar */}
      <div
        className="flex min-h-[3rem] shrink-0 items-center gap-2 border-b px-3 py-2.5 sm:gap-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wider sm:text-xs"
          style={{ color: "var(--accent)" }}
        >
          Room Chat
        </span>
        <span
          className="shrink-0 rounded-none border px-2.5 py-1 font-mono text-[10px] shadow-[0_10px_18px_rgba(0,0,0,0.1)] sm:text-[11px]"
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          Yjs shared
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <EmptyChatState />
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="group">
              {/* Name · Time */}
              <div className="mb-1.5 flex items-center gap-2 pl-0.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-none"
                  style={{ background: msg.color }}
                />
                <span
                  className="text-[13px] font-semibold leading-tight sm:text-[14px]"
                  style={{ color: msg.color }}
                >
                  {msg.author}
                </span>
                <span
                  className="text-[11px] leading-none opacity-45"
                  style={{ color: "var(--text-secondary)" }}
                >
                  •
                </span>
                <time
                  className="text-[11px] tabular-nums leading-tight opacity-70"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {msg.time}
                </time>
              </div>

              {/* Bubble */}
              <div
                className="soft-card rounded-none px-3.5 py-3 text-[12px] leading-relaxed transition-colors sm:text-[13px]"
                style={{
                  background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-tertiary) 94%, white 6%) 0%, var(--bg-tertiary) 100%)",
                  borderColor: "color-mix(in srgb, var(--border) 82%, white 18%)",
                  borderLeftWidth: "3px",
                  borderLeftColor: msg.color,
                  color: "var(--text-primary)",
                }}
              >
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
        {typers.length > 0 && (
          <div
            className="mx-0.5 mt-2 inline-flex items-center gap-2 rounded-none px-2.5 py-1.5 text-[10px]"
            style={{
              background: "color-mix(in srgb, var(--accent) 10%, var(--bg-tertiary))",
              color: "var(--text-secondary)",
            }}
          >
            <span
              className="block h-2 w-2 rounded-none animate-bounce"
              style={{ background: "var(--accent)" }}
            />
            <span>{typers.join(", ")} {typers.length === 1 ? "is" : "are"} typing...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div
        className="flex shrink-0 items-center gap-2 border-t px-3 py-3"
        style={{ borderColor: "var(--border)", minHeight: "3rem" }}
      >
        <input
          value={input}
          onChange={handleInput}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message..."
          className="soft-card h-full flex-1 rounded-none px-3 py-2 text-xs outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            borderColor: "var(--border)",
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="liquid-surface h-full rounded-none border px-3.5 py-2 text-[10px] font-bold uppercase tracking-wide shadow-[0_10px_18px_rgba(0,0,0,0.08)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 active:scale-[0.93] disabled:pointer-events-none disabled:opacity-45"
          style={{
            background: "var(--accent)",
            borderColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
