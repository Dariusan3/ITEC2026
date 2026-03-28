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
    const update = () => setMessages(yMessages.current.toArray())
    yMessages.current.observe(update)
    update()
    return () => yMessages.current.unobserve(update)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // C5: Typing indicators via awareness
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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-center mt-8" style={{ color: 'var(--text-secondary)' }}>
            No messages yet. Say hi!
          </p>
        )}
        {messages.map(msg => (
          <div key={msg.id}>
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="text-[10px] font-bold" style={{ color: msg.color }}>{msg.author}</span>
              <span className="text-[9px]" style={{ color: 'var(--accent-dim)' }}>{msg.time}</span>
            </div>
            <div className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              {msg.text}
            </div>
          </div>
        ))}
        {typers.length > 0 && (
          <p className="text-[10px] italic" style={{ color: 'var(--text-secondary)' }}>
            {typers.join(', ')} {typers.length === 1 ? 'is' : 'are'} typing...
          </p>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-2 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
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
          className="text-xs font-semibold px-2 py-1 rounded"
          style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
        >Send</button>
      </div>
    </div>
  )
}
