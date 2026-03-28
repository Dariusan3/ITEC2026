import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as monaco from "monaco-editor";
import { MonacoBinding } from "y-monaco";
import { ydoc, wsProvider, getYText, yAiBlocks } from "../lib/yjs";
import { extractJsonStringField } from "../lib/extractJsonStringField";
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

/** Normalize AI suggestion: JSON wrapper, markdown fences, JSON invalid de la model */
function normalizeAiSuggestion(raw) {
  let code = raw ?? "";
  if (typeof code === "string" && code.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(code);
      if (parsed.suggestion != null) code = String(parsed.suggestion);
    } catch {
      const loose = extractJsonStringField(code, "suggestion");
      if (loose != null) code = loose;
    }
  }
  return code
    .replace(/^```[\w]*\n?/, "")
    .replace(/\n?```$/, "");
}

const Editor = forwardRef(function Editor(
  { language, activeFile, settings = {}, readOnly = false },
  ref,
) {
  const keymap = settings.keymap || "default";
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const bindingRef = useRef(null);
  const decorationsRef = useRef(new Map());
  const widgetsRef = useRef(new Map());
  const keymapRef = useRef(null);

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
    const code = normalizeAiSuggestion(block.suggestion);
    editor.executeEdits("ai-accept", [
      {
        range: {
          startLineNumber: targetLine,
          startColumn: lineContent.length + 1,
          endLineNumber: targetLine,
          endColumn: lineContent.length + 1,
        },
        text: "\n" + code,
      },
    ]);
    yAiBlocks.delete(blockId);
  }, []);

  const rejectBlock = useCallback((blockId) => {
    yAiBlocks.delete(blockId);
  }, []);

  const renderAiBlocks = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    widgetsRef.current.forEach((w) => editor.removeContentWidget(w));
    widgetsRef.current.clear();
    decorationsRef.current.forEach((c) => c.clear());
    decorationsRef.current.clear();

    yAiBlocks.forEach((block, blockId) => {
      if (block.status !== "pending") return;
      const targetLine = Math.min(block.line, editor.getModel().getLineCount());
      const displaySuggestion = normalizeAiSuggestion(block.suggestion);

      const newDecorations = editor.createDecorationsCollection([
        {
          range: new monaco.Range(targetLine, 1, targetLine, 1),
          options: {
            isWholeLine: true,
            className: AI_BLOCK_CLASS,
            glyphMarginClassName: "ai-block-glyph",
          },
        },
      ]);
      decorationsRef.current.set(blockId, newDecorations);

      const domNode = document.createElement("div");
      domNode.className = "ai-block-widget";
      domNode.innerHTML = `
        <div class="ai-block-header">
          <span class="ai-block-label">Claude suggests:</span>
          <span class="ai-block-explanation">${escapeHtml(block.explanation)}</span>
        </div>
        <pre class="ai-block-code">${escapeHtml(displaySuggestion)}</pre>
        <div class="ai-block-actions">
          <button class="ai-block-accept" data-block-id="${blockId}">Accept</button>
          <button class="ai-block-reject" data-block-id="${blockId}">Reject</button>
        </div>`;
      domNode
        .querySelector(".ai-block-accept")
        .addEventListener("click", () => acceptBlock(blockId));
      domNode
        .querySelector(".ai-block-reject")
        .addEventListener("click", () => rejectBlock(blockId));

      const widget = {
        getId: () => `ai-widget-${blockId}`,
        getDomNode: () => domNode,
        getPosition: () => ({
          position: { lineNumber: targetLine + 1, column: 1 },
          preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
        }),
      };
      editor.addContentWidget(widget);
      widgetsRef.current.set(blockId, widget);
    });
  }, [acceptBlock, rejectBlock]);

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
          /* silently ignore formatting errors */
        }
      },
    });

    const observer = () => renderAiBlocks();
    yAiBlocks.observe(observer);
    renderAiBlocks();
    return () => {
      yAiBlocks.unobserve(observer);
      widgetsRef.current.forEach((w) => editor.removeContentWidget(w));
      editor.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderAiBlocks]); // language + readOnly intentionally omitted — editor is created once

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

  // Sync read-only (e.g. view-only room) without recreating the editor
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  /** Culori Figma-like pentru selecții remote (y-monaco folosește clase yRemoteSelection-{id}). */
  useEffect(() => {
    const STYLE_ID = "itecify-remote-awareness-styles";

    function hexToRgba(hex, alpha) {
      const h = String(hex).replace("#", "");
      if (h.length !== 6) return `rgba(203, 166, 247, ${alpha})`;
      const n = parseInt(h, 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    }

    const applyRemoteStyles = () => {
      let el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
      }
      const localId = wsProvider.awareness.clientID;
      const states = wsProvider.awareness.getStates();
      const rules = [];
      states.forEach((state, clientId) => {
        if (clientId === localId || !state.user?.name) return;
        const { name, color } = state.user;
        const c = color || "#cba6f7";
        const id = String(clientId);
        const label = JSON.stringify(name);
        rules.push(
          `.monaco-editor .yRemoteSelection-${id}{background-color:${hexToRgba(c, 0.14)}!important;border-radius:2px;}`,
          `.monaco-editor .yRemoteSelectionHead-${id}{border-left:2px solid ${c}!important;opacity:1;border-radius:0 1px 1px 0;}`,
          `.monaco-editor .yRemoteSelectionHead-${id}::after{content:${label};position:absolute;top:-20px;left:0;transform:translateX(-1px);font-size:10px;font-weight:500;letter-spacing:0.02em;line-height:1.2;padding:4px 9px;border-radius:6px;white-space:nowrap;pointer-events:none;z-index:30;color:#e8eaf0;background:#000000;border:1px solid ${c};box-shadow:0 2px 10px rgba(0,0,0,0.55);}`,
        );
      });
      el.textContent = rules.join("");
    };

    wsProvider.awareness.on("change", applyRemoteStyles);
    applyRemoteStyles();
    return () => {
      wsProvider.awareness.off("change", applyRemoteStyles);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

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
    </div>
  );
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default Editor;
