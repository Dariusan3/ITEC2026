import { useState, useEffect } from "react";
import { wsProvider } from "../lib/yjs";

const LANGUAGES = [
  "javascript",
  "python",
  "rust",
  "typescript",
  "html",
  "css",
  "json",
];

export default function TopBar({ language, onLanguageChange, onRun, running }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const awareness = wsProvider.awareness;
    const update = () => {
      const seen = new Set();
      const states = [];
      awareness.getStates().forEach((state, clientId) => {
        if (state.user && !seen.has(state.user.name)) {
          seen.add(state.user.name);
          states.push({ ...state.user, clientId });
        }
      });
      setUsers(states);
    };
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, []);

  return (
    <div
      className="flex h-12 w-full items-center justify-between gap-3 border-b px-4 sm:gap-4 sm:px-5"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="shrink-0 text-base font-bold tracking-tight sm:text-lg"
          style={{ color: "var(--accent)" }}
        >
          iTECify
        </span>
        <div className="flex min-w-0 items-center -space-x-2">
          {users.map((user) => (
            <div
              key={user.clientId}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:h-9 sm:w-9 sm:text-sm"
              style={{
                background: user.color,
                borderColor: "var(--bg-secondary)",
                color: "var(--bg-primary)",
              }}
              title={user.name}
            >
              {user.name[0]}
            </div>
          ))}
        </div>
      </div>

      <nav
        className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-2 overflow-x-auto text-xs sm:text-sm"
        style={{ color: "var(--text-secondary)" }}
        aria-label="Rulează și limbă"
      >
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold tracking-wide transition-opacity sm:px-5 sm:text-base"
          style={{
            background: "var(--green)",
            color: "var(--bg-primary)",
            opacity: running ? 0.5 : 1,
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
          }}
        >
          {running ? "Running…" : "RUN"}
        </button>

        <span className="shrink-0 select-none opacity-50" aria-hidden>
          |
        </span>

        {LANGUAGES.map((lang, i) => (
          <span key={lang} className="flex shrink-0 items-center gap-2">
            {i > 0 && (
              <span className="select-none opacity-50" aria-hidden>
                |
              </span>
            )}
            <button
              type="button"
              onClick={() => onLanguageChange(lang)}
              className="rounded px-1 py-0.5 font-medium transition-colors hover:opacity-90"
              style={{
                color:
                  language === lang ? "var(--accent)" : "var(--text-primary)",
                textDecoration: language === lang ? "underline" : "none",
                textUnderlineOffset: "4px",
              }}
            >
              {lang}
            </button>
          </span>
        ))}
        <span className="shrink-0 select-none opacity-50" aria-hidden>
          |
        </span>
      </nav>
    </div>
  );
}
