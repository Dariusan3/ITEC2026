import { useState, useEffect, useRef } from 'react'
import { ydoc, name, color, wsProvider } from '../lib/yjs'

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typers, setTypers] = useState([])
  const endRef = useRef(null)
  const typingTimer = useRef(null)
  const yMessages = useRef(ydoc.getArray('chat'))

  useEffect(() => {
    const update = () => setMessages(yMessages.current.toArray());
    yMessages.current.observe(update);
    update();
    return () => yMessages.current.unobserve(update);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Typing indicators via Yjs awareness
  useEffect(() => {
    const awareness = wsProvider.awareness
    const update = () => {
      const typing = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (state.typing && state.user?.name) {
          typing.push(state.user.name)
        }
      })
      setTypers(typing)
    }
    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [])

  const setTyping = (isTyping) => {
    wsProvider.awareness.setLocalStateField('typing', isTyping)
  }

  const handleInput = (e) => {
    setInput(e.target.value)
    setTyping(true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => setTyping(false), 2000)
  }

  const send = () => {
    if (!input.trim()) return
    yMessages.current.push([{
      id: `${Date.now()}-${Math.random()}`,
      author: name,
      color,
      text: input.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])
    setInput('')
    clearTimeout(typingTimer.current)
    setTyping(false)
  }

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
          className="shrink-0 rounded-none border px-2 py-1 font-mono text-[10px] sm:text-[11px]"
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
          <div className="flex flex-col items-center gap-1.5 py-12 text-center">
            <span className="text-2xl leading-none opacity-30" aria-hidden>
              💬
            </span>
            <p
              className="text-[11px] font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              No messages yet — say hi!
            </p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="group">
              {/* Name · Time */}
              <div className="mb-1.5 flex items-baseline gap-2 pl-0.5">
                <span
                  className="text-base font-semibold leading-tight sm:text-[17px]"
                  style={{ color: msg.color }}
                >
                  {msg.author}
                </span>
                <span
                  className="text-sm leading-none opacity-45"
                  style={{ color: "var(--text-secondary)" }}
                >
                  ·
                </span>
                <time
                  className="text-sm tabular-nums leading-tight opacity-70 sm:text-[15px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {msg.time}
                </time>
              </div>

              {/* Bubble */}
              <div
                className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed transition-colors sm:text-[13px]"
                style={{
                  background: "var(--bg-tertiary)",
                  borderColor: "var(--border)",
                  borderLeftWidth: "3px",
                  borderLeftColor: msg.color,
                  color: "var(--text-primary)",
                  paddingLeft: "10px",
                }}
              >
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
        {typers.length > 0 && (
          <p
            className="text-[10px] italic px-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {typers.join(', ')} {typers.length === 1 ? 'is' : 'are'} typing...
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div
        className="flex shrink-0 items-center border-t px-2 py-2 "
        style={{ borderColor: "var(--border)", minHeight: "3rem" }}
      >
        <input
          value={input}
          onChange={handleInput}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Message..."
          className="flex-1 text-xs px-2 py-1 rounded outline-none"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="rounded-none h-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-100 hover:brightness-110 active:scale-[0.93] disabled:pointer-events-none disabled:opacity-45"
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
