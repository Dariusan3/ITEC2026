import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { yFiles, getYText } from "../lib/yjs";
import { CloseIcon } from "./ui/Icons";

/**
 * Search across the entire workspace (content + file name).
 */
export default function WorkspaceSearch({
  open,
  onClose,
  onOpenResult,
  initialQuery = "",
}) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef(null);
  const [results, setResults] = useState([]);
  const [fileStamp, setFileStamp] = useState(0);

  useEffect(() => {
    const onChange = () => setFileStamp((n) => n + 1);
    yFiles.observe(onChange);
    return () => yFiles.unobserve(onChange);
  }, []);

  const filesList = useMemo(() => {
    const list = [];
    yFiles.forEach((meta, name) => {
      list.push({ name, language: meta?.language || "javascript" });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [open, fileStamp]);

  const runSearch = useCallback(
    (q) => {
      const needle = q.trim();
      if (!needle) {
        setResults([]);
        return;
      }
      const lower = needle.toLowerCase();
      const maxResults = 80;
      const out = [];

      for (const { name, language } of filesList) {
        if (out.length >= maxResults) break;
        if (name.toLowerCase().includes(lower)) {
          out.push({
            file: name,
            line: 1,
            column: 1,
            preview: name,
            language,
            kind: "file",
          });
          continue;
        }
        const text = getYText(name).toString();
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (out.length >= maxResults) break;
          const line = lines[i];
          const idx = line.toLowerCase().indexOf(lower);
          if (idx !== -1) {
            const start = Math.max(0, idx - 24);
            const snippet = line.slice(start, start + 48 + needle.length);
            out.push({
              file: name,
              line: i + 1,
              column: idx + 1,
              preview: snippet.trim() || line.slice(0, 60),
              language,
              kind: "content",
            });
          }
        }
      }
      setResults(out.slice(0, maxResults));
    },
    [filesList],
  );

  useEffect(() => {
    if (!open) return;
    const t1 = setTimeout(() => runSearch(initialQuery), 0);
    const t2 = setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, initialQuery, runSearch]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), query.length < 2 ? 0 : 200);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(5, 8, 6, 0.72)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Search workspace"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="soft-card w-full max-w-xl overflow-hidden rounded-none border shadow-[0_24px_48px_rgba(0,0,0,0.4)]"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files…"
            className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-none p-2 opacity-70 hover:opacity-100"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <ul
          className="max-h-[min(50vh,22rem)] overflow-auto py-1 text-left"
          style={{ color: "var(--text-primary)" }}
        >
          {results.length === 0 && query.trim().length >= 2 && (
            <li
              className="px-4 py-6 text-center text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              No results
            </li>
          )}
          {query.trim().length < 2 && (
            <li
              className="px-4 py-6 text-center text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Type at least 2 characters
            </li>
          )}
          {results.map((r, i) => (
            <li key={`${r.file}:${r.line}:${r.column}:${i}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:brightness-110"
                style={{
                  background: "transparent",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                onClick={() => {
                  onOpenResult(r.file, r.language, {
                    line: r.line,
                    column: r.column,
                  });
                  onClose();
                }}
              >
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--accent)" }}
                >
                  {r.file}{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    :{r.line}:{r.column}
                  </span>
                </span>
                <span className="line-clamp-2 text-[10px] opacity-90">
                  {r.preview}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
