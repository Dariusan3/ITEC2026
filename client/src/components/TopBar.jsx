import { useState, useEffect } from "react";
import JSZip from "jszip";
import { wsProvider, roomId, getYText, yFiles } from "../lib/yjs";
import { useAuth } from "../lib/auth";
import SettingsPanel from "./SettingsPanel";

const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "html",
  "css",
  "json",
];

export default function TopBar({ settings, onSettingsChange,
  filename,
  language,
  onLanguageChange,
  onRun,
  running,
  viewOnly = false,
}) {
  const [users, setUsers] = useState([]);
  const [copied, setCopied] = useState(false);
  const [gistState, setGistState] = useState("idle");
  const [showSettings, setShowSettings] = useState(false);
  const { user, login, logout } = useAuth();

  useEffect(() => {
    if (user) {
      wsProvider.awareness.setLocalStateField("user", {
        name: user.name || user.login,
        color: wsProvider.awareness.getLocalState()?.user?.color || "#cba6f7",
        avatar: user.avatar,
      });
    }
  }, [user]);

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

  const handleGist = async () => {
    if (gistState === "saving") return;
    setGistState("saving");
    try {
      const content = getYText(filename).toString();
      const res = await fetch("/api/gist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGistState("done");
      window.open(data.url, "_blank", "noopener");
      setTimeout(() => setGistState("idle"), 3000);
    } catch {
      setGistState("error");
      setTimeout(() => setGistState("idle"), 3000);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // C2: Read-only share link
  const handleShareReadOnly = () => {
    const url = `${window.location.origin}${window.location.pathname}?view=1#${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // P2: Fork session — open new room with same files
  const handleFork = () => {
    const newRoom = Math.random().toString(36).slice(2, 10);
    const forkedFiles = {};
    yFiles.forEach((meta, fname) => {
      forkedFiles[fname] = { meta, content: getYText(fname).toString() };
    });
    // Store fork payload in sessionStorage for the new tab to pick up
    sessionStorage.setItem(`itecify-fork-${newRoom}`, JSON.stringify(forkedFiles));
    window.open(`${window.location.origin}${window.location.pathname}?fork=${newRoom}#${newRoom}`, "_blank");
  };

  // P1: ZIP export
  const handleZip = async () => {
    const zip = new JSZip();
    yFiles.forEach((_, fname) => {
      zip.file(fname, getYText(fname).toString());
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `itecify-${roomId}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
          }}
        >
          #{roomId}
        </span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {filename}
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="cursor-pointer rounded border px-2 py-1 text-xs outline-none"
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleShare}
          className="rounded px-3 py-1 text-xs font-semibold transition-all"
          style={{
            background: copied ? "var(--green)" : "var(--bg-tertiary)",
            color: copied ? "var(--bg-primary)" : "var(--accent)",
            border: "1px solid var(--accent)",
          }}
        >
          {copied ? "✓ Copied!" : "⎘ Share"}
        </button>

        <button
          type="button"
          onClick={handleShareReadOnly}
          title="Copy read-only link"
          className="rounded px-3 py-1 text-xs font-semibold transition-all"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          👁 View link
        </button>

        <button
          type="button"
          onClick={handleFork}
          title="Fork this session into a new room"
          className="rounded px-3 py-1 text-xs font-semibold transition-all"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          ⑂ Fork
        </button>

        <button
          type="button"
          onClick={handleZip}
          title="Download all files as ZIP"
          className="rounded px-3 py-1 text-xs font-semibold transition-all"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          ↓ ZIP
        </button>

        <button
          type="button"
          onClick={handleGist}
          disabled={gistState === "saving"}
          className="rounded px-3 py-1 text-xs font-semibold transition-all"
          style={{
            background:
              gistState === "done"
                ? "var(--green)"
                : gistState === "error"
                  ? "var(--red)"
                  : "var(--bg-tertiary)",
            color:
              gistState === "done" || gistState === "error"
                ? "var(--bg-primary)"
                : "var(--text-secondary)",
            border: "1px solid var(--border)",
            opacity: gistState === "saving" ? 0.6 : 1,
          }}
        >
          {gistState === "saving"
            ? "..."
            : gistState === "done"
              ? "✓ Gist"
              : gistState === "error"
                ? "✗ Failed"
                : "↗ Gist"}
        </button>

        {viewOnly && (
          <span className="rounded px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            👁 View only
          </span>
        )}
        {!viewOnly && onRun && (
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className="rounded px-3 py-1 text-xs font-semibold transition-opacity"
            style={{
              background: "var(--green)",
              color: "var(--bg-primary)",
              opacity: running ? 0.5 : 1,
            }}
          >
            {running ? "⏳ Running..." : "▶ Run"}
          </button>
        )}

        {user === null && (
          <button
            type="button"
            onClick={login}
            className="rounded px-3 py-1 text-xs font-semibold"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            ⇢ Login with GitHub
          </button>
        )}
        {user && (
          <div className="flex items-center gap-1.5">
            {user.avatar && (
              <img
                src={user.avatar}
                alt={user.name}
                className="h-6 w-6 rounded-full"
              />
            )}
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {user.name || user.login}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              out
            </button>
          </div>
        )}

        {/* Settings gear */}
        <div className="relative">
          <button
            onClick={() => setShowSettings(s => !s)}
            className="text-sm px-2 py-1 rounded hover:opacity-70"
            style={{ color: showSettings ? 'var(--accent)' : 'var(--text-secondary)' }}
            title="Editor settings"
          >⚙</button>
          {showSettings && settings && (
            <SettingsPanel
              settings={settings}
              onChange={onSettingsChange}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>

        <div className="flex min-w-0 items-center -space-x-2">
          {users.map((u) => (
            <div
              key={u.clientId}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:h-9 sm:w-9 sm:text-sm"
              style={{
                background: u.color,
                borderColor: "var(--bg-secondary)",
                color: "var(--bg-primary)",
              }}
              title={u.name}
            >
              {u.name[0]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
