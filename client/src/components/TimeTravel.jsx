import { useState, useEffect, useCallback } from 'react'
import * as Y from 'yjs'
import { ytext, ydoc } from '../lib/yjs'

export default function TimeTravel({ editorRef }) {
  const [snapshots, setSnapshots] = useState([])
  const [sliderValue, setSliderValue] = useState(-1)
  const [replaying, setReplaying] = useState(false)
  const [liveContent, setLiveContent] = useState(null)

  // Fetch snapshot list
  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch('/api/snapshots')
      const data = await res.json()
      setSnapshots(data.snapshots || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchSnapshots()
    const interval = setInterval(fetchSnapshots, 15000)
    return () => clearInterval(interval)
  }, [fetchSnapshots])

  const handleSliderChange = async (e) => {
    const idx = parseInt(e.target.value)
    setSliderValue(idx)

    if (idx === snapshots.length - 1 || idx === -1) {
      exitReplay()
      return
    }

    const snapshot = snapshots[idx]
    if (!snapshot) return

    // Save live content on first replay
    if (!replaying) {
      setLiveContent(ytext.toString())
      setReplaying(true)
    }

    try {
      const res = await fetch(`/api/snapshots/${snapshot.timestamp}`)
      const data = await res.json()
      if (data.snapshot) {
        const update = Uint8Array.from(atob(data.snapshot), c => c.charCodeAt(0))
        // Apply snapshot to a temporary doc to read its text
        const tmpDoc = new Y.Doc()
        Y.applyUpdate(tmpDoc, update)
        const text = tmpDoc.getText('monaco').toString()
        tmpDoc.destroy()

        // Show in editor (read-only during replay)
        const editor = editorRef?.current?.getEditor()
        if (editor) {
          editor.updateOptions({ readOnly: true })
          const model = editor.getModel()
          model.setValue(text)
        }
      }
    } catch {}
  }

  const exitReplay = () => {
    setReplaying(false)
    setSliderValue(-1)
    const editor = editorRef?.current?.getEditor()
    if (editor) {
      editor.updateOptions({ readOnly: false })
      if (liveContent !== null) {
        editor.getModel().setValue(liveContent)
      }
    }
    setLiveContent(null)
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-[10px]"
        style={{ color: 'var(--text-secondary)' }}>
        No snapshots yet (saves every 10s with Redis)
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <span className="text-[10px] font-semibold whitespace-nowrap"
        style={{ color: replaying ? 'var(--yellow)' : 'var(--text-secondary)' }}>
        {replaying ? 'REPLAY' : 'Timeline'}
      </span>

      <input
        type="range"
        min={0}
        max={snapshots.length - 1}
        value={sliderValue === -1 ? snapshots.length - 1 : sliderValue}
        onChange={handleSliderChange}
        className="flex-1 h-1 accent-purple-400"
        style={{ accentColor: 'var(--accent)' }}
      />

      <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
        {sliderValue >= 0 && snapshots[sliderValue]
          ? snapshots[sliderValue].label
          : 'Live'}
      </span>

      {replaying && (
        <button
          onClick={exitReplay}
          className="text-[10px] font-semibold px-2 py-0.5 rounded"
          style={{ background: 'var(--green)', color: 'var(--bg-primary)' }}
        >
          Back to Live
        </button>
      )}
    </div>
  )
}
