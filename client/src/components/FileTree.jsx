import { useState, useEffect, useRef } from 'react'
import { yFiles, getYText } from '../lib/yjs'

const LANG_ICONS = {
  javascript: { icon: 'JS', color: '#f9e2af' },
  typescript: { icon: 'TS', color: '#89b4fa' },
  python:     { icon: 'PY', color: '#a6e3a1' },
  rust:       { icon: 'RS', color: '#fab387' },
  go:         { icon: 'GO', color: '#89dceb' },
  java:       { icon: 'JV', color: '#f38ba8' },
  c:          { icon: 'C',  color: '#fab387' },
  html:       { icon: 'HT', color: '#f38ba8' },
  css:        { icon: 'CS', color: '#89dceb' },
  json:       { icon: '{}', color: '#cba6f7' },
}

const EXT_TO_LANG = {
  js: 'javascript', ts: 'typescript', py: 'python',
  rs: 'rust', go: 'go', java: 'java', c: 'c',
  html: 'html', css: 'css', json: 'json',
}

function guessLang(filename) {
  const ext = filename.split('.').pop()
  return EXT_TO_LANG[ext] || 'javascript'
}

/** Build a nested tree from flat paths like ["src/index.js", "main.js"] */
function buildTree(files) {
  const root = {}
  for (const { name, language } of files) {
    const parts = name.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      if (!node[part]) {
        node[part] = isFile
          ? { __file: true, path: name, language }
          : { __file: false, children: {} }
      }
      if (!isFile) node = node[part].children
    }
  }
  return root
}

function TreeNode({
  name, node, depth, activeFile, onFileSelect,
  onContextMenu, openFolders, toggleFolder, creatingIn, setCreatingIn,
}) {
  const isFile = node.__file
  const indent = depth * 12

  if (isFile) {
    const icon = LANG_ICONS[node.language] || LANG_ICONS.javascript
    const isActive = activeFile === node.path
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onFileSelect(node.path, node.language)}
        onContextMenu={(e) => onContextMenu(e, node.path)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFileSelect(node.path, node.language) }
        }}
        className="group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs"
        style={{
          paddingLeft: indent + 8,
          background: isActive ? 'var(--bg-tertiary)' : 'transparent',
          color: 'var(--text-primary)',
        }}
      >
        <span style={{ color: icon.color, fontWeight: 700, fontSize: 9, minWidth: 14 }}>{icon.icon}</span>
        <span className="flex-1 truncate">{name}</span>
      </div>
    )
  }

  // Folder node
  const folderPath = node.__folderPath
  const isOpen = openFolders.has(folderPath)

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleFolder(folderPath)}
        onContextMenu={(e) => onContextMenu(e, null, folderPath)}
        onKeyDown={(e) => { if (e.key === 'Enter') toggleFolder(folderPath) }}
        className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs hover:opacity-80"
        style={{ paddingLeft: indent + 8, color: 'var(--text-secondary)' }}
      >
        <span style={{ fontSize: 9 }}>{isOpen ? '▼' : '▶'}</span>
        <span style={{ fontSize: 10 }}>📁</span>
        <span className="flex-1 truncate font-medium">{name}</span>
        <button
          type="button"
          title="New file in folder"
          onClick={(e) => { e.stopPropagation(); setCreatingIn(folderPath) }}
          className="opacity-0 group-hover:opacity-100 text-xs px-1 hover:opacity-70"
          style={{ color: 'var(--accent)' }}
        >+</button>
      </div>
      {isOpen && (
        <div>
          {Object.entries(node.children)
            .sort(([, a], [, b]) => {
              if (!a.__file && b.__file) return -1
              if (a.__file && !b.__file) return 1
              return 0
            })
            .map(([childName, childNode]) => (
              <TreeNode
                key={childName}
                name={childName}
                node={childNode}
                depth={depth + 1}
                activeFile={activeFile}
                onFileSelect={onFileSelect}
                onContextMenu={onContextMenu}
                openFolders={openFolders}
                toggleFolder={toggleFolder}
                creatingIn={creatingIn}
                setCreatingIn={setCreatingIn}
              />
            ))}
          {creatingIn === folderPath && null /* handled by parent */}
        </div>
      )}
    </div>
  )
}

export default function FileTree({ activeFile, onFileSelect }) {
  const [files, setFiles] = useState([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [creatingIn, setCreatingIn] = useState(null) // folder path or null = root
  const [renamingFile, setRenamingFile] = useState(null)
  const [renameTo, setRenameTo] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [openFolders, setOpenFolders] = useState(new Set())
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
    if (creating || creatingIn !== null) newInputRef.current?.focus()
  }, [creating, creatingIn])

  useEffect(() => {
    if (renamingFile) renameInputRef.current?.focus()
  }, [renamingFile])

  const toggleFolder = (folderPath) => {
    setOpenFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }

  const createFile = () => {
    let trimmed = newName.trim()
    if (!trimmed) { setCreating(false); setCreatingIn(null); setNewName(''); return }
    // Prepend folder prefix if creating inside a folder
    if (creatingIn) trimmed = `${creatingIn}/${trimmed}`
    if (yFiles.has(trimmed)) { alert(`"${trimmed}" already exists`); return }
    const lang = guessLang(trimmed)
    yFiles.set(trimmed, { language: lang })
    getYText(trimmed)
    // Auto-open the parent folder
    const parts = trimmed.split('/')
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join('/')
      setOpenFolders(prev => new Set([...prev, folder]))
    }
    onFileSelect(trimmed, lang)
    setCreating(false)
    setCreatingIn(null)
    setNewName('')
  }

  const createFolder = () => {
    let trimmed = newName.trim()
    if (!trimmed) { setCreating(false); setCreatingIn(null); setNewName(''); return }
    // A folder is represented by a placeholder .gitkeep file
    const folderPath = creatingIn ? `${creatingIn}/${trimmed}` : trimmed
    const placeholder = `${folderPath}/.gitkeep`
    if (!yFiles.has(placeholder)) {
      yFiles.set(placeholder, { language: 'json' })
      getYText(placeholder)
    }
    setOpenFolders(prev => new Set([...prev, folderPath]))
    setCreating(false)
    setCreatingIn(null)
    setNewName('')
  }

  const [creatingFolder, setCreatingFolder] = useState(false)

  const startCreateFile = (folderPath = null) => {
    setCreatingFolder(false)
    setCreatingIn(folderPath)
    setCreating(true)
    setNewName('')
  }

  const startCreateFolder = () => {
    setCreatingFolder(true)
    setCreatingIn(null)
    setCreating(true)
    setNewName('')
  }

  const handleCreate = () => {
    if (creatingFolder) createFolder()
    else createFile()
  }

  const renameFile = () => {
    const trimmed = renameTo.trim()
    if (!trimmed || trimmed === renamingFile) { setRenamingFile(null); return }
    if (yFiles.has(trimmed)) { alert(`"${trimmed}" already exists`); return }
    const oldText = getYText(renamingFile).toString()
    const lang = guessLang(trimmed)
    yFiles.delete(renamingFile)
    yFiles.set(trimmed, { language: lang })
    if (oldText) getYText(trimmed).insert(0, oldText)
    if (activeFile === renamingFile) onFileSelect(trimmed, lang)
    setRenamingFile(null)
    setRenameTo('')
  }

  const deleteFile = (filename) => {
    const nonKeep = [...yFiles.keys()].filter(k => !k.endsWith('.gitkeep'))
    if (nonKeep.length <= 1 && !filename.endsWith('.gitkeep')) {
      alert('Cannot delete the last file')
      return
    }
    if (!confirm(`Delete "${filename}"?`)) return
    yFiles.delete(filename)
    if (activeFile === filename) {
      const remaining = []
      yFiles.forEach((_, n) => { if (!n.endsWith('.gitkeep')) remaining.push(n) })
      if (remaining.length > 0) onFileSelect(remaining[0], yFiles.get(remaining[0]).language)
    }
  }

  const deleteFolder = (folderPath) => {
    const children = [...yFiles.keys()].filter(k => k.startsWith(folderPath + '/'))
    if (!confirm(`Delete folder "${folderPath}" and all ${children.length} file(s)?`)) return
    children.forEach(k => yFiles.delete(k))
    if (children.includes(activeFile)) {
      const remaining = [...yFiles.keys()].filter(k => !k.endsWith('.gitkeep'))
      if (remaining.length > 0) onFileSelect(remaining[0], yFiles.get(remaining[0]).language)
    }
  }

  const openContextMenu = (e, filename, folderPath = null) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, filename, folderPath })
  }

  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  // Build tree, inject __folderPath into folder nodes
  function buildTreeWithPaths(files) {
    const tree = buildTree(files)
    function annotate(node, path) {
      for (const [k, v] of Object.entries(node)) {
        if (!v.__file) {
          v.__folderPath = path ? `${path}/${k}` : k
          annotate(v.children, v.__folderPath)
        }
      }
    }
    annotate(tree, '')
    return tree
  }

  const tree = buildTreeWithPaths(files.filter(f => !f.name.endsWith('.gitkeep')))
  const visibleFiles = files.filter(f => !f.name.endsWith('.gitkeep'))

  return (
    <div
      className="flex h-full w-48 flex-col select-none border-r"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Explorer
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => startCreateFile()}
            className="text-sm font-bold leading-none hover:opacity-70"
            style={{ color: 'var(--accent)' }}
            title="New file"
          >+</button>
          <button
            type="button"
            onClick={startCreateFolder}
            className="text-sm font-bold leading-none hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            title="New folder"
          >⊕</button>
        </div>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-1">
        {/* Render tree */}
        {Object.entries(tree)
          .sort(([, a], [, b]) => {
            if (!a.__file && b.__file) return -1
            if (a.__file && !b.__file) return 1
            return 0
          })
          .map(([name, node]) => {
            if (node.__file && renamingFile === node.path) {
              return (
                <input
                  key={name}
                  ref={renameInputRef}
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  onBlur={renameFile}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameFile()
                    if (e.key === 'Escape') setRenamingFile(null)
                  }}
                  className="w-full rounded px-2 py-1 text-xs outline-none"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
                />
              )
            }
            return (
              <TreeNode
                key={name}
                name={name}
                node={node}
                depth={0}
                activeFile={activeFile}
                onFileSelect={onFileSelect}
                onContextMenu={openContextMenu}
                openFolders={openFolders}
                toggleFolder={toggleFolder}
                creatingIn={creatingIn}
                setCreatingIn={(folder) => startCreateFile(folder)}
              />
            )
          })}

        {creating && (
          <div className="px-1">
            <input
              ref={newInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setCreatingIn(null); setNewName('') }
              }}
              placeholder={creatingFolder ? 'folder-name' : creatingIn ? `${creatingIn}/filename.js` : 'filename.js'}
              className="w-full rounded px-2 py-1 text-xs outline-none"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
            />
            {creatingIn && (
              <p className="text-[9px] px-1 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                in {creatingIn}/
              </p>
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 rounded py-1 text-xs shadow-lg"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            minWidth: 150,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.filename && (
            <>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:opacity-70"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => {
                  setRenamingFile(contextMenu.filename)
                  setRenameTo(contextMenu.filename)
                  setContextMenu(null)
                }}
              >Rename</button>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:opacity-70"
                style={{ color: 'var(--red)' }}
                onClick={() => { deleteFile(contextMenu.filename); setContextMenu(null) }}
              >Delete</button>
            </>
          )}
          {contextMenu.folderPath && (
            <>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:opacity-70"
                style={{ color: 'var(--accent)' }}
                onClick={() => { startCreateFile(contextMenu.folderPath); setContextMenu(null) }}
              >New file here</button>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:opacity-70"
                style={{ color: 'var(--red)' }}
                onClick={() => { deleteFolder(contextMenu.folderPath); setContextMenu(null) }}
              >Delete folder</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
