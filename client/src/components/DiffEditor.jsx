import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";

export default function DiffEditor({
  originalLabel,
  modifiedLabel,
  originalValue,
  modifiedValue,
  language,
}) {
  const containerRef = useRef(null);
  const diffRef = useRef(null);
  const originalModelRef = useRef(null);
  const modifiedModelRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
      theme: "vs-dark",
      automaticLayout: true,
      readOnly: true,
      minimap: { enabled: false },
      renderSideBySide: true,
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: "on",
      padding: { top: 12 },
    });

    const originalModel = monaco.editor.createModel(
      originalValue,
      language,
      monaco.Uri.parse(`file:///diff/original/${encodeURIComponent(originalLabel)}`),
    );
    const modifiedModel = monaco.editor.createModel(
      modifiedValue,
      language,
      monaco.Uri.parse(`file:///diff/modified/${encodeURIComponent(modifiedLabel)}`),
    );

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    diffRef.current = diffEditor;
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    return () => {
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, []);

  useEffect(() => {
    originalModelRef.current?.setValue(originalValue);
    modifiedModelRef.current?.setValue(modifiedValue);
  }, [originalValue, modifiedValue]);

  useEffect(() => {
    if (originalModelRef.current) {
      monaco.editor.setModelLanguage(originalModelRef.current, language);
    }
    if (modifiedModelRef.current) {
      monaco.editor.setModelLanguage(modifiedModelRef.current, language);
    }
  }, [language]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-[11px] uppercase tracking-wider"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        <span>{originalLabel}</span>
        <span style={{ color: "var(--accent)" }}>Diff View</span>
        <span>{modifiedLabel}</span>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
