import { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";
import { wsProvider, roomId, getYText, yFiles } from "../lib/yjs";
import { useAuth } from "../lib/auth";
import { SERVER_URL } from "../lib/config";
import SettingsPanel from "./SettingsPanel";
import {
  ArchiveIcon,
  ChevronDownIcon,
  EyeIcon,
  ForkIcon,
  LockIcon,
  LoginIcon,
  PlayIcon,
  SettingsIcon,
  ShareIcon,
  SparkIcon,
  CloseIcon,
} from "./ui/Icons";

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

/* ── shared button styles ─────────────────────────────────────── */

function Divider() {
  return (
    <span
      className="hidden h-6 w-px shrink-0 sm:block"
      style={{ background: "var(--border)" }}
      aria-hidden
    />
  );
}

function BrandMark() {
  return (
    <div className="flex shrink-0 items-center gap-3 select-none">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl border shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:h-11 sm:w-11"
        style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, white 12%) 0%, color-mix(in srgb, var(--accent) 68%, var(--blue) 32%) 100%)",
          borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border))",
        }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-5.5 sm:w-5.5" fill="none">
          <path d="M7 6.5h10M7 12h6.5M7 17.5h10" stroke="var(--bg-primary)" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16.5 9.5v5" stroke="rgba(24,24,37,0.68)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <div className="min-w-0">
        <span
          className="block shrink-0 text-[18px] font-black uppercase tracking-[-0.06em] sm:text-[21px]"
          style={{ color: "var(--text-primary)" }}
        >
          ITECIFY
        </span>
      </div>
    </div>
  );
}

function Btn({ onClick, disabled, className = "", style = {}, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-9 shrink-0 select-none items-center justify-center gap-1
        liquid-surface rounded-xl border px-3 text-[11px] font-semibold uppercase tracking-wide
        shadow-[0_10px_22px_rgba(0,0,0,0.16)]
        transition-all duration-150 ease-out
        hover:-translate-y-px hover:brightness-110
        active:scale-[0.93] active:opacity-80
        disabled:pointer-events-none disabled:opacity-45
        sm:h-10 sm:px-4 sm:text-xs
        ${className}`}
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-tertiary)",
        color: "var(--text-primary)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function LanguageDropdown({ language, onLanguageChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <Btn
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="min-w-[8.5rem] justify-between gap-2 sm:min-w-[9.25rem]"
        style={{
          background: open
            ? "color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))"
            : "var(--bg-tertiary)",
          borderColor: open
            ? "color-mix(in srgb, var(--accent) 28%, var(--border))"
            : "var(--border)",
        }}
      >
        <span className="truncate text-left">{language}</span>
        <span
          className={`ml-auto opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </Btn>
      {open && (
        <ul
          className="floating-panel absolute left-0 top-[calc(100%+10px)] z-50 max-h-72 min-w-[13rem] overflow-auto p-2.5"
          style={{
            transformOrigin: "top left",
          }}
          role="listbox"
        >
          {LANGUAGES.map((lang) => (
            <li key={lang} role="option" aria-selected={language === lang}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-2xl pl-4 pr-3 py-2.5 text-left text-[11px] font-semibold capitalize transition-all duration-150 hover:-translate-y-px hover:brightness-110 sm:text-xs"
                style={{
                  background:
                    language === lang
                      ? "color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))"
                      : "transparent",
                  color: language === lang ? "var(--accent)" : "var(--text-primary)",
                  boxShadow:
                    language === lang
                      ? "inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, var(--border))"
                      : "none",
                }}
                onClick={() => {
                  onLanguageChange(lang);
                  setOpen(false);
                }}
              >
                <span>{lang}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
                  style={{
                    color: language === lang ? "var(--bg-primary)" : "var(--text-secondary)",
                    background:
                      language === lang
                        ? "var(--accent)"
                        : "color-mix(in srgb, var(--bg-primary) 72%, var(--border))",
                  }}
                >
                  {lang.slice(0, 2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OnlineUsers({ wsProvider }) {
  const [users, setUsers] = useState([])

  useEffect(() => {
    function update() {
      const localId = wsProvider.awareness.clientID
      const states = []
      wsProvider.awareness.getStates().forEach((state, id) => {
        if (id !== localId && state.user?.name) {
          states.push({ id, name: state.user.name, color: state.user.color || '#cba6f7' })
        }
      })
      setUsers(states)
    }
    wsProvider.awareness.on('change', update)
    update()
    return () => wsProvider.awareness.off('change', update)
  }, [wsProvider])

  if (users.length === 0) return null

  return (
    <div className="flex items-center gap-1" title={`${users.length} other${users.length > 1 ? 's' : ''} online`}>
      {users.slice(0, 5).map((u) => (
        <div
          key={u.id}
          title={u.name}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
          style={{ background: u.color, color: '#1e1e2e', border: '1.5px solid var(--bg-primary)' }}
        >
          {u.name.slice(0, 2).toUpperCase()}
        </div>
      ))}
      {users.length > 5 && (
        <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>+{users.length - 5}</span>
      )}
    </div>
  )
}

export default function TopBar({
  settings,
  onSettingsChange,
  filename,
  language,
  onLanguageChange,
  onRun,
  running,
  onFollowUser,
  diffTargetFile,
  onOpenDiff,
  onCloseDiff,
  onPreview,
  previewBusy = false,
  onViteDemo,
  viewOnly = false,
}) {
  const [users, setUsers] = useState([]);
  const [files, setFiles] = useState([]);
  const [copied, setCopied] = useState(false);
  const [gistState, setGistState] = useState("idle");
  const [showSettings, setShowSettings] = useState(false);
  const [showDiffMenu, setShowDiffMenu] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [showMyRooms, setShowMyRooms] = useState(false);
  const [myRooms, setMyRooms] = useState([]);
  const diffMenuRef = useRef(null);
  const { user, loginGitHub, loginGoogle, logout } = useAuth();

  useEffect(() => {
    if (user) {
      wsProvider.awareness.setLocalStateField("user", {
        name: user.name || user.login,
        color: wsProvider.awareness.getLocalState()?.user?.color || "#8ff7a7",
        avatar: user.avatar,
      });
    }
  }, [user]);

  useEffect(() => {
    const updateFiles = () => {
      const next = [];
      yFiles.forEach((meta, name) => {
        next.push({ name, language: meta?.language || "javascript" });
      });
      next.sort((a, b) => a.name.localeCompare(b.name));
      setFiles(next);
    };
    yFiles.observe(updateFiles);
    updateFiles();
    return () => yFiles.unobserve(updateFiles);
  }, []);

  useEffect(() => {
    if (!showDiffMenu) return;
    const onDoc = (event) => {
      if (!diffMenuRef.current?.contains(event.target)) {
        setShowDiffMenu(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showDiffMenu]);

  useEffect(() => {
    const awareness = wsProvider.awareness;
    const update = () => {
      const seen = new Set();
      const states = [];
      awareness.getStates().forEach((state, clientId) => {
        if (state.user && !seen.has(state.user.name)) {
          seen.add(state.user.name);
          states.push({ ...state.user, cursor: state.cursor, clientId });
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
      const res = await fetch(`${SERVER_URL}/api/gist`, {
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

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleShareReadOnly = () => {
    const url = `${window.location.origin}${window.location.pathname}?view=1#${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleFork = () => {
    const newRoom = Math.random().toString(36).slice(2, 10);
    const forkedFiles = {};
    yFiles.forEach((meta, fname) => {
      forkedFiles[fname] = { meta, content: getYText(fname).toString() };
    });
    sessionStorage.setItem(`itecify-fork-${newRoom}`, JSON.stringify(forkedFiles));
    window.open(
      `${window.location.origin}${window.location.pathname}?fork=${newRoom}#${newRoom}`,
      "_blank",
    );
  };

  const handleSetPassword = async () => {
    const pw = passwordInput.trim();
    try {
      const res = await fetch(`${SERVER_URL}/api/room/${roomId}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      setPasswordMsg(pw ? "Password set!" : "Password removed.");
      setPasswordInput("");
      setTimeout(() => {
        setPasswordMsg("");
        setShowPasswordPanel(false);
      }, 2000);
    } catch (err) {
      setPasswordMsg(err.message);
    }
  };

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
      className="panel-shell flex h-14 w-full min-w-0 items-center justify-between gap-3 border-b px-3.5 sm:gap-4 sm:px-5"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <BrandMark />
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <LanguageDropdown language={language} onLanguageChange={onLanguageChange} />

          {viewOnly && (
            <span
              className="liquid-surface inline-flex h-10 shrink-0 items-center rounded-xl border px-3 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-[0_10px_22px_rgba(0,0,0,0.14)] sm:px-3.5 sm:text-[11px]"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                borderColor: "var(--border)",
              }}
            >
              View only
            </span>
          )}
          {!viewOnly && onRun && (
            <Btn
              onClick={onRun}
              disabled={running}
              style={{
                background: "var(--green)",
                color: "var(--bg-primary)",
                borderColor: "var(--green)",
                boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
                opacity: running ? 0.55 : 1,
                minWidth: "5rem",
              }}
            >
              <PlayIcon className="h-3.5 w-3.5" />
              <span>{running ? "Running…" : "Run"}</span>
            </Btn>
          )}
          {!viewOnly && onPreview && (
            <Btn
              onClick={(e) => onPreview({ force: e.shiftKey })}
              disabled={previewBusy || running}
              title="Preview: sincronizează fișierele cu containerul (HMR). Shift+click = repornire completă după schimbări în package.json / dependencies."
              style={{
                background: "var(--blue)",
                color: "var(--bg-primary)",
                borderColor: "var(--blue)",
                minWidth: "5.5rem",
                opacity: previewBusy || running ? 0.55 : 1,
              }}
            >
              {previewBusy ? "Preview…" : "Preview"}
            </Btn>
          )}
          {!viewOnly && onViteDemo && (
            <Btn onClick={onViteDemo} title="Încarcă un proiect Vite+React minimal în cameră">
              Vite demo
            </Btn>
          )}
        </div>

        <Divider />

        <OnlineUsers wsProvider={wsProvider} />
        <Divider />

        <div className="flex max-w-[100vw] flex-wrap items-center gap-1.5 sm:gap-2">
          <Btn
            onClick={handleShare}
            style={{
              background: copied ? "var(--green)" : "var(--bg-tertiary)",
              borderColor: copied ? "var(--green)" : "var(--border)",
              color: copied ? "var(--bg-primary)" : "var(--text-primary)",
            }}
          >
            <ShareIcon className="h-3.5 w-3.5" />
            <span>{copied ? "Copied" : "Share"}</span>
          </Btn>

          <Btn onClick={handleShareReadOnly} title="Copy read-only link">
            <EyeIcon className="h-3.5 w-3.5" />
            <span>View link</span>
          </Btn>

          <Btn onClick={handleFork} title="Fork this session into a new room">
            <ForkIcon className="h-3.5 w-3.5" />
            <span>Fork</span>
          </Btn>

          <div className="relative" ref={diffMenuRef}>
            <Btn
              onClick={() => setShowDiffMenu((s) => !s)}
              title="Compare current file with another file"
              style={{
                background: diffTargetFile ? "var(--bg-primary)" : "var(--bg-tertiary)",
                color: diffTargetFile ? "var(--accent)" : "var(--text-secondary)",
                borderColor: diffTargetFile ? "var(--accent)" : "var(--border)",
              }}
            >
              {diffTargetFile ? "Diff On" : "Diff"}
            </Btn>
            {showDiffMenu && (
              <div
                className="absolute right-0 top-[calc(100%+4px)] z-50 max-h-72 min-w-[14rem] overflow-auto rounded-none border py-1"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border)",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
                }}
              >
                {diffTargetFile && (
                  <button
                    type="button"
                    onClick={() => {
                      onCloseDiff?.();
                      setShowDiffMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--red)" }}
                  >
                    Close diff view
                  </button>
                )}
                {files
                  .filter((file) => file.name !== filename)
                  .map((file) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => {
                        onOpenDiff?.(file.name);
                        setShowDiffMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-[11px] transition-colors hover:opacity-90"
                      style={{
                        background:
                          diffTargetFile === file.name
                            ? "var(--bg-tertiary)"
                            : "transparent",
                        color:
                          diffTargetFile === file.name
                            ? "var(--accent)"
                            : "var(--text-primary)",
                      }}
                    >
                      {file.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <Btn onClick={handleZip} title="Download all files as ZIP">
            <ArchiveIcon className="h-3.5 w-3.5" />
            <span>ZIP</span>
          </Btn>

          <Btn
            onClick={handleGist}
            disabled={gistState === "saving"}
            style={{
              background:
                gistState === "done"
                  ? "var(--green)"
                  : gistState === "error"
                    ? "var(--red)"
                    : "var(--bg-tertiary)",
              borderColor:
                gistState === "done"
                  ? "var(--green)"
                  : gistState === "error"
                    ? "var(--red)"
                    : "var(--border)",
              color:
                gistState === "done" || gistState === "error"
                  ? "var(--bg-primary)"
                  : "var(--text-secondary)",
            }}
          >
            <SparkIcon className="h-3.5 w-3.5" />
            {gistState === "saving"
              ? "…"
              : gistState === "done"
                ? "Gist ✓"
                : gistState === "error"
                  ? "Err"
                  : "Gist"}
          </Btn>
        </div>

        <Divider />

        <div className="flex items-center gap-1.5 sm:gap-2">
          {user && (
            <div className="relative">
              <Btn
                onClick={() => setShowPasswordPanel((p) => !p)}
                title="Set room password"
                className="!px-2 !text-base sm:!text-lg"
                style={{
                  color: "var(--text-secondary)",
                  borderColor: "var(--border)",
                  background: "var(--bg-tertiary)",
                }}
              >
                <LockIcon className="h-4 w-4" />
              </Btn>
              {showPasswordPanel && (
                <div
                  className="floating-panel absolute right-0 top-[calc(100%+10px)] z-50 p-3 sm:top-[calc(100%+12px)]"
                  style={{
                    width: 220,
                  }}
                >
                  <p
                    className="mb-2 text-[10px] font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Room password
                  </p>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                    placeholder="New password (blank = remove)"
                    className="panel-input mb-2 px-2.5 py-2 text-xs"
                  />
                  <Btn
                    onClick={handleSetPassword}
                    className="w-full"
                    style={{
                      background: "var(--accent)",
                      color: "var(--bg-primary)",
                      borderColor: "var(--accent)",
                    }}
                  >
                    Save
                  </Btn>
                  {passwordMsg && (
                    <p
                      className="mt-1.5 text-center text-[10px]"
                      style={{
                        color:
                          passwordMsg.includes("!") || passwordMsg.includes("removed")
                            ? "var(--green)"
                            : "var(--red)",
                      }}
                    >
                      {passwordMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {user === null && (
            <div className="relative flex items-center gap-1">
              <Btn
                onClick={() => setShowLogin((l) => !l)}
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  borderColor: "var(--border)",
                }}
              >
                <LoginIcon className="h-3.5 w-3.5" />
                <span>Login</span>
              </Btn>
              {showLogin && (
                <div
                  className="floating-panel absolute right-0 top-[calc(100%+10px)] z-50 flex min-w-[11rem] flex-col gap-1.5 p-2 sm:top-[calc(100%+12px)]"
                >
                  <Btn
                    onClick={() => {
                      loginGitHub();
                      setShowLogin(false);
                    }}
                    className="w-full justify-start !normal-case"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    GitHub
                  </Btn>
                  <Btn
                    onClick={() => {
                      loginGoogle();
                      setShowLogin(false);
                    }}
                    className="w-full justify-start !normal-case"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Google
                  </Btn>
                </div>
              )}
            </div>
          )}

          {user && (
            <div className="relative flex max-w-[11rem] items-center gap-1.5 sm:max-w-[13rem]">
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt=""
                  className="h-7 w-7 shrink-0 cursor-pointer rounded-full border object-cover"
                  style={{ borderColor: "var(--border)" }}
                  title="My rooms"
                  onClick={() => {
                    setShowMyRooms((v) => !v);
                    if (!showMyRooms) {
                      fetch(`${SERVER_URL}/api/rooms/mine`, { credentials: "include" })
                        .then((r) => r.json())
                        .then((d) => setMyRooms(d.rooms || []))
                        .catch(() => {});
                    }
                  }}
                />
              )}
              <span
                className="min-w-0 truncate text-[11px] sm:text-xs"
                style={{ color: "var(--text-secondary)" }}
                title={user.name || user.login}
              >
                {user.name || user.login}
              </span>
              <Btn
                onClick={logout}
                title="Sign out"
                className="!h-7 !px-2 !text-[10px] sm:!h-8"
                style={{
                  background: "transparent",
                  color: "var(--text-secondary)",
                  borderColor: "var(--border)",
                }}
              >
                out
              </Btn>

              {showMyRooms && (
                <div
                  className="floating-panel absolute right-0 top-[calc(100%+10px)] z-50 max-h-80 overflow-hidden sm:top-[calc(100%+12px)]"
                  style={{
                    width: 240,
                  }}
                >
                  <div
                    className="flex items-center justify-between border-b px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      My Rooms
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMyRooms(false)}
                      className="text-xs opacity-50 hover:opacity-100"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {myRooms.length === 0 ? (
                      <p
                        className="px-3 py-4 text-center text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        No rooms yet
                      </p>
                    ) : (
                      myRooms.map((r) => (
                        <a
                          key={r.room_id}
                          href={`${window.location.origin}${window.location.pathname}#${r.room_id}`}
                          onClick={() => setShowMyRooms(false)}
                          className="flex items-center justify-between border-b px-3 py-2 text-xs hover:opacity-80"
                          style={{
                            color: "var(--text-primary)",
                            borderColor: "var(--border)",
                          }}
                        >
                          <span className="font-mono" style={{ color: "var(--accent)" }}>
                            #{r.room_id}
                          </span>
                          <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>
                            {new Date(r.last_seen).toLocaleDateString()}
                          </span>
                        </a>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <Btn
              onClick={() => setShowSettings((s) => !s)}
              title="Editor settings"
              className="!w-9 sm:!w-10"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-tertiary)",
                color: showSettings ? "var(--accent)" : "var(--text-secondary)",
              }}
              aria-expanded={showSettings}
            >
              <SettingsIcon className="h-4 w-4" />
            </Btn>
            {showSettings && settings && (
              <SettingsPanel
                settings={settings}
                onChange={onSettingsChange}
                onClose={() => setShowSettings(false)}
              />
            )}
          </div>
        </div>

        <Divider />

        <div className="flex min-w-0 items-center -space-x-2">
          {users.map((u) => (
            <button
              type="button"
              key={u.clientId}
              onClick={() => onFollowUser?.(u)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-transform hover:scale-110 sm:h-9 sm:w-9 sm:text-sm"
              style={{
                background: u.color,
                borderColor: "var(--bg-secondary)",
                color: "var(--bg-primary)",
              }}
              title={
                u.cursor?.file
                  ? `Follow ${u.name} at ${u.cursor.file}:${u.cursor.line || 1}`
                  : u.name
              }
            >
              {u.name?.[0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
