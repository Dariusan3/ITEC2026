import { useState, useEffect } from 'react'
import { SERVER_URL } from '../lib/config'

function timeAgo(ts) {
  const diff = Date.now() - Number(ts)
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

const ANIM_CSS = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; } 50% { opacity: 0; }
  }
  @keyframes marquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @keyframes revealLine {
    from { opacity: 0; transform: translateX(-10px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes glowPulse {
    0%, 100% { text-shadow: 0 0 30px rgba(203,166,247,0.35); }
    50%       { text-shadow: 0 0 60px rgba(203,166,247,0.6), 0 0 100px rgba(203,166,247,0.2); }
  }
  [data-anim] {
    opacity: 0;
    transform: translateY(28px);
    transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1);
  }
  [data-anim].visible { opacity: 1; transform: none; }
  [data-delay="1"] { transition-delay: 0.1s; }
  [data-delay="2"] { transition-delay: 0.2s; }
  [data-delay="3"] { transition-delay: 0.3s; }
  [data-delay="4"] { transition-delay: 0.4s; }
  .room-btn:hover { border-color: rgba(203,166,247,0.6) !important; background: rgba(203,166,247,0.05) !important; }
`

// Syntax-colored code for the mockup
const CODE = [
  [{ t: 'async ', c: '#cba6f7' }, { t: 'function ', c: '#89b4fa' }, { t: 'sync', c: '#a6e3a1' }, { t: '(room) {', c: '#cdd6f4' }],
  [{ t: '  const ', c: '#cba6f7' }, { t: 'doc ', c: '#cdd6f4' }, { t: '= new ', c: '#89b4fa' }, { t: 'Y.Doc', c: '#f9e2af' }, { t: '()', c: '#cdd6f4' }],
  [{ t: '  await ', c: '#cba6f7' }, { t: 'loadRoom', c: '#a6e3a1' }, { t: '(room, doc)', c: '#cdd6f4' }],
  [{ t: '  return ', c: '#cba6f7' }, { t: '{ doc, synced: ', c: '#cdd6f4' }, { t: 'true', c: '#a6e3a1' }, { t: ' }', c: '#cdd6f4' }],
  [{ t: '}', c: '#cdd6f4' }],
  [{ t: '', c: '' }],
  [{ t: '// ', c: '#6c7086' }, { t: '✦ Alex is writing tests…', c: '#6c7086' }],
  [{ t: 'test', c: '#89b4fa' }, { t: '(', c: '#cdd6f4' }, { t: '"syncs across clients"', c: '#a6e3a1' }, { t: ', async () => {', c: '#cdd6f4' }],
  [{ t: '  const ', c: '#cba6f7' }, { t: '{ doc } ', c: '#cdd6f4' }, { t: '= await ', c: '#cba6f7' }, { t: 'sync', c: '#a6e3a1' }, { t: '(room)', c: '#cdd6f4' }, { t: '█', c: '#cba6f7', blink: true }],
]

const FEATURES = [
  { num: '01', title: 'Real-time Collaboration', desc: 'Every keystroke syncs instantly. Live cursors, user presence, and CRDT conflict resolution — feel the room come alive.', tag: 'CRDT · Yjs' },
  { num: '02', title: 'AI Assistance', desc: 'Ask questions in natural language, get inline suggestions, explain selections, fix errors, generate tests — all without leaving the editor.', tag: 'Powered by Groq' },
  { num: '03', title: '25+ Languages', desc: 'JS, TS, Python, Rust, Go, Java, C, C++, Kotlin, Ruby, PHP, YAML, SQL and more. Code runs in an isolated Docker sandbox with configurable packages and env vars.', tag: 'Docker sandbox' },
  { num: '04', title: 'Time Travel', desc: 'Snapshots are taken every 10 seconds. Scrub through the full edit history of a session and restore any earlier state of your code.', tag: 'Redis snapshots' },
  { num: '05', title: 'GitHub Import', desc: 'Paste any public GitHub repo URL and load up to 30 source files directly into the room — ready to read, edit and run.', tag: 'GitHub API' },
]

export default function LandingPage() {
  const [user, setUser] = useState(undefined)
  const [joinId, setJoinId] = useState('')
  const [recentRooms, setRecentRooms] = useState([])

  const handleLogout = () => {
    fetch(`${SERVER_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
      .then(() => setUser(null)).catch(() => setUser(null))
  }

  useEffect(() => {
    fetch(`${SERVER_URL}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('itecify:history')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed))
          setRecentRooms([...parsed].sort((a, b) => b.visitedAt - a.visitedAt).slice(0, 6))
      }
    } catch {}
  }, [])

  // Scroll-reveal
  useEffect(() => {
    const els = document.querySelectorAll('[data-anim]')
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) } }),
      { threshold: 0.1 }
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const handleNewRoom = () => { window.location.hash = randomId() }
  const handleJoin = () => { const id = joinId.trim(); if (id) window.location.hash = id }

  return (
    <>
      <style>{ANIM_CSS}</style>
      <div
        className="min-h-screen w-full overflow-x-hidden"
        style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}
      >

        {/* ── NAV ─────────────────────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b"
          style={{ background: 'rgba(30,30,46,0.88)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-base font-black tracking-tight" style={{ color: 'var(--accent)' }}>iTECify</span>
            <span
              className="hidden sm:inline text-[8px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 border"
              style={{ borderColor: 'rgba(203,166,247,0.3)', color: 'var(--accent)', background: 'rgba(203,166,247,0.07)' }}
            >
              Beta
            </span>
          </div>

          <div className="flex items-center gap-2">
            {user === undefined && <span className="text-xs opacity-30">·</span>}
            {user === null && (
              <div className="flex items-center gap-2">
                <a href={`${SERVER_URL}/auth/github`}
                  className="flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all hover:brightness-110"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-tertiary)' }}
                >
                  <GithubIcon /> GitHub
                </a>
                <a href={`${SERVER_URL}/auth/google`}
                  className="flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all hover:brightness-110"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-tertiary)' }}
                >
                  <GoogleIcon /> Google
                </a>
              </div>
            )}
            {user && (
              <div className="flex items-center gap-2">
                {user.avatar && <img src={user.avatar} alt="" className="h-7 w-7 rounded-none border object-cover" style={{ borderColor: 'var(--border)' }} />}
                <span className="hidden sm:inline text-xs" style={{ color: 'var(--text-secondary)' }}>{user.name || user.login}</span>
                <button type="button" onClick={handleLogout}
                  className="border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide hover:brightness-110 transition-all"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* ── HERO ────────────────────────────────────────────────────── */}
        <section
          className="relative flex items-center px-6 lg:px-16 overflow-hidden"
          style={{
            minHeight: 'calc(100vh - 52px)',
            backgroundImage: 'radial-gradient(circle, rgba(203,166,247,0.10) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        >
          {/* Ambient glows */}
          <div className="pointer-events-none absolute -top-40 -left-40 w-125 h-125 rounded-none"
            style={{ background: 'radial-gradient(circle, rgba(203,166,247,0.10) 0%, transparent 65%)' }} />
          <div className="pointer-events-none absolute bottom-0 right-0 w-80 h-80 rounded-none"
            style={{ background: 'radial-gradient(circle, rgba(137,180,250,0.07) 0%, transparent 65%)' }} />

          <div className="relative w-full max-w-7xl mx-auto grid lg:grid-cols-[55%_45%] gap-12 xl:gap-16 items-center py-16 lg:py-24">

            {/* Left column */}
            <div>
              <div
                className="inline-flex items-center gap-2 border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] mb-8"
                style={{
                  borderColor: 'rgba(203,166,247,0.3)',
                  color: 'var(--accent)',
                  background: 'rgba(203,166,247,0.07)',
                  animation: 'fadeUp 0.55s ease both',
                  animationDelay: '0.05s',
                }}
              >
                <span style={{ animation: 'glowPulse 2.5s ease infinite' }}>✦</span>
                Collaborative Code Editor
              </div>

              <h1
                className="font-black leading-[0.9] mb-6"
                style={{
                  fontSize: 'clamp(3rem, 5.5vw, 5.8rem)',
                  letterSpacing: '-0.035em',
                  animation: 'fadeUp 0.55s ease both',
                  animationDelay: '0.15s',
                }}
              >
                Code<br />
                together,{' '}
                <span style={{ color: 'var(--accent)', animation: 'glowPulse 3s ease infinite' }}>
                  in&nbsp;real&#8209;time.
                </span>
              </h1>

              <p
                className="text-sm leading-relaxed mb-8 max-w-120"
                style={{
                  color: 'var(--text-secondary)',
                  animation: 'fadeUp 0.55s ease both',
                  animationDelay: '0.25s',
                }}
              >
                A multiplayer editor with live cursors, AI suggestions, 10+ languages,
                and a sandboxed runtime. No install. Open a room and start coding in seconds.
              </p>

              {/* CTAs */}
              <div
                className="flex flex-wrap items-stretch gap-3 mb-8"
                style={{ animation: 'fadeUp 0.55s ease both', animationDelay: '0.35s' }}
              >
                <button
                  type="button"
                  onClick={handleNewRoom}
                  className="px-8 py-3.5 text-sm font-bold uppercase tracking-wide transition-all hover:brightness-115 hover:scale-[1.02] active:scale-100"
                  style={{ background: 'var(--accent)', color: '#1e1e2e', border: '1px solid var(--accent)' }}
                >
                  + New Room
                </button>

                <div className="flex items-stretch">
                  <input
                    type="text"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="room-id"
                    className="border px-4 text-sm outline-none w-32 sm:w-40"
                    style={{
                      background: 'var(--bg-secondary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                      borderRight: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleJoin}
                    className="border px-5 py-3.5 text-sm font-bold uppercase tracking-wide hover:brightness-110 transition-all"
                    style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    Join →
                  </button>
                </div>
              </div>

              {/* Trust bar */}
              <div
                className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] uppercase tracking-widest"
                style={{ color: 'var(--text-secondary)', animation: 'fadeUp 0.55s ease both', animationDelay: '0.45s' }}
              >
                {['Free', 'No login required', 'Open in seconds', 'Zero setup'].map((t, i) => (
                  <span key={t} className="flex items-center gap-2">
                    {i > 0 && <span style={{ color: 'var(--border)' }}>·</span>}
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right column — editor mockup */}
            <div
              className="hidden lg:block"
              style={{ animation: 'fadeUp 0.65s ease both', animationDelay: '0.3s' }}
            >
              <CodeMockup />
            </div>
          </div>
        </section>

        {/* ── MARQUEE ─────────────────────────────────────────────────── */}
        <div
          className="overflow-hidden border-y py-3"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div
            className="flex whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--text-secondary)', animation: 'marquee 22s linear infinite' }}
          >
            {Array.from({ length: 3 }).flatMap((_, rep) =>
              ['Real-time sync', 'AI-powered', '10+ languages', 'Time travel', 'Zero setup', 'Docker sandbox', 'Open source', 'Free to use'].map((item, i) => (
                <span key={`marquee-${rep}-${i}`} className="px-8">
                  {item}
                  <span className="ml-8" style={{ color: 'var(--accent)' }}>✦</span>
                </span>
              ))
            )}
          </div>
        </div>

        {/* ── FEATURES ────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 lg:px-8 py-20">
          <div
            data-anim
            className="text-[10px] font-bold uppercase tracking-[0.3em] mb-10"
            style={{ color: 'var(--accent)' }}
          >
            — What's inside
          </div>

          <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            {FEATURES.map((f, i) => (
              <div
                key={f.num}
                data-anim
                data-delay={String((i % 3) + 1)}
                className="flex flex-col sm:flex-row items-start gap-6 sm:gap-12 py-9"
                style={{
                  borderBottom: i < FEATURES.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span
                  className="shrink-0 font-black leading-none tabular-nums select-none"
                  style={{
                    fontSize: 'clamp(2.2rem, 3.5vw, 3rem)',
                    letterSpacing: '-0.05em',
                    color: 'rgba(203,166,247,0.15)',
                    minWidth: '4rem',
                  }}
                >
                  {f.num}
                </span>
                <div className="flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2.5">
                    <h3
                      className="font-bold"
                      style={{ fontSize: 'clamp(0.95rem, 1.4vw, 1.15rem)', color: 'var(--text-primary)' }}
                    >
                      {f.title}
                    </h3>
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border rounded-sm"
                      style={{ borderColor: 'rgba(203,166,247,0.22)', color: 'var(--accent)', background: 'rgba(203,166,247,0.06)' }}
                    >
                      {f.tag}
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: '54ch' }}>
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── RECENT ROOMS ────────────────────────────────────────────── */}
        {recentRooms.length > 0 && (
          <section className="max-w-5xl mx-auto px-6 lg:px-8 pt-16 pb-0">
            <div data-anim className="text-[10px] font-bold uppercase tracking-[0.3em] mb-6" style={{ color: 'var(--text-secondary)' }}>
              — Recent rooms
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {recentRooms.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { window.location.hash = r.id }}
                  data-anim
                  data-delay={String((i % 3) + 1)}
                  className="room-btn flex items-center justify-between border px-4 py-3 text-left transition-all"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  <span className="font-mono text-[12px] truncate" style={{ color: 'var(--accent)' }}>
                    #{r.id}
                  </span>
                  <span className="text-[10px] ml-3 shrink-0 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {timeAgo(r.visitedAt)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── BOTTOM CTA ──────────────────────────────────────────────── */}
        <section
          data-anim
          className="mt-24"
          style={{
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            className="max-w-3xl mx-auto px-6 py-24 text-center"
            style={{
              backgroundImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(203,166,247,0.07) 0%, transparent 100%)',
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-[0.3em] mb-5"
              style={{ color: 'var(--accent)' }}
            >
              ✦ Start now
            </p>
            <h2
              className="font-black leading-tight mb-4"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', letterSpacing: '-0.035em' }}
            >
              Your next collab session<br />
              is one click away.
            </h2>
            <p className="text-[13px] mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              No account required. Share the link. Start coding.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleNewRoom}
                className="inline-flex items-center gap-2 px-10 py-4 text-sm font-bold uppercase tracking-wide transition-all hover:brightness-115 hover:scale-[1.02] active:scale-100"
                style={{ background: 'var(--accent)', color: '#1e1e2e', border: '1px solid var(--accent)' }}
              >
                Open a room →
              </button>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold uppercase tracking-wide transition-all hover:brightness-110 border"
                style={{ background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                <GithubIcon /> View source
              </a>
            </div>
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <footer
          className="border-t px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)', opacity: 0.7 }}
        >
          <span>iTECify · ITEC 2026</span>
          <span className="hidden sm:block" style={{ color: 'var(--border)' }}>·</span>
          <span>Yjs · Monaco · Groq · Docker</span>
        </footer>

      </div>
    </>
  )
}

/* ── Sub-components ─────────────────────────────────────────── */

function CodeMockup() {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: '#181825',
        border: '1px solid rgba(203,166,247,0.18)',
        boxShadow: '0 0 0 1px rgba(203,166,247,0.06), 0 40px 80px rgba(0,0,0,0.55), 0 0 120px rgba(203,166,247,0.05)',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* Chrome */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ background: '#11111b', borderColor: 'rgba(203,166,247,0.1)' }}
      >
        <span className="w-3 h-3 rounded-none" style={{ background: '#f38ba8' }} />
        <span className="w-3 h-3 rounded-none" style={{ background: '#f9e2af' }} />
        <span className="w-3 h-3 rounded-none" style={{ background: '#a6e3a1' }} />
        <span className="ml-3 text-[11px]" style={{ color: 'rgba(205,214,244,0.4)' }}>
          collaborate.js
        </span>
        <div className="ml-auto flex -space-x-1.5">
          {[['YO', '#cba6f7'], ['AL', '#89b4fa'], ['SA', '#a6e3a1']].map(([init, bg]) => (
            <div
              key={init}
              className="w-5 h-5 rounded-none flex items-center justify-center text-[8px] font-black border"
              style={{ background: bg, color: '#1e1e2e', borderColor: '#11111b' }}
              title={init}
            >
              {init}
            </div>
          ))}
        </div>
      </div>

      {/* Code */}
      <div className="px-4 py-4 text-[12.5px] leading-[1.8]">
        {CODE.map((line, li) => (
          <div
            key={li}
            className="flex items-center"
            style={{ animation: `revealLine 0.35s ease both`, animationDelay: `${0.55 + li * 0.09}s` }}
          >
            <span
              className="w-6 shrink-0 text-right mr-4 select-none text-[11px] tabular-nums"
              style={{ color: 'rgba(108,112,134,0.5)' }}
            >
              {li + 1}
            </span>
            <span>
              {line.map((tok, ti) =>
                tok.blink
                  ? <span key={ti} style={{ color: tok.c, animation: 'blink 1.1s step-end infinite' }}>{tok.t}</span>
                  : <span key={ti} style={{ color: tok.c }}>{tok.t}</span>
              )}
            </span>
            {/* Inline cursor label for Alex's line */}
            {li === 7 && (
              <span
                className="ml-2 px-1.5 py-0.5 text-[9px] font-bold"
                style={{
                  background: '#89b4fa',
                  color: '#1e1e2e',
                  animation: 'fadeUp 0.3s ease both',
                  animationDelay: '1.5s',
                }}
              >
                Alex
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-4 py-1.5 text-[10px] border-t"
        style={{ background: '#11111b', borderColor: 'rgba(203,166,247,0.08)', color: 'rgba(108,112,134,0.7)' }}
      >
        <span>JavaScript</span>
        <span style={{ color: '#a6e3a1' }}>● 3 online</span>
        <span>Ln 9, Col 42</span>
      </div>
    </div>
  )
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
