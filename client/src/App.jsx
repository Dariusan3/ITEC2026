import { useState, useRef, useCallback, useEffect } from 'react'
import TopBar from './components/TopBar'
import FileTree from './components/FileTree'
import Editor from './components/Editor'
import Sidebar from './components/Sidebar'
import OutputPanel from './components/OutputPanel'
import TimeTravel from './components/TimeTravel'
import ConnectionBanner from './components/ConnectionBanner'
import { yFiles, getYText, roomId } from './lib/yjs'

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
  const editorRef = useRef(null)

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

  return (
    <div className="flex flex-col h-full w-full">
      <ConnectionBanner />
      <TopBar
        filename={activeFile}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={handleRun}
        running={running}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />

      <div className="flex flex-1 overflow-hidden">
        <FileTree activeFile={activeFile} onFileSelect={handleFileSelect} />

        <div className="flex flex-col flex-1 overflow-hidden">
          <TimeTravel editorRef={editorRef} />
          <div className="flex-1 overflow-hidden">
            <Editor ref={editorRef} language={language} activeFile={activeFile} settings={settings} />
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
