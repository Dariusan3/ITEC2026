import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import * as Y from "yjs";
import * as monaco from "monaco-editor";
import { MonacoBinding } from "y-monaco";
import { ydoc, wsProvider, getYText, yAiBlocks } from "../lib/yjs";
import * as prettier from "prettier/standalone";
import prettierBabel from "prettier/plugins/babel";
import prettierEstree from "prettier/plugins/estree";
import prettierTypescript from "prettier/plugins/typescript";
import prettierPostcss from "prettier/plugins/postcss";
import prettierHtml from "prettier/plugins/html";

const PRETTIER_PARSERS = {
  javascript: { parser: "babel", plugins: [prettierBabel, prettierEstree] },
  typescript: {
    parser: "typescript",
    plugins: [prettierTypescript, prettierEstree],
  },
  css: { parser: "css", plugins: [prettierPostcss] },
  scss: { parser: "scss", plugins: [prettierPostcss] },
  html: { parser: "html", plugins: [prettierHtml] },
  json: { parser: "json", plugins: [prettierBabel, prettierEstree] },
};

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less")
      return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor")
      return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

const AI_BLOCK_CLASS = "ai-block-decoration";

const Editor = forwardRef(function Editor(
  { language, activeFile, settings = {}, readOnly = false },
  ref,
) {
  const keymap = settings.keymap || "default";
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const bindingRef = useRef(null);
  const keymapRef = useRef(null);
  const [aiBlocks, setAiBlocks] = useState([]);

  useImperativeHandle(ref, () => ({
    getPosition: () => editorRef.current?.getPosition(),
    getEditor: () => editorRef.current,
    getText: () => (activeFile ? getYText(activeFile).toString() : ""),
  }));

  const acceptBlock = useCallback((blockId) => {
    const block = yAiBlocks.get(blockId);
    if (!block || !editorRef.current) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    const targetLine = Math.min(block.line, model.getLineCount());
    const lineContent = model.getLineContent(targetLine);
    editor.executeEdits("ai-accept", [
      {
        range: {
          startLineNumber: targetLine,
          startColumn: lineContent.length + 1,
          endLineNumber: targetLine,
          endColumn: lineContent.length + 1,
        },
        text: "\n" + block.suggestion,
      },
    ]);
    yAiBlocks.delete(blockId);
  }, []);

  const rejectBlock = useCallback((blockId) => {
    yAiBlocks.delete(blockId);
  }, []);

  const syncAiBlocks = useCallback(() => {
    const blocks = [];
    yAiBlocks.forEach((block, blockId) => {
      if (block.status === "pending") blocks.push({ ...block, blockId });
    });
    setAiBlocks(blocks);
  }, []);

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    const editor = monaco.editor.create(containerRef.current, {
      language,
      theme: "vs-dark",
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      minimap: { enabled: false },
      padding: { top: 12 },
      lineNumbers: "on",
      roundedSelection: true,
      scrollBeyondLastLine: false,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      renderLineHighlight: "gutter",
      tabSize: 2,
      readOnly,
    });
    editorRef.current = editor;

    // Register Prettier format action (Shift+Alt+F)
    editor.addAction({
      id: "prettier-format",
      label: "Format Document (Prettier)",
      keybindings: [
        monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      ],
      run: async (ed) => {
        const model = ed.getModel();
        if (!model) return;
        const lang = model.getLanguageId();
        const config = PRETTIER_PARSERS[lang];
        if (!config) return;
        try {
          const formatted = await prettier.format(model.getValue(), {
            parser: config.parser,
            plugins: config.plugins,
            semi: true,
            singleQuote: true,
            tabWidth: 2,
            printWidth: 100,
          });
          const fullRange = model.getFullModelRange();
          ed.executeEdits("prettier", [{ range: fullRange, text: formatted }]);
        } catch {
          // Silently ignore formatting errors
        }
      },
    });

    const observer = () => syncAiBlocks();
    yAiBlocks.observe(observer);
    syncAiBlocks();
    return () => {
      yAiBlocks.unobserve(observer);
      editor.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncAiBlocks]); // language + readOnly intentionally omitted — editor is created once

  // Re-bind Yjs text when active file changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;

    // Destroy old binding
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }

    // Create a new Monaco model for this file
    const yFile = getYText(activeFile);
    const existingModel = monaco.editor
      .getModels()
      .find((m) => m.uri.toString() === `file:///${activeFile}`);
    const model =
      existingModel ||
      monaco.editor.createModel(
        yFile.toString(),
        language,
        monaco.Uri.parse(`file:///${activeFile}`),
      );
    editor.setModel(model);
    monaco.editor.setModelLanguage(model, language);

    const binding = new MonacoBinding(
      yFile,
      model,
      new Set([editor]),
      wsProvider.awareness,
    );
    bindingRef.current = binding;

    return () => {
      binding.destroy();
      bindingRef.current = null;
    };
  }, [activeFile]);

  // Update language when it changes without switching files
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [language]);

  // Apply settings (theme + editor options) reactively
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (settings.theme) monaco.editor.setTheme(settings.theme);
    editor.updateOptions({
      fontSize: settings.fontSize ?? 14,
      tabSize: settings.tabSize ?? 2,
      wordWrap: settings.wordWrap ? "on" : "off",
      minimap: { enabled: settings.minimap ?? false },
      lineNumbers: settings.lineNumbers !== false ? "on" : "off",
    });
  }, [settings]);

  // Cursor name labels for remote users
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const cursorWidgets = new Map();

    const updateCursors = () => {
      const states = wsProvider.awareness.getStates();
      const localId = wsProvider.awareness.clientID;
      const model = editor.getModel();
      if (!model) return;

      // Remove stale widgets
      for (const [id, widget] of cursorWidgets) {
        if (!states.has(id) || id === localId) {
          editor.removeContentWidget(widget);
          cursorWidgets.delete(id);
        }
      }

      for (const [clientId, state] of states) {
        if (clientId === localId || !state.user || !state.cursor) continue;

        let monacoPos;
        try {
          const abs = Y.createAbsolutePositionFromRelativePosition(
            state.cursor.head,
            ydoc,
          );
          if (!abs) continue;
          monacoPos = model.getPositionAt(abs.index);
        } catch {
          continue;
        }

        const existing = cursorWidgets.get(clientId);
        if (existing) {
          existing._pos = monacoPos;
          editor.layoutContentWidget(existing);
        } else {
          const dom = document.createElement("div");
          dom.style.cssText = [
            `background:${state.user.color}`,
            "color:#1e1e2e",
            "font-size:10px",
            "font-weight:700",
            "padding:1px 6px",
            "border-radius:3px 3px 3px 0",
            "pointer-events:none",
            "white-space:nowrap",
            "transform:translateY(-100%)",
            "margin-top:-2px",
          ].join(";");
          dom.textContent = state.user.name;

          const widget = {
            _pos: monacoPos,
            getId: () => `cursor-label-${clientId}`,
            getDomNode: () => dom,
            getPosition: () => ({
              position: widget._pos,
              preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
            }),
          };
          editor.addContentWidget(widget);
          cursorWidgets.set(clientId, widget);
        }
      }
    };

    wsProvider.awareness.on("change", updateCursors);
    updateCursors();
    return () => {
      wsProvider.awareness.off("change", updateCursors);
      cursorWidgets.forEach((w) => editor.removeContentWidget(w));
    };
  }, [activeFile]);

  // Vim / Emacs keybinding mode
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Tear down previous keymap
    if (keymapRef.current) {
      keymapRef.current.dispose?.();
      keymapRef.current = null;
    }

    if (keymap === "vim") {
      import("monaco-vim").then(({ initVimMode }) => {
        const statusNode = document.getElementById("vim-status-bar");
        keymapRef.current = initVimMode(editor, statusNode);
      });
    } else if (keymap === "emacs") {
      import("monaco-emacs").then(({ EmacsExtension }) => {
        const ext = new EmacsExtension(editor);
        ext.start();
        keymapRef.current = ext;
      });
    }

    return () => {
      keymapRef.current?.dispose?.();
      keymapRef.current = null;
    };
  }, [keymap]);

  return (
    <div className="w-full h-full flex flex-col relative">
      <div ref={containerRef} className="flex-1" />
      <div
        id="vim-status-bar"
        className="text-xs px-2 py-0.5 font-mono"
        style={{
          display: keymap === "vim" ? "block" : "none",
          background: "var(--bg-tertiary)",
          color: "var(--text-secondary)",
          borderTop: "1px solid var(--border)",
        }}
      />
      {aiBlocks.map((block, i) => (
        <DraggableAiPanel
          key={block.blockId}
          block={block}
          initialPos={{ x: 40 + i * 20, y: 40 + i * 20 }}
          onAccept={() => acceptBlock(block.blockId)}
          onReject={() => rejectBlock(block.blockId)}
        />
      ))}
    </div>
  );
});

function DraggableAiPanel({ block, initialPos, onAccept, onReject }) {
  const [pos, setPos] = useState(initialPos);
  const dragRef = useRef(null);

  const onMouseDown = (e) => {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "PRE") return;
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;

    const onMove = (me) =>
      setPos({ x: me.clientX - startX, y: me.clientY - startY });
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={dragRef}
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        zIndex: 50,
        width: 340,
        background: "#1e1e2e",
        border: "1.5px dashed #cba6f7",
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        cursor: "grab",
        userSelect: "none",
        fontFamily: "-apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#cba6f7" }}>
          ✦ Claude suggests
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#a6adc8",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {block.explanation}
        </span>
        <span style={{ fontSize: 10, color: "#585b70", cursor: "grab" }}>
          ⠿
        </span>
      </div>
      {/* Code */}
      <pre
        style={{
          background: "#181825",
          border: "1px solid #45475a",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#cdd6f4",
          overflowX: "auto",
          maxHeight: 220,
          overflowY: "auto",
          whiteSpace: "pre",
          marginBottom: 8,
          cursor: "text",
          userSelect: "text",
        }}
      >
        {block.suggestion}
      </pre>
      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onAccept}
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 0",
            borderRadius: 5,
            border: "none",
            background: "#a6e3a1",
            color: "#1e1e2e",
            cursor: "pointer",
          }}
        >
          ✓ Accept
        </button>
        <button
          onClick={onReject}
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 0",
            borderRadius: 5,
            border: "none",
            background: "#f38ba8",
            color: "#1e1e2e",
            cursor: "pointer",
          }}
        >
          ✕ Reject
        </button>
      </div>
    </div>
  );
}

export default Editor;
