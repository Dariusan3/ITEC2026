import { useState, useEffect, useRef } from 'react'
import { yFiles, getYText } from '../lib/yjs'

const LANG_ICONS = {
  javascript: { icon: 'JS', color: '#f9e2af' },
  typescript: { icon: 'TS', color: '#89b4fa' },
  python:     { icon: 'PY', color: '#a6e3a1' },
  rust:       { icon: 'RS', color: '#fab387' },
  html:       { icon: 'HT', color: '#f38ba8' },
  css:        { icon: 'CS', color: '#89dceb' },
  json:       { icon: '{}', color: '#cba6f7' },
}

const EXT_TO_LANG = {
  js: 'javascript', ts: 'typescript', py: 'python',
  rs: 'rust', html: 'html', css: 'css', json: 'json',
}

function guessLang(filename) {
  const ext = filename.split('.').pop()
  return EXT_TO_LANG[ext] || 'javascript'
}

export default function FileTree({ activeFile, onFileSelect }) {
  const [files, setFiles] = useState([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingFile, setRenamingFile] = useState(null)
  const [renameTo, setRenameTo] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const newInputRef = useRef(null)
  const renameInputRef = useRef(null)

  useEffect(() => {
    const update = () => {
      const list = []
      yFiles.forEach((meta, name) => list.push({ name, ...meta }))
      list.sort((a, b) => a.name.localeCompare(b.name))
      setFiles(list)
    }
    yFiles.observe(update)
    update()
    return () => yFiles.unobserve(update)
  }, [])

  useEffect(() => {
    if (creating) newInputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (renamingFile) renameInputRef.current?.focus()
  }, [renamingFile])

  const createFile = () => {
    const trimmed = newName.trim()
    if (!trimmed) { setCreating(false); return }
    if (yFiles.has(trimmed)) { alert(`"${trimmed}" already exists`); return }
    const lang = guessLang(trimmed)
    yFiles.set(trimmed, { language: lang })
    // Initialize with empty text
    getYText(trimmed)
    onFileSelect(trimmed, lang)
    setCreating(false)
    setNewName('')
  }

  const renameFile = () => {
    const trimmed = renameTo.trim()
    if (!trimmed || trimmed === renamingFile) { setRenamingFile(null); return }
    if (yFiles.has(trimmed)) { alert(`"${trimmed}" already exists`); return }
    const meta = yFiles.get(renamingFile)
    const lang = guessLang(trimmed)
    const oldText = getYText(renamingFile).toString()
    yFiles.delete(renamingFile)
    yFiles.set(trimmed, { language: lang })
    getYText(trimmed).insert(0, oldText)
    if (activeFile === renamingFile) onFileSelect(trimmed, lang)
    setRenamingFile(null)
    setRenameTo('')
  }

  const deleteFile = (filename) => {
    if (yFiles.size <= 1) { alert('Cannot delete the last file'); return }
    if (!confirm(`Delete "${filename}"?`)) return
    yFiles.delete(filename)
    if (activeFile === filename) {
      const remaining = []
      yFiles.forEach((_, n) => remaining.push(n))
      if (remaining.length > 0) {
        const next = remaining[0]
        onFileSelect(next, yFiles.get(next).language)
      }
    }
  }

  const openContextMenu = (e, filename) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, filename })
  }

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  return (
    <div
      className="flex h-full w-48 flex-col select-none border-r"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          Explorer
        </span>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setNewName("");
          }}
          className="text-sm font-bold leading-none hover:opacity-70"
          style={{ color: "var(--accent)" }}
          title="New file"
        >
          +
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {files.map(({ name, language: lang }) => {
          const icon = LANG_ICONS[lang] || LANG_ICONS.javascript;
          const isActive = activeFile === name;
          const isRenaming = renamingFile === name;

          return (
            <div key={name}>
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  onBlur={renameFile}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameFile();
                    if (e.key === "Escape") setRenamingFile(null);
                  }}
                  className="w-full rounded px-2 py-1 text-xs outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--accent)",
                  }}
                />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onFileSelect(name, lang)}
                  onContextMenu={(e) => openContextMenu(e, name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onFileSelect(name, lang);
                    }
                  }}
                  className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs"
                  style={{
                    background: isActive ? "var(--bg-tertiary)" : "transparent",
                    color: "var(--text-primary)",
                  }}
                >
                  <span style={{ color: icon.color, fontWeight: 700, fontSize: 9 }}>
                    {icon.icon}
                  </span>
                  <span className="flex-1 truncate">{name}</span>
                </div>
              )}
            </div>
          );
        })}

        {creating && (
          <input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={createFile}
            onKeyDown={(e) => {
              if (e.key === "Enter") createFile();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder="filename.js"
            className="w-full rounded px-2 py-1 text-xs outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent)",
            }}
          />
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 rounded py-1 text-xs shadow-lg"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            minWidth: 140,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left hover:opacity-70"
            style={{ color: "var(--text-primary)" }}
            onClick={() => {
              setRenamingFile(contextMenu.filename);
              setRenameTo(contextMenu.filename);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left hover:opacity-70"
            style={{ color: "var(--red)" }}
            onClick={() => {
              deleteFile(contextMenu.filename);
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
