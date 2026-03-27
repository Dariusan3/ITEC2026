import { useState, useRef, useCallback } from 'react'
import TopBar from './components/TopBar'
import FileTree from './components/FileTree'
import Editor from './components/Editor'
import Sidebar from './components/Sidebar'
import OutputPanel from './components/OutputPanel'
import TimeTravel from './components/TimeTravel'
import { ytext } from './lib/yjs'

export default function App() {
  const [language, setLanguage] = useState('javascript')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState(null)
  const editorRef = useRef(null)

  const handleRun = useCallback(async () => {
    const code = ytext.toString()
    if (!code.trim()) return

    setRunning(true)
    setOutput([{ type: 'info', text: `▶ Running ${language}...` }])

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })
      const data = await res.json()

      const lines = []
      if (data.mode) {
        lines.push({ type: 'info', text: `[${data.mode === 'docker' ? 'Docker sandbox' : 'Direct execution'}]` })
      }
      if (data.stdout) {
        lines.push(...data.stdout.split('\n').map(text => ({ type: 'stdout', text })))
      }
      if (data.stderr) {
        lines.push(...data.stderr.split('\n').map(text => ({ type: 'stderr', text })))
      }
      if (data.error) {
        lines.push({ type: 'stderr', text: data.error })
      }
      if (lines.length <= 1) {
        lines.push({ type: 'info', text: '(no output)' })
      }
      setOutput(lines)
    } catch (err) {
      setOutput([{ type: 'stderr', text: `Error: ${err.message}` }])
    } finally {
      setRunning(false)
    }
  }, [language])

  return (
    <div className="flex flex-col h-full w-full">
      <TopBar
        language={language}
        onLanguageChange={setLanguage}
        onRun={handleRun}
        running={running}
      />

      <div className="flex flex-1 overflow-hidden">
        <FileTree />

        <div className="flex flex-col flex-1 overflow-hidden">
          <TimeTravel editorRef={editorRef} />
          <div className="flex-1 overflow-hidden">
            <Editor ref={editorRef} language={language} />
          </div>
          <OutputPanel output={output} />
        </div>

        <Sidebar editorRef={editorRef} />
      </div>
    </div>
  )
}
