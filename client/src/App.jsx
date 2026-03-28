import { useState, useRef, useCallback, useEffect } from 'react'
import TopBar from './components/TopBar'
import FileTree from './components/FileTree'
import Editor from './components/Editor'
import Sidebar from './components/Sidebar'
import OutputPanel from './components/OutputPanel'
import TimeTravel from './components/TimeTravel'
import ConnectionBanner from './components/ConnectionBanner'
import { yFiles, getYText, roomId, idbPersistence, wsProvider } from './lib/yjs'
import { saveRoomNow } from './lib/saveRoom'

// C2: Read-only mode — ?view=1 in URL
const viewOnly = new URLSearchParams(window.location.search).has('view')

// P4: Session history — track visited rooms in localStorage
function recordSession(id) {
  try {
    const hist = JSON.parse(localStorage.getItem('itecify:history') || '[]')
    const filtered = hist.filter(h => h.id !== id)
    filtered.unshift({ id, visitedAt: Date.now() })
    localStorage.setItem('itecify:history', JSON.stringify(filtered.slice(0, 20)))
  } catch {}
}
recordSession(roomId)

// P2: Fork import — load forked files from sessionStorage into this room's Yjs doc
const forkParam = new URLSearchParams(window.location.search).get('fork')
if (forkParam) {
  try {
    const forkedFiles = JSON.parse(sessionStorage.getItem(`itecify-fork-${forkParam}`) || 'null')
    if (forkedFiles) {
      Object.entries(forkedFiles).forEach(([fname, { meta, content }]) => {
        yFiles.set(fname, meta)
        const yText = getYText(fname)
        if (yText.length === 0) yText.insert(0, content)
      })
      sessionStorage.removeItem(`itecify-fork-${forkParam}`)
      // Clean up URL
      const url = new URL(window.location.href)
      url.searchParams.delete('fork')
      window.history.replaceState({}, '', url)
    }
  } catch {}
}

const DEFAULT_SETTINGS = {
  theme: 'vs-dark',
  keymap: 'default',
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  minimap: false,
  lineNumbers: true,
}

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('itecify:settings') || '{}') } }
  catch { return DEFAULT_SETTINGS }
}

export default function App() {
  const [activeFile, setActiveFile] = useState('main.js')
  const [language, setLanguage] = useState('javascript')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState(null)
  const [stdin, setStdin] = useState('')
  const [packages, setPackages] = useState('')
  const [envVars, setEnvVars] = useState('')
  const [settings, setSettings] = useState(loadSettings)
  const [editorReady, setEditorReady] = useState(false)
  const editorRef = useRef(null)

  // Mount editor only after BOTH IDB and WS initial sync complete.
  // The server now awaits loadRoom before sending SYNC_STEP2, so by the time
  // wsProvider fires 'synced', the full persisted code is already in ydoc.
  // A 4-second timeout ensures the editor always appears (e.g. offline).
  useEffect(() => {
    let idbDone = false
    let wsDone = false
    const tryReady = () => { if (idbDone && wsDone) setEditorReady(true) }

    idbPersistence.whenSynced.then(() => { idbDone = true; tryReady() })

    if (wsProvider.synced) {
      wsDone = true
      tryReady()
    } else {
      wsProvider.on('synced', function onSync() {
        wsProvider.off('synced', onSync)
        wsDone = true
        tryReady()
      })
    }

    const fallback = setTimeout(() => setEditorReady(true), 4000)
    return () => clearTimeout(fallback)
  }, [])

  // Save room on page unload (refresh, close, navigate away)
  useEffect(() => {
    const handler = () => saveRoomNow()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Room password gate
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordUnlocked, setPasswordUnlocked] = useState(false)

  useEffect(() => {
    fetch(`/api/room/${roomId}/has-password`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.hasPassword) setPasswordRequired(true) })
      .catch(() => {})
  }, [])

  const handleUnlock = async () => {
    setPasswordError('')
    try {
      const res = await fetch(`/api/room/${roomId}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: passwordInput }),
      })
      const data = await res.json()
      if (data.ok) setPasswordUnlocked(true)
      else setPasswordError(data.error || 'Wrong password')
    } catch { setPasswordError('Error checking password') }
  }

  const handleSettingsChange = useCallback((next) => {
    setSettings(next)
    localStorage.setItem('itecify:settings', JSON.stringify(next))
  }, [])

  // Keep language in sync with active file's metadata
  const handleFileSelect = useCallback((filename, lang) => {
    setActiveFile(filename)
    setLanguage(lang || 'javascript')
  }, [])

  // When language dropdown changes, update the file's metadata in Yjs too
  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang)
    if (activeFile && yFiles.has(activeFile)) {
      yFiles.set(activeFile, { language: lang })
    }
  }, [activeFile])

  // Seed initial file selection from Yjs on first load
  useEffect(() => {
    if (!yFiles.has(activeFile)) {
      const first = [...yFiles.keys()][0]
      if (first) {
        const meta = yFiles.get(first)
        setActiveFile(first)
        setLanguage(meta?.language || 'javascript')
      }
    }
  }, [])

  const handleRun = useCallback(async () => {
    const code = getYText(activeFile).toString()
    if (!code.trim()) return

    setRunning(true)
    setOutput([{ type: 'info', text: `▶ Running ${activeFile}...` }])

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code, language, stdin, roomId,
          packages: packages.split(/[\s,]+/).filter(Boolean),
          env: Object.fromEntries(
            envVars.split('\n').map(l => l.trim()).filter(l => l.includes('='))
              .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
          ),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setOutput(prev => [...prev, { type: 'stderr', text: data.error || 'Run failed' }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() // keep incomplete chunk
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const json = line.slice(5).trim()
          try {
            const { type, text } = JSON.parse(json)
            if (type === 'done') {
              setOutput(prev => {
                if (prev.length <= 1) return [...prev, { type: 'info', text: '(no output)' }]
                return prev
              })
            } else {
              const lines = text.split('\n').filter(t => t !== '')
              if (lines.length === 0) return
              setOutput(prev => [
                ...prev,
                ...lines.map(t => ({ type, text: t })),
              ])
            }
          } catch {}
        }
      }
    } catch (err) {
      setOutput(prev => [...prev, { type: 'stderr', text: `Error: ${err.message}` }])
    } finally {
      setRunning(false)
    }
  }, [activeFile, language])

  // Password gate — show before the full app if room is locked
  if (passwordRequired && !passwordUnlocked) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="rounded-xl p-8 w-80 shadow-2xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <p className="text-lg font-bold mb-1" style={{ color: 'var(--accent)' }}>iTECify</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Room <span className="font-mono" style={{ color: 'var(--text-primary)' }}>#{roomId}</span> is password protected.
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            placeholder="Enter room password"
            autoFocus
            className="w-full rounded px-3 py-2 text-sm outline-none mb-3"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
          {passwordError && (
            <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>{passwordError}</p>
          )}
          <button
            type="button"
            onClick={handleUnlock}
            className="w-full rounded px-3 py-2 text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
          >Unlock</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full">
      <ConnectionBanner />
      <TopBar
        filename={activeFile}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={viewOnly ? null : handleRun}
        running={running}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        viewOnly={viewOnly}
      />

      <div className="flex flex-1 overflow-hidden">
        <FileTree activeFile={activeFile} onFileSelect={handleFileSelect} />

        <div className="flex flex-col flex-1 overflow-hidden">
          <TimeTravel editorRef={editorRef} activeFile={activeFile} />
          <div className="flex-1 overflow-hidden">
            {editorReady
              ? <Editor ref={editorRef} language={language} activeFile={activeFile} settings={settings} readOnly={viewOnly} />
              : <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
            }
          </div>
          <OutputPanel
            output={output}
            stdin={stdin} onStdinChange={setStdin}
            packages={packages} onPackagesChange={setPackages}
            envVars={envVars} onEnvVarsChange={setEnvVars}
          />
        </div>

        <Sidebar editorRef={editorRef} activeFile={activeFile} language={language} output={output} />
      </div>
    </div>
  )
}
