import { useRef, useEffect } from 'react'
import * as monaco from 'monaco-editor'
import { MonacoBinding } from 'y-monaco'
import { wsProvider, ytext } from '../lib/yjs'

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

export default function Editor({ language }) {
  const containerRef = useRef(null)
  const editorRef = useRef(null)
  const bindingRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      language,
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      minimap: { enabled: false },
      padding: { top: 12 },
      lineNumbers: 'on',
      roundedSelection: true,
      scrollBeyondLastLine: false,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      renderLineHighlight: 'gutter',
      tabSize: 2,
    })
    editorRef.current = editor

    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      wsProvider.awareness
    )
    bindingRef.current = binding

    return () => {
      binding.destroy()
      editor.dispose()
    }
  }, [])

  useEffect(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, language)
      }
    }
  }, [language])

  return <div ref={containerRef} className="w-full h-full" />
}
