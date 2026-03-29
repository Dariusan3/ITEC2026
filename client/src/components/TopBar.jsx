import { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";
import { wsProvider, roomId, getYText, yFiles } from "../lib/yjs";
import { useAuth } from "../lib/auth";
import { SERVER_URL } from "../lib/config";
import {
  loadLocalHistory,
  setRoomLabel,
  setRoomStarred,
} from "../lib/localRoomHistory";
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

// id must match Monaco language id
const LANGUAGES = [
  // ── Web
  { id: "javascript",  label: "JavaScript",  abbr: "JS",  color: "#f9e2af" },
  { id: "react-jsx",   label: "React (JSX)", abbr: "RC",  color: "#94e2d5" },
  { id: "typescript",  label: "TypeScript",  abbr: "TS",  color: "#89b4fa" },
  { id: "html",        label: "HTML",        abbr: "HT",  color: "#f38ba8" },
  { id: "css",         label: "CSS",         abbr: "CS",  color: "#89dceb" },
  { id: "json",        label: "JSON",        abbr: "{}",  color: "#cba6f7" },
  { id: "yaml",        label: "YAML",        abbr: "YML", color: "#a6e3a1" },
  { id: "xml",         label: "XML",         abbr: "XML", color: "#f38ba8" },
  { id: "markdown",    label: "Markdown",    abbr: "MD",  color: "#cba6f7" },
  // ── Systems
  { id: "c",           label: "C",           abbr: "C",   color: "#fab387" },
  { id: "cpp",         label: "C++",         abbr: "C++", color: "#fab387" },
  { id: "rust",        label: "Rust",        abbr: "RS",  color: "#fab387" },
  { id: "go",          label: "Go",          abbr: "GO",  color: "#89dceb" },
  // ── JVM
  { id: "java",        label: "Java",        abbr: "JV",  color: "#f38ba8" },
  { id: "kotlin",      label: "Kotlin",      abbr: "KT",  color: "#89b4fa" },
  { id: "scala",       label: "Scala",       abbr: "SC",  color: "#f38ba8" },
  // ── Scripting
  { id: "python",      label: "Python",      abbr: "PY",  color: "#a6e3a1" },
  { id: "ruby",        label: "Ruby",        abbr: "RB",  color: "#f38ba8" },
  { id: "php",         label: "PHP",         abbr: "PHP", color: "#89b4fa" },
  { id: "lua",         label: "Lua",         abbr: "LU",  color: "#89b4fa" },
  { id: "shell",       label: "Shell",       abbr: "SH",  color: "#a6e3a1" },
  // ── Data / Config
  { id: "sql",         label: "SQL",         abbr: "SQL", color: "#cba6f7" },
  { id: "toml",        label: "TOML",        abbr: "TM",  color: "#fab387" },
  { id: "dockerfile",  label: "Dockerfile",  abbr: "DF",  color: "#89dceb" },
  // ── Other
  { id: "r",           label: "R",           abbr: "R",   color: "#89b4fa" },
  { id: "swift",       label: "Swift",       abbr: "SW",  color: "#fab387" },
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
        className="flex h-10 w-10 items-center justify-center rounded-none border shadow-[0_14px_28px_rgba(0,0,0,0.24)] sm:h-11 sm:w-11"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, white 12%) 0%, color-mix(in srgb, var(--accent) 68%, var(--blue) 32%) 100%)",
          borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border))",
        }}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 sm:h-5.5 sm:w-5.5"
          fill="none"
        >
          <path
            d="M7 6.5h10M7 12h6.5M7 17.5h10"
            stroke="var(--bg-primary)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M16.5 9.5v5"
            stroke="rgba(24,24,37,0.68)"
            strokeWidth="2"
            strokeLinecap="round"
          />
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

function Btn({
  onClick,
  disabled,
  className = "",
  style = {},
  title,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-9 shrink-0 select-none items-center justify-center gap-1
        liquid-surface rounded-none border px-3 text-[11px] font-semibold uppercase tracking-wide
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

const LANG_GROUPS = [
  { label: "Web",        ids: ["javascript","react-jsx","typescript","html","css","json","yaml","xml","markdown"] },
  { label: "Systems",    ids: ["c","cpp","rust","go"] },
  { label: "JVM",        ids: ["java","kotlin","scala"] },
  { label: "Scripting",  ids: ["python","ruby","php","lua","shell"] },
  { label: "Data / Config", ids: ["sql","toml","dockerfile"] },
  { label: "Other",      ids: ["r","swift"] },
];
const LANG_BY_ID = Object.fromEntries(LANGUAGES.map((l) => [l.id, l]));

function LanguageDropdown({ language, onLanguageChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const activeMeta = LANG_BY_ID[language] || { label: language, abbr: language.slice(0,2).toUpperCase(), color: "var(--text-secondary)" };

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
        className="min-w-32 justify-between gap-2 sm:min-w-36"
        style={{
          background: open
            ? "color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))"
            : "var(--bg-tertiary)",
          borderColor: open
            ? "color-mix(in srgb, var(--accent) 28%, var(--border))"
            : "var(--border)",
        }}
      >
        <span
          className="shrink-0 font-mono font-bold"
          style={{ fontSize: 9, color: activeMeta.color, minWidth: 22 }}
        >
          {activeMeta.abbr}
        </span>
        <span className="flex-1 truncate text-left text-[11px]">{activeMeta.label}</span>
        <span
          className={`ml-auto opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </Btn>

      {open && (
        <div
          className="floating-panel absolute left-0 top-[calc(100%+10px)] z-50 overflow-hidden p-0"
          style={{ width: 230 }}
          role="listbox"
        >
          <div className="max-h-80 overflow-y-auto p-2">
            {LANG_GROUPS.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <p
                  className="mb-1 px-2 text-[8px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: "var(--text-secondary)", opacity: 0.55 }}
                >
                  {group.label}
                </p>
                {group.ids.map((id) => {
                  const meta = LANG_BY_ID[id];
                  if (!meta) return null;
                  const isActive = language === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-150 hover:brightness-110"
                      style={{
                        background: isActive
                          ? "color-mix(in srgb, var(--accent) 14%, var(--bg-tertiary))"
                          : "transparent",
                        boxShadow: isActive
                          ? "inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, var(--border))"
                          : "none",
                      }}
                      onClick={() => { onLanguageChange(id); setOpen(false); }}
                    >
                      <span
                        className="w-8 shrink-0 text-center font-mono text-[9px] font-bold"
                        style={{ color: meta.color }}
                      >
                        {meta.abbr}
                      </span>
                      <span
                        className="flex-1 text-[11px] font-medium"
                        style={{ color: isActive ? "var(--accent)" : "var(--text-primary)" }}
                      >
                        {meta.label}
                      </span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OnlineUsers({ wsProvider }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    function update() {
      const localId = wsProvider.awareness.clientID;
      const states = [];
      wsProvider.awareness.getStates().forEach((state, id) => {
        if (id !== localId && state.user?.name) {
          states.push({
            id,
            name: state.user.name,
            color: state.user.color || "#cba6f7",
          });
        }
      });
      setUsers(states);
    }
    wsProvider.awareness.on("change", update);
    update();
    return () => wsProvider.awareness.off("change", update);
  }, [wsProvider]);

  if (users.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1"
      title={`${users.length} other${users.length > 1 ? "s" : ""} online`}
    >
      {users.slice(0, 5).map((u) => (
        <div
          key={u.id}
          title={u.name}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-[9px] font-bold"
          style={{
            background: u.color,
            color: "#1e1e2e",
            border: "1.5px solid var(--bg-primary)",
          }}
        >
          {u.name.slice(0, 2).toUpperCase()}
        </div>
      ))}
      {users.length > 5 && (
        <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>
          +{users.length - 5}
        </span>
      )}
    </div>
  );
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
  onFullstackDemo,
  onOpenWorkspaceSearch,
  roomNodeVersion = "20",
  onRoomNodeVersionChange,
  roomRole = "member",
  onRoleChange,
  teacherBroadcast = "",
  onTeacherBroadcastChange,
  teacherLocked = false,
  onTeacherLockedChange,
  viewOnly = false,
}) {
  const [users, setUsers] = useState([]);
  const [files, setFiles] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [memberAction, setMemberAction] = useState("");
  const [adminAction, setAdminAction] = useState("");
  const [adminState, setAdminState] = useState({
    isOwner: false,
    isAdmin: false,
    ownerUserId: null,
  });
  const [inviteRole, setInviteRole] = useState("student");
  const [inviteGrantAdmin, setInviteGrantAdmin] = useState(false);
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [inviteAction, setInviteAction] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [activeInvites, setActiveInvites] = useState([]);
  const [inviteManageAction, setInviteManageAction] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiffMenu, setShowDiffMenu] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [showClassroom, setShowClassroom] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [showLocalRooms, setShowLocalRooms] = useState(false);
  const [localRooms, setLocalRooms] = useState(() => loadLocalHistory());
  const [showMyRooms, setShowMyRooms] = useState(false);
  const [myRooms, setMyRooms] = useState([]);
  const [interviewTitle, setInterviewTitle] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [interviewSession, setInterviewSession] = useState(null);
  const [interviewSessions, setInterviewSessions] = useState([]);
  const [interviewReplayUrl, setInterviewReplayUrl] = useState("");
  const [interviewMessage, setInterviewMessage] = useState("");
  const [classroomMessage, setClassroomMessage] = useState("");
  const diffMenuRef = useRef(null);
  const interviewRef = useRef(null);
  const classroomRef = useRef(null);
  const acceptedInviteRef = useRef(null);
  const { user, loginGitHub, loginGoogle, logout } = useAuth();

  useEffect(() => {
    if (user) {
      wsProvider.awareness.setLocalStateField("user", {
        id: user.id,
        login: user.login,
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
    if (!showInterview) return;
    const onDoc = (event) => {
      if (!interviewRef.current?.contains(event.target)) setShowInterview(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showInterview]);

  useEffect(() => {
    if (!showClassroom) return;
    const onDoc = (event) => {
      if (!classroomRef.current?.contains(event.target)) setShowClassroom(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showClassroom]);

  useEffect(() => {
    const awareness = wsProvider.awareness;
    const update = () => {
      const seen = new Set();
      const states = [];
      awareness.getStates().forEach((state, clientId) => {
        const identity =
          state.user?.id || state.user?.login || state.user?.name || clientId;
        if (state.user && !seen.has(identity)) {
          seen.add(identity);
          states.push({ ...state.user, cursor: state.cursor, clientId });
        }
      });
      setUsers(states);
    };
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, []);

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

  const handleShareEmbed = () => {
    const url = `${window.location.origin}${window.location.pathname}?embed=1#${roomId}`;
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
    sessionStorage.setItem(
      `itecify-fork-${newRoom}`,
      JSON.stringify(forkedFiles),
    );
    window.open(
      `${window.location.origin}${window.location.pathname}?fork=${newRoom}#${newRoom}`,
      "_blank",
    );
  };

  const [showGithub, setShowGithub] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubState, setGithubState] = useState("idle"); // idle | loading | done | error
  const [githubMsg, setGithubMsg] = useState("");

  const ALLOWED_EXTS = new Set([
    "js","jsx","ts","tsx","py","rs","go","java","c","h","cpp","css","scss","html","json","md","yaml","yml","toml","sh","env.example",
  ]);

  const handleGithubImport = async () => {
    const raw = githubUrl.trim();
    if (!raw) return;
    // Parse: https://github.com/owner/repo[.git][/tree/branch[/path]]
    const match = raw.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?(?:\/tree\/([^/\s]+))?(?:[/?#].*)?$/);
    if (!match) { setGithubMsg("Invalid GitHub URL. Use https://github.com/owner/repo"); return; }
    const [, owner, repo, branch = "main"] = match;
    setGithubState("loading");
    setGithubMsg("");
    try {
      const treeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      );
      if (!treeRes.ok) {
        const alt = branch === "main" ? "master" : "main";
        const altRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${alt}?recursive=1`,
        );
        if (!altRes.ok) throw new Error(`Repo not found or private (${owner}/${repo})`);
        const altData = await altRes.json();
        return loadTree(altData, owner, repo);
      }
      const treeData = await treeRes.json();
      await loadTree(treeData, owner, repo);
    } catch (e) {
      setGithubState("error");
      setGithubMsg(e.message || "Failed to import");
    }
  };

  const loadTree = async (treeData, owner, repo) => {
    const blobs = (treeData.tree || []).filter((node) => {
      if (node.type !== "blob") return false;
      if (node.size > 200_000) return false;
      const ext = node.path.split(".").pop().toLowerCase();
      return ALLOWED_EXTS.has(ext);
    }).slice(0, 30);

    if (blobs.length === 0) throw new Error("No supported source files found (max 30, ≤200KB)");

    const guessLang = (name) => {
      const ext = name.split(".").pop().toLowerCase();
      const map = { js:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",py:"python",rs:"rust",go:"go",java:"java",c:"c",h:"c",cpp:"c",css:"css",scss:"css",html:"html",json:"json" };
      return map[ext] || "javascript";
    };

    // Clear existing files
    [...yFiles.keys()].forEach((k) => yFiles.delete(k));

    await Promise.all(
      blobs.map(async (node) => {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${node.path}`);
        const data = await res.json();
        const content = atob(data.content.replace(/\n/g, ""));
        const lang = guessLang(node.path);
        yFiles.set(node.path, { language: lang });
        const yText = getYText(node.path);
        if (yText.length > 0) yText.delete(0, yText.length);
        yText.insert(0, content);
      }),
    );

    setGithubState("done");
    setGithubMsg(`Loaded ${blobs.length} files from ${owner}/${repo}`);
    setTimeout(() => { setShowGithub(false); setGithubState("idle"); setGithubUrl(""); setGithubMsg(""); }, 2000);
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
      loadAuditEntries().catch(() => {});
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

  const loadRoomMembers = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/api/room/${roomId}/members`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({ members: [] }));
    setRoomMembers(Array.isArray(data.members) ? data.members : []);
  }, []);

  const loadAdminState = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/api/room/${roomId}/admin-state`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({
      isOwner: false,
      isAdmin: false,
      ownerUserId: null,
    }));
    setAdminState({
      isOwner: !!data.isOwner,
      isAdmin: !!data.isAdmin,
      ownerUserId: data.ownerUserId ?? null,
    });
  }, []);

  const loadAuditEntries = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/api/room/${roomId}/audit`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({ entries: [] }));
    setAuditEntries(Array.isArray(data.entries) ? data.entries : []);
  }, []);

  const loadActiveInvites = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/api/room/${roomId}/invites`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({ invites: [] }));
    setActiveInvites(Array.isArray(data.invites) ? data.invites : []);
  }, []);

  const loadInterviewSessions = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/api/interview/room/${roomId}`);
    const data = await res.json().catch(() => ({ sessions: [] }));
    setInterviewSessions(data.sessions || []);
  }, []);

  useEffect(() => {
    if (!showClassroom) return;
    loadAdminState().catch(() => {});
    loadRoomMembers().catch(() => {});
    loadAuditEntries().catch(() => {});
    loadActiveInvites().catch(() => {});
  }, [showClassroom, loadAdminState, loadRoomMembers, loadAuditEntries, loadActiveInvites]);

  const handleAssignRole = useCallback(
    async (targetUserId, nextRole) => {
      if (!targetUserId) return;
      setClassroomMessage("");
      setMemberAction(`${targetUserId}:${nextRole}`);
      try {
        const res = await fetch(
          `${SERVER_URL}/api/room/${roomId}/members/${targetUserId}/role`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ role: nextRole }),
          },
        );
        if (res.ok) {
          await loadRoomMembers();
          await loadAuditEntries();
        } else {
          const data = await res.json().catch(() => ({}));
          setClassroomMessage(data.error || "Could not update role.");
        }
      } finally {
        setMemberAction("");
      }
    },
    [loadAuditEntries, loadRoomMembers],
  );

  const handleToggleAdmin = useCallback(
    async (targetUserId, nextIsAdmin) => {
      if (!targetUserId) return;
      setClassroomMessage("");
      setAdminAction(`${targetUserId}:${nextIsAdmin ? "on" : "off"}`);
      try {
        const res = await fetch(
          `${SERVER_URL}/api/room/${roomId}/members/${targetUserId}/admin`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ isAdmin: nextIsAdmin }),
          },
        );
        if (res.ok) {
          await loadRoomMembers();
          await loadAuditEntries();
        } else {
          const data = await res.json().catch(() => ({}));
          setClassroomMessage(data.error || "Could not update admin access.");
        }
      } finally {
        setAdminAction("");
      }
    },
    [loadAuditEntries, loadRoomMembers],
  );

  const handleTransferOwnership = useCallback(
    async (targetUserId) => {
      if (!targetUserId) return;
      setClassroomMessage("");
      setAdminAction(`transfer:${targetUserId}`);
      try {
        const res = await fetch(`${SERVER_URL}/api/room/${roomId}/transfer-owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ targetUserId }),
        });
        if (res.ok) {
          await loadAdminState();
          await loadRoomMembers();
          await loadAuditEntries();
          setClassroomMessage("Ownership transferred.");
        } else {
          const data = await res.json().catch(() => ({}));
          setClassroomMessage(data.error || "Could not transfer ownership.");
        }
      } finally {
        setAdminAction("");
      }
    },
    [loadAdminState, loadAuditEntries, loadRoomMembers],
  );

  const handleCreateInvite = useCallback(async () => {
    setInviteAction(true);
    setInviteMessage("");
    setClassroomMessage("");
    try {
      const res = await fetch(`${SERVER_URL}/api/room/${roomId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role: inviteRole,
          grantAdmin: inviteGrantAdmin,
          expiresInDays: inviteExpiryDays,
          maxUses: inviteMaxUses,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteMessage(data.error || "Could not create invite.");
        return;
      }
      if (data.inviteUrl) {
        await navigator.clipboard.writeText(data.inviteUrl);
        setInviteMessage("Invite link copied.");
      } else {
        setInviteMessage("Invite created.");
      }
      await loadAuditEntries();
      await loadActiveInvites();
    } catch {
      setInviteMessage("Could not create invite.");
    } finally {
      setInviteAction(false);
    }
  }, [inviteExpiryDays, inviteGrantAdmin, inviteMaxUses, inviteRole, loadActiveInvites, loadAuditEntries]);

  const handleCopyInvite = useCallback(async (token) => {
    if (!token) return;
    const url = `${window.location.origin}${window.location.pathname}?invite=${token}#${roomId}`;
    await navigator.clipboard.writeText(url);
    setInviteMessage("Invite link copied.");
  }, []);

  const handleRevokeInvite = useCallback(
    async (inviteId) => {
      if (!inviteId) return;
      setInviteManageAction(inviteId);
      setInviteMessage("");
      try {
        const res = await fetch(`${SERVER_URL}/api/room/${roomId}/invites/${inviteId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setInviteMessage(data.error || "Could not revoke invite.");
          return;
        }
        setInviteMessage("Invite revoked.");
        await loadActiveInvites();
        await loadAuditEntries();
      } finally {
        setInviteManageAction("");
      }
    },
    [loadActiveInvites, loadAuditEntries],
  );

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("invite");
    if (!inviteToken || !user || acceptedInviteRef.current === inviteToken) return;
    acceptedInviteRef.current = inviteToken;
    setClassroomMessage("");
    fetch(`${SERVER_URL}/api/invite/${inviteToken}/accept`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        // Always clean up the invite param so we don't retry on reload
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url);
        if (!ok) {
          setClassroomMessage(data.error || "Could not accept invite.");
          return;
        }
        if (data.alreadyAccepted) {
          // Silently skip — already accepted by this user
          loadAdminState().catch(() => {});
          return;
        }
        setClassroomMessage(
          data.isAdmin
            ? "Invite accepted. You now have admin access."
            : `Invite accepted. Your role is ${data.role}.`,
        );
        loadAdminState().catch(() => {});
        loadRoomMembers().catch(() => {});
        loadAuditEntries().catch(() => {});
      })
      .catch(() => {
        setClassroomMessage("Could not accept invite.");
      });
  }, [user, loadAdminState, loadAuditEntries, loadRoomMembers]);

  const handleInterviewStart = async () => {
    setInterviewMessage("");
    const res = await fetch(`${SERVER_URL}/api/interview/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        roomId,
        title: interviewTitle.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInterviewMessage(data.error || "Could not start interview mode.");
      return;
    }
    setInterviewSession(data);
    setInterviewReplayUrl("");
    loadInterviewSessions().catch(() => {});
    loadAuditEntries().catch(() => {});
  };

  const handleInterviewStop = async () => {
    if (!interviewSession?.id) return;
    setInterviewMessage("");
    const participants = users.map((u) => u.name).filter(Boolean);
    const res = await fetch(`${SERVER_URL}/api/interview/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        sessionId: interviewSession.id,
        roomId,
        participants,
        notes: interviewNotes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInterviewMessage(data.error || "Could not save replay.");
      return;
    }
    const replayUrl =
      data.replayUrl ||
      `${window.location.origin}${window.location.pathname}?replay=${interviewSession.id}`;
    setInterviewReplayUrl(replayUrl.startsWith("http") ? replayUrl : `${window.location.origin}${replayUrl}`);
    setInterviewSession(null);
    loadInterviewSessions().catch(() => {});
    loadAuditEntries().catch(() => {});
  };

  const formatAuditLabel = useCallback((entry) => {
    const actor = entry.actor_login ? `@${entry.actor_login}` : "Someone";
    const role = entry.metadata?.role;
    switch (entry.action) {
      case "room.password_set":
        return `${actor} set a room password`;
      case "room.password_cleared":
        return `${actor} removed the room password`;
      case "room.role_self_set":
        return `${actor} set their role to ${role || "member"}`;
      case "room.role_assigned":
        return `${actor} assigned ${role || "member"} access`;
      case "room.owner_bootstrapped":
        return `${actor} became the room owner`;
      case "room.admin_granted":
        return `${actor} granted admin access`;
      case "room.admin_revoked":
        return `${actor} revoked admin access`;
      case "room.owner_transferred":
        return `${actor} transferred room ownership`;
      case "room.invite_created":
        return `${actor} created an invite link`;
      case "room.invite_revoked":
        return `${actor} revoked an invite`;
      case "room.invite_accepted":
        return `${actor} accepted an invite`;
      case "interview.started":
        return `${actor} started an interview session`;
      case "interview.stopped":
        return `${actor} saved an interview replay`;
      case "classroom.lock_enabled":
        return `${actor} locked editing`;
      case "classroom.lock_disabled":
        return `${actor} unlocked editing`;
      case "classroom.broadcast_updated":
        return `${actor} updated the broadcast`;
      case "classroom.broadcast_cleared":
        return `${actor} cleared the broadcast`;
      default:
        return `${actor} performed ${entry.action}`;
    }
  }, []);

  return (
    <div
      className="panel-shell relative z-40 flex min-h-14 w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 overflow-visible border-b px-3.5 py-3 sm:gap-x-4 sm:px-5"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <BrandMark />
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t pt-2 sm:gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
          <LanguageDropdown
            language={language}
            onLanguageChange={onLanguageChange}
          />

          {viewOnly && (
            <span
              className="liquid-surface inline-flex h-10 shrink-0 items-center rounded-none border px-3 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-[0_10px_22px_rgba(0,0,0,0.14)] sm:px-3.5 sm:text-[11px]"
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
              title="Preview: sync files with container (HMR). Shift+click = full restart after package.json / dependency changes."
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
            <Btn
              onClick={onViteDemo}
              title="Replace all room files with the minimal Vite example (Preview mockup). Required if you have the iTECify monorepo in the room."
            >
              Vite demo
            </Btn>
          )}
          {!viewOnly && onFullstackDemo && (
            <Btn
              onClick={onFullstackDemo}
              title="Vite + React + Express (API on :3001, /api proxy in Vite). Requires Docker Preview."
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                borderColor: "var(--border)",
              }}
            >
              API demo
            </Btn>
          )}
          {!viewOnly && onOpenWorkspaceSearch && (
            <Btn
              onClick={onOpenWorkspaceSearch}
              title="Search across the entire workspace"
              className="!min-w-[4rem]"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                borderColor: "var(--border)",
              }}
            >
              Find
            </Btn>
          )}
        </div>

        <div className="order-2 flex w-full min-w-0 flex-wrap items-center gap-1.5 border-t pt-2 sm:gap-2">
          <div className="relative">
            <Btn
              onClick={() => {
                setLocalRooms(loadLocalHistory());
                setShowLocalRooms((v) => !v);
              }}
              title="Recent rooms and favorites (local)"
              style={{
                background: showLocalRooms ? "var(--accent)" : "var(--bg-tertiary)",
                borderColor: showLocalRooms ? "var(--accent)" : "var(--border)",
                color: showLocalRooms ? "var(--bg-primary)" : "var(--text-secondary)",
              }}
            >
              Recent
            </Btn>
            {showLocalRooms && (
              <div
                className="floating-panel absolute right-0 top-[calc(100%+8px)] z-50 max-h-72 w-64 overflow-hidden"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              >
                <div
                  className="flex items-center justify-between border-b px-2 py-1.5 text-[10px] uppercase"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  <span>Local history</span>
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100"
                    onClick={() => setShowLocalRooms(false)}
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {localRooms.length === 0 ? (
                    <p className="p-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      No room saved yet.
                    </p>
                  ) : (
                    localRooms.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center gap-1 border-b px-2 py-1.5 text-[11px]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <button
                          type="button"
                          className="shrink-0 text-[12px] leading-none"
                          title="Favorite"
                          style={{ color: h.star ? "var(--accent)" : "var(--text-secondary)" }}
                          onClick={() => {
                            setRoomStarred(h.id, !h.star);
                            setLocalRooms(loadLocalHistory());
                          }}
                        >
                          {h.star ? "★" : "☆"}
                        </button>
                        <a
                          href={`${window.location.origin}${window.location.pathname}#${h.id}`}
                          className="min-w-0 flex-1 truncate font-mono hover:underline"
                          style={{ color: "var(--accent)" }}
                          onClick={() => setShowLocalRooms(false)}
                        >
                          {h.label ? `${h.label} · ` : ""}#{h.id}
                        </a>
                      </div>
                    ))
                  )}
                </div>
                {roomId && (
                  <div className="border-t px-2 py-2 text-[10px]" style={{ borderColor: "var(--border)" }}>
                    <input
                      type="text"
                      placeholder={`Room alias #${roomId}…`}
                      className="w-full rounded-none border px-2 py-1 font-mono text-[10px] outline-none"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const v = e.currentTarget.value;
                        setRoomLabel(roomId, v);
                        e.currentTarget.value = "";
                        setLocalRooms(loadLocalHistory());
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

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

          <Btn onClick={handleShareEmbed} title="Copy embeddable widget link">
            <EyeIcon className="h-3.5 w-3.5" />
            <span>Embed</span>
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
                background: diffTargetFile
                  ? "var(--bg-primary)"
                  : "var(--bg-tertiary)",
                color: diffTargetFile
                  ? "var(--accent)"
                  : "var(--text-secondary)",
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

          <div className="relative" ref={interviewRef}>
            <Btn
              onClick={() => {
                setShowInterview((v) => !v);
                if (!showInterview) loadInterviewSessions().catch(() => {});
              }}
              title="Interview mode"
              style={{
                borderColor: interviewSession ? "var(--red)" : "var(--border)",
                color: interviewSession ? "var(--red)" : "var(--text-secondary)",
              }}
            >
              <SparkIcon className="h-3.5 w-3.5" />
              <span>Interview</span>
            </Btn>
            {showInterview && (
              <div
                className="floating-panel absolute right-0 top-[calc(100%+10px)] z-50 p-3"
                style={{ width: 320 }}
              >
                <p className="mb-2 text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Interview mode
                </p>
                <input
                  value={interviewTitle}
                  onChange={(e) => setInterviewTitle(e.target.value)}
                  placeholder="Session title"
                  className="panel-input mb-2 w-full px-3 py-2 text-xs"
                />
                <textarea
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                  placeholder="Notes"
                  rows={3}
                  className="panel-input mb-2 w-full resize-none px-3 py-2 text-xs"
                />
                <div className="flex gap-2">
                  {!interviewSession ? (
                    <Btn onClick={handleInterviewStart} className="w-full">
                      Start
                    </Btn>
                  ) : (
                    <Btn
                      onClick={handleInterviewStop}
                      className="w-full"
                      style={{
                        background: "var(--red)",
                        borderColor: "var(--red)",
                        color: "var(--bg-primary)",
                      }}
                    >
                      Stop & save replay
                    </Btn>
                  )}
                </div>
                {interviewMessage && (
                  <p className="mt-2 text-[10px]" style={{ color: "var(--red)" }}>
                    {interviewMessage}
                  </p>
                )}
                {interviewReplayUrl && (
                  <a
                    href={interviewReplayUrl}
                    className="mt-2 block text-[10px] underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Open replay
                  </a>
                )}
                <div className="mt-3">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-secondary)" }}>
                    Previous sessions
                  </p>
                  <div className="max-h-40 overflow-auto space-y-1">
                    {interviewSessions.map((session) => (
                      <a
                        key={session.id}
                        href={`${window.location.pathname}?replay=${session.id}`}
                        className="block rounded-xl border px-3 py-2 text-[10px]"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      >
                        <div>{session.title || "Untitled session"}</div>
                        <div style={{ color: "var(--text-secondary)" }}>
                          {new Date(session.started_at).toLocaleString()}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={classroomRef}>
            <Btn
              onClick={() => setShowClassroom((v) => !v)}
              title="Teacher / student mode"
            >
              <LockIcon className="h-3.5 w-3.5" />
              <span>Class</span>
            </Btn>
            {showClassroom && (
              <div
                className="floating-panel absolute right-0 top-[calc(100%+10px)] z-50 p-3"
                style={{ width: 320 }}
              >
                <p className="mb-2 text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Classroom mode
                </p>
                {(adminState.isOwner || adminState.isAdmin) && (
                  <p className="mb-2 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    {adminState.isOwner ? "You own this room." : "You are a room admin."}
                  </p>
                )}
                <div className="mb-3 flex gap-1">
                  {["member", "teacher", "student"].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => onRoleChange?.(role)}
                      className="flex-1 rounded-xl border px-2 py-2 text-[10px] uppercase tracking-[0.14em]"
                      style={{
                        borderColor: roomRole === role ? "var(--accent)" : "var(--border)",
                        color: roomRole === role ? "var(--accent)" : "var(--text-secondary)",
                        background: "var(--bg-tertiary)",
                      }}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                {classroomMessage && (
                  <p className="mb-2 text-[10px]" style={{ color: "var(--red)" }}>
                    {classroomMessage}
                  </p>
                )}
                {showClassroom && (
                  <div className="mb-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-tertiary)" }}>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-secondary)" }}>
                      Roster
                    </div>
                    <div className="max-h-48 space-y-2 overflow-auto pr-1">
                      {roomMembers.map((member) => {
                        const profile = member.user || {};
                        const online = users.some((onlineUser) =>
                          String(onlineUser.id || "") === String(member.user_id) ||
                          (profile.login && onlineUser.login === profile.login) ||
                          (profile.name && onlineUser.name === profile.name),
                        );
                        return (
                          <div
                            key={member.user_id}
                            className="rounded-xl border px-2.5 py-2"
                            style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg-secondary) 74%, transparent)" }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
                                  {profile.name || profile.login || `User ${member.user_id}`}
                                </div>
                                <div className="truncate text-[10px]" style={{ color: "var(--text-secondary)" }}>
                                  {profile.login ? `@${profile.login}` : "Room member"}
                                  {online ? " · online" : ""}
                                </div>
                              </div>
                              <span className="rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.16em]" style={{ borderColor: "var(--border)", color: member.role === "teacher" ? "var(--accent)" : "var(--text-secondary)" }}>
                                {member.role}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {member.is_owner && (
                                <span className="rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.16em]" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                                  owner
                                </span>
                              )}
                              {member.is_admin && !member.is_owner && (
                                <span className="rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.16em]" style={{ borderColor: "var(--blue)", color: "var(--blue)" }}>
                                  admin
                                </span>
                              )}
                            </div>
                            {roomRole === "teacher" && String(member.user_id) !== String(user?.id || "") && (
                              <div className="mt-2 flex gap-1">
                                {["member", "teacher", "student"].map((role) => (
                                  <button
                                    key={role}
                                    type="button"
                                    onClick={() => handleAssignRole(member.user_id, role)}
                                    disabled={memberAction === `${member.user_id}:${role}`}
                                    className="flex-1 rounded-lg border px-2 py-1.5 text-[9px] uppercase tracking-[0.14em] disabled:opacity-60"
                                    style={{
                                      borderColor: member.role === role ? "var(--accent)" : "var(--border)",
                                      color: member.role === role ? "var(--accent)" : "var(--text-secondary)",
                                      background: "var(--bg-secondary)",
                                    }}
                                  >
                                    {memberAction === `${member.user_id}:${role}` ? "..." : role}
                                  </button>
                                ))}
                              </div>
                            )}
                            {adminState.isOwner && !member.is_owner && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAdmin(member.user_id, !member.is_admin)}
                                  disabled={adminAction === `${member.user_id}:${member.is_admin ? "off" : "on"}`}
                                  className="mt-2 w-full rounded-lg border px-2 py-1.5 text-[9px] uppercase tracking-[0.14em] disabled:opacity-60"
                                  style={{
                                    borderColor: member.is_admin ? "var(--red)" : "var(--blue)",
                                    color: member.is_admin ? "var(--red)" : "var(--blue)",
                                    background: "var(--bg-secondary)",
                                  }}
                                >
                                  {adminAction === `${member.user_id}:${member.is_admin ? "off" : "on"}`
                                    ? "..."
                                    : member.is_admin
                                      ? "Remove admin"
                                      : "Make admin"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTransferOwnership(member.user_id)}
                                  disabled={adminAction === `transfer:${member.user_id}`}
                                  className="mt-2 w-full rounded-lg border px-2 py-1.5 text-[9px] uppercase tracking-[0.14em] disabled:opacity-60"
                                  style={{
                                    borderColor: "var(--accent)",
                                    color: "var(--accent)",
                                    background: "var(--bg-secondary)",
                                  }}
                                >
                                  {adminAction === `transfer:${member.user_id}` ? "..." : "Transfer ownership"}
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {roomMembers.length === 0 && (
                        <div className="rounded-xl border px-3 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                          No saved room members yet. Logged-in users appear here after joining.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="mb-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-tertiary)" }}>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-secondary)" }}>
                    Invite flow
                  </div>
                  <div className="flex gap-1">
                    {["member", "student", "teacher"].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setInviteRole(role)}
                        className="flex-1 rounded-lg border px-2 py-2 text-[9px] uppercase tracking-[0.14em]"
                        style={{
                          borderColor: inviteRole === role ? "var(--accent)" : "var(--border)",
                          color: inviteRole === role ? "var(--accent)" : "var(--text-secondary)",
                          background: "var(--bg-secondary)",
                        }}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  {adminState.isOwner && (
                    <label className="mt-2 flex items-center justify-between rounded-xl border px-3 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                      <span>Grant admin on accept</span>
                      <input
                        type="checkbox"
                        checked={inviteGrantAdmin}
                        onChange={(e) => setInviteGrantAdmin(e.target.checked)}
                      />
                    </label>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="rounded-xl border px-3 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                      <span className="block" style={{ color: "var(--text-secondary)" }}>
                        Expiry days
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={inviteExpiryDays}
                        onChange={(e) => setInviteExpiryDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                        className="mt-1 w-full bg-transparent outline-none"
                        style={{ color: "var(--text-primary)" }}
                      />
                    </label>
                    <label className="rounded-xl border px-3 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                      <span className="block" style={{ color: "var(--text-secondary)" }}>
                        Max uses
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={inviteMaxUses}
                        onChange={(e) => setInviteMaxUses(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                        className="mt-1 w-full bg-transparent outline-none"
                        style={{ color: "var(--text-primary)" }}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={inviteAction}
                    className="mt-2 w-full rounded-xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-60"
                    style={{
                      borderColor: "var(--accent)",
                      background: "var(--accent)",
                      color: "var(--bg-primary)",
                    }}
                  >
                    {inviteAction ? "Creating..." : "Copy invite link"}
                  </button>
                  {inviteMessage && (
                    <p className="mt-2 text-[10px]" style={{ color: inviteMessage.includes("copied") ? "var(--green)" : "var(--red)" }}>
                      {inviteMessage}
                    </p>
                  )}
                  <div className="mt-3 rounded-xl border px-2.5 py-2" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg-secondary) 74%, transparent)" }}>
                    <div className="mb-2 text-[9px] uppercase tracking-[0.16em]" style={{ color: "var(--text-secondary)" }}>
                      Active invites
                    </div>
                    <div className="max-h-40 space-y-2 overflow-auto pr-1">
                      {activeInvites.map((invite) => (
                        <div
                          key={invite.id}
                          className="rounded-lg border px-2 py-2"
                          style={{ borderColor: "var(--border)", background: "var(--bg-tertiary)" }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px]" style={{ color: "var(--text-primary)" }}>
                              {invite.role}
                              {invite.grant_admin ? " + admin" : ""}
                            </div>
                            <div className="text-[9px]" style={{ color: "var(--text-secondary)" }}>
                              {invite.expires_at
                                ? `exp ${new Date(invite.expires_at).toLocaleDateString()}`
                                : "no expiry"}
                            </div>
                          </div>
                          <div className="mt-1 text-[9px]" style={{ color: "var(--text-secondary)" }}>
                            Uses {invite.use_count ?? 0}/{invite.max_uses ?? 1}
                          </div>
                          <div className="mt-2 flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyInvite(invite.token)}
                              className="flex-1 rounded-lg border px-2 py-1.5 text-[9px] uppercase tracking-[0.14em]"
                              style={{
                                borderColor: "var(--accent)",
                                color: "var(--accent)",
                                background: "var(--bg-secondary)",
                              }}
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeInvite(invite.id)}
                              disabled={inviteManageAction === invite.id}
                              className="flex-1 rounded-lg border px-2 py-1.5 text-[9px] uppercase tracking-[0.14em] disabled:opacity-60"
                              style={{
                                borderColor: "var(--red)",
                                color: "var(--red)",
                                background: "var(--bg-secondary)",
                              }}
                            >
                              {inviteManageAction === invite.id ? "..." : "Revoke"}
                            </button>
                          </div>
                        </div>
                      ))}
                      {activeInvites.length === 0 && (
                        <div className="rounded-lg border px-2 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                          No active invites.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mb-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-tertiary)" }}>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-secondary)" }}>
                    Admin activity
                  </div>
                  <div className="max-h-40 space-y-2 overflow-auto pr-1">
                    {auditEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border px-2.5 py-2"
                        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg-secondary) 74%, transparent)" }}
                      >
                        <div className="text-[10px]" style={{ color: "var(--text-primary)" }}>
                          {formatAuditLabel(entry)}
                        </div>
                        <div className="mt-1 text-[9px]" style={{ color: "var(--text-secondary)" }}>
                          {new Date(entry.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                    {auditEntries.length === 0 && (
                      <div className="rounded-xl border px-3 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                        No admin activity yet.
                      </div>
                    )}
                  </div>
                </div>
                {roomRole === "teacher" && (
                  <>
                    <textarea
                      value={teacherBroadcast}
                      onChange={(e) => onTeacherBroadcastChange?.(e.target.value)}
                      placeholder="Broadcast message to students"
                      rows={3}
                      className="panel-input mb-2 w-full resize-none px-3 py-2 text-xs"
                    />
                    <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                      <span>Lock student editing</span>
                      <input
                        type="checkbox"
                        checked={teacherLocked}
                        onChange={(e) => onTeacherLockedChange?.(e.target.checked)}
                      />
                    </label>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <Btn onClick={() => setShowGithub((v) => !v)} title="Import files from a GitHub repository">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              <span>GitHub</span>
            </Btn>

            {showGithub && (
              <div
                className="floating-panel absolute right-0 top-[calc(100%+10px)] z-50 p-3"
                style={{ width: 300 }}
              >
                <p className="mb-2 text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Import from GitHub
                </p>
                <p className="mb-2.5 text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Paste a public repo URL. Up to 30 source files will be loaded into this room.
                </p>
                <input
                  autoFocus
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGithubImport()}
                  placeholder="https://github.com/owner/repo"
                  className="mb-2 w-full rounded-xl border px-3 py-2 text-[11px] font-mono outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                {githubMsg && (
                  <p
                    className="mb-2 text-[10px]"
                    style={{ color: githubState === "error" ? "var(--red)" : "var(--green)" }}
                  >
                    {githubMsg}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGithubImport}
                    disabled={githubState === "loading" || !githubUrl.trim()}
                    className="liquid-surface flex-1 rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-all disabled:opacity-50"
                    style={{
                      background: "var(--accent)",
                      borderColor: "var(--accent)",
                      color: "var(--bg-primary)",
                    }}
                  >
                    {githubState === "loading" ? "Loading…" : githubState === "done" ? "Done ✓" : "Import"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowGithub(false); setGithubUrl(""); setGithubMsg(""); setGithubState("idle"); }}
                    className="liquid-surface rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-all"
                    style={{ background: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="order-1 ml-auto flex items-center gap-1.5 sm:gap-2">
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
                          passwordMsg.includes("!") ||
                          passwordMsg.includes("removed")
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
                <div className="floating-panel absolute right-0 top-[calc(100%+10px)] z-50 flex min-w-[11rem] flex-col gap-1.5 p-2 sm:top-[calc(100%+12px)]">
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
            <div className="relative flex max-w-[8.5rem] items-center gap-1.5 sm:max-w-[10rem]">
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt=""
                  className="h-7 w-7 shrink-0 cursor-pointer rounded-none border object-cover"
                  style={{ borderColor: "var(--border)" }}
                  title="My rooms"
                  onClick={() => {
                    setShowMyRooms((v) => !v);
                    if (!showMyRooms) {
                      fetch(`${SERVER_URL}/api/rooms/mine`, {
                        credentials: "include",
                      })
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
                          <span
                            className="font-mono"
                            style={{ color: "var(--accent)" }}
                          >
                            #{r.room_id}
                          </span>
                          <span
                            style={{
                              color: "var(--text-secondary)",
                              fontSize: 10,
                            }}
                          >
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
                roomNodeVersion={roomNodeVersion}
                onRoomNodeVersionChange={onRoomNodeVersionChange}
              />
            )}
          </div>
        </div>

        <div className="order-1 flex min-w-0 items-center -space-x-2">
          {users.map((u) => (
            <button
              type="button"
              key={u.clientId}
              onClick={() => onFollowUser?.(u)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-2 text-xs font-bold transition-transform hover:scale-110 sm:h-9 sm:w-9 sm:text-sm"
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
