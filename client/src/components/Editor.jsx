import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import * as monaco from 'monaco-editor'
import { MonacoBinding } from 'y-monaco'
import { wsProvider, ytext, yAiBlocks } from '../lib/yjs'

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

const AI_BLOCK_CLASS = 'ai-block-decoration'

const Editor = forwardRef(function Editor({ language }, ref) {
  const containerRef = useRef(null)
  const editorRef = useRef(null)
  const bindingRef = useRef(null)
  const decorationsRef = useRef(new Map())
  const widgetsRef = useRef(new Map())

  useImperativeHandle(ref, () => ({
    getPosition: () => editorRef.current?.getPosition(),
    getEditor: () => editorRef.current,
  }))

  const acceptBlock = useCallback((blockId) => {
    const block = yAiBlocks.get(blockId)
    if (!block || !editorRef.current) return

    const editor = editorRef.current
    const model = editor.getModel()
    const line = block.line
    const lineCount = model.getLineCount()
    const targetLine = Math.min(line, lineCount)
    const lineContent = model.getLineContent(targetLine)

    // Insert suggestion after the target line
    const insertPosition = {
      startLineNumber: targetLine,
      startColumn: lineContent.length + 1,
      endLineNumber: targetLine,
      endColumn: lineContent.length + 1,
    }
    editor.executeEdits('ai-accept', [{
      range: insertPosition,
      text: '\n' + block.suggestion,
    }])

    yAiBlocks.delete(blockId)
  }, [])

  const rejectBlock = useCallback((blockId) => {
    yAiBlocks.delete(blockId)
  }, [])

  const renderAiBlocks = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    // Clear old widgets
    widgetsRef.current.forEach((widget) => {
      editor.removeContentWidget(widget)
    })
    widgetsRef.current.clear()

    // Clear old decorations
    decorationsRef.current.forEach((collection) => collection.clear())
    decorationsRef.current.clear()

    // Render current blocks
    yAiBlocks.forEach((block, blockId) => {
      if (block.status !== 'pending') return

      const model = editor.getModel()
      const lineCount = model.getLineCount()
      const targetLine = Math.min(block.line, lineCount)

      // Add line decoration (purple gutter highlight)
      const newDecorations = editor.createDecorationsCollection([{
        range: new monaco.Range(targetLine, 1, targetLine, 1),
        options: {
          isWholeLine: true,
          className: AI_BLOCK_CLASS,
          glyphMarginClassName: 'ai-block-glyph',
        },
      }])
      decorationsRef.current.set(blockId, newDecorations)

      // Add content widget with suggestion + buttons
      const domNode = document.createElement('div')
      domNode.className = 'ai-block-widget'
      domNode.innerHTML = `
        <div class="ai-block-header">
          <span class="ai-block-label">Claude suggests:</span>
          <span class="ai-block-explanation">${escapeHtml(block.explanation)}</span>
        </div>
        <pre class="ai-block-code">${escapeHtml(block.suggestion)}</pre>
        <div class="ai-block-actions">
          <button class="ai-block-accept" data-block-id="${blockId}">Accept</button>
          <button class="ai-block-reject" data-block-id="${blockId}">Reject</button>
        </div>
      `

      domNode.querySelector('.ai-block-accept').addEventListener('click', () => acceptBlock(blockId))
      domNode.querySelector('.ai-block-reject').addEventListener('click', () => rejectBlock(blockId))

      const widget = {
        getId: () => `ai-widget-${blockId}`,
        getDomNode: () => domNode,
        getPosition: () => ({
          position: { lineNumber: targetLine + 1, column: 1 },
          preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
        }),
      }

      editor.addContentWidget(widget)
      widgetsRef.current.set(blockId, widget)
    })
  }, [acceptBlock, rejectBlock])

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

    // Listen for AI block changes from Yjs
    const observer = () => renderAiBlocks()
    yAiBlocks.observe(observer)
    renderAiBlocks()

    return () => {
      yAiBlocks.unobserve(observer)
      widgetsRef.current.forEach((widget) => editor.removeContentWidget(widget))
      binding.destroy()
      editor.dispose()
    }
  }, [renderAiBlocks])

  useEffect(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, language)
      }
    }
  }, [language])

  return <div ref={containerRef} className="w-full h-full" />
})

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default Editor
