import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import TopBar from "./components/TopBar";
import FileTree from "./components/FileTree";
import Editor from "./components/Editor";
import DiffEditor from "./components/DiffEditor";
import Sidebar from "./components/Sidebar";
import OutputPanel from "./components/OutputPanel";
import TimeTravel from "./components/TimeTravel";
import ConnectionBanner from "./components/ConnectionBanner";
import WorkspaceSearch from "./components/WorkspaceSearch";
import ConfirmModal from "./components/ConfirmModal";
import OnboardingTour, { hasCompletedOnboarding } from "./components/OnboardingTour";
import TabBar from "./components/TabBar";
import {
  yFiles,
  getYText,
  roomId,
  idbPersistence,
  wsProvider,
  ydoc,
  yRoomMeta,
} from "./lib/yjs";
import { saveRoomNow } from "./lib/saveRoom";
import { SERVER_URL } from "./lib/config";
import { SANDBOX_RUN_LANGUAGES } from "./lib/sandboxLanguages";
import {
  mergeVitePreviewTemplate,
  VITE_PREVIEW_TEMPLATE_PATHS,
} from "./lib/vitePreviewTemplate";
import {
  mergeFullstackPreviewTemplate,
  FULLSTACK_TEMPLATE_PATHS,
} from "./lib/fullstackViteTemplate";
import { featureFlags } from "./lib/featureFlags";
import {
  validateWorkspaceSize,
  MAX_RUN_SOURCE_BYTES,
} from "./lib/workspaceLimits";
import { loadLocalHistory, saveLocalHistory } from "./lib/localRoomHistory";

// C2: Read-only mode — ?view=1 in URL
const viewOnly = new URLSearchParams(window.location.search).has("view");

// P4: Session history — track visited rooms (păstrează star/label din localRoomHistory)
function recordSession(id) {
  try {
    const hist = loadLocalHistory();
    const existing = hist.find((h) => h.id === id);
    const filtered = hist.filter((h) => h.id !== id);
    filtered.unshift({
      id,
      visitedAt: Date.now(),
      star: existing?.star,
      label: existing?.label,
    });
    saveLocalHistory(filtered);
  } catch {
    // Ignore errors
  }
}
recordSession(roomId);

// P2: Fork import — load forked files from sessionStorage into this room's Yjs doc
const forkParam = new URLSearchParams(window.location.search).get("fork");
if (forkParam) {
  try {
    const forkedFiles = JSON.parse(
      sessionStorage.getItem(`itecify-fork-${forkParam}`) || "null",
    );
    if (forkedFiles) {
      Object.entries(forkedFiles).forEach(([fname, { meta, content }]) => {
        yFiles.set(fname, meta);
        const yText = getYText(fname);
        if (yText.length === 0) yText.insert(0, content);
      });
      sessionStorage.removeItem(`itecify-fork-${forkParam}`);
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("fork");
      window.history.replaceState({}, "", url);
    }
  } catch {
    // Ignore errors
  }
}

const DEFAULT_SETTINGS = {
  theme: "itecify-midnight-mint",
  keymap: "default",
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  minimap: false,
  lineNumbers: true,
};

function loadSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem("itecify:settings") || "{}"),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [activeFile, setActiveFile] = useState("main.js");
  const [language, setLanguage] = useState("javascript");
  const [openTabs, setOpenTabs] = useState(["main.js"]);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);
  const [stdin, setStdin] = useState("");
  const [packages, setPackages] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [settings, setSettings] = useState(loadSettings);
  const [editorReady, setEditorReady] = useState(false);
  const [diffTargetFile, setDiffTargetFile] = useState(null);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !hasCompletedOnboarding(),
  );
  const [previewSyncInfo, setPreviewSyncInfo] = useState(null);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [roomNodeVersion, setRoomNodeVersion] = useState("20");
  const [clockTick, setClockTick] = useState(0);
  const editorRef = useRef(null);
  /** După Vite demo, următorul Preview trebuie să oprească containerul vechi (ex. monorepo concurrently). */
  const previewForceAfterViteDemoRef = useRef(false);
  const previewLastPkgRef = useRef(null);
  /** Ultima reîncărcare iframe (auto-sync); evită reload la fiecare 720ms. */
  const previewIframeReloadAtRef = useRef(0);
  const previewBusyRef = useRef(false);
  const handlePreviewStartRef = useRef(async () => {});
  const presenceCountRef = useRef(0);

  const effectiveSettings = useMemo(() => {
    if (!settings.themeAutoClock) return settings;
    const h = new Date().getHours();
    const night = h >= 22 || h < 7;
    return {
      ...settings,
      theme: night ? "itecify-midnight-mint" : "vs",
    };
  }, [settings, clockTick]);

  useEffect(() => {
    if (!settings.themeAutoClock) return undefined;
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [settings.themeAutoClock]);

  useEffect(() => {
    const sync = () =>
      setRoomNodeVersion(String(yRoomMeta.get("nodeVersion") || "20"));
    yRoomMeta.observe(sync);
    sync();
    return () => yRoomMeta.unobserve(sync);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setWorkspaceSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!settings.eventSounds) return undefined;
    const playJoin = () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 920;
        g.gain.value = 0.04;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        setTimeout(() => {
          o.stop();
          ctx.close();
        }, 70);
      } catch {
        /* ignore */
      }
    };
    const onAware = () => {
      const states = [...wsProvider.awareness.getStates().values()];
      const n = states.filter((s) => s.user?.name).length;
      if (n > presenceCountRef.current && presenceCountRef.current > 0) {
        playJoin();
      }
      presenceCountRef.current = n;
    };
    wsProvider.awareness.on("change", onAware);
    onAware();
    return () => wsProvider.awareness.off("change", onAware);
  }, [settings.eventSounds]);

  const revealEditorLocation = useCallback((line, column = 1) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const editor = editorRef.current?.getEditor?.();
        const model = editor?.getModel?.();
        if (!editor || !model) return;

        const safeLine = Math.max(1, Math.min(line || 1, model.getLineCount()));
        const safeColumn = Math.max(
          1,
          Math.min(column || 1, model.getLineMaxColumn(safeLine)),
        );

        editor.revealLineInCenter(safeLine);
        editor.setPosition({ lineNumber: safeLine, column: safeColumn });
        editor.focus();
      });
    });
  }, []);

  const [previewIframeSrc, setPreviewIframeSrc] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewNotice, setPreviewNotice] = useState(null);
  const [previewFocus, setPreviewFocus] = useState(0);

  // Mount editor only after BOTH IDB and WS initial sync complete.
  // The server now awaits loadRoom before sending SYNC_STEP2, so by the time
  // wsProvider fires 'synced', the full persisted code is already in ydoc.
  // A 4-second timeout ensures the editor always appears (e.g. offline).
  useEffect(() => {
    let idbDone = false;
    let wsDone = false;
    const tryReady = () => {
      if (idbDone && wsDone) setEditorReady(true);
    };

    idbPersistence.whenSynced.then(() => {
      idbDone = true;
      tryReady();
    });

    if (wsProvider.synced) {
      wsDone = true;
      tryReady();
    } else {
      wsProvider.on("synced", function onSync() {
        wsProvider.off("synced", onSync);
        wsDone = true;
        tryReady();
      });
    }

    const fallback = setTimeout(() => setEditorReady(true), 4000);
    return () => clearTimeout(fallback);
  }, []);

  // Save room on page unload (refresh, close, navigate away)
  useEffect(() => {
    const handler = () => saveRoomNow();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Room password gate
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/room/${roomId}/has-password`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.hasPassword) setPasswordRequired(true);
      })
      .catch(() => {});
  }, []);

  const handleUnlock = async () => {
    setPasswordError("");
    try {
      const res = await fetch(
        `${SERVER_URL}/api/room/${roomId}/verify-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ password: passwordInput }),
        },
      );
      const data = await res.json();
      if (data.ok) setPasswordUnlocked(true);
      else setPasswordError(data.error || "Wrong password");
    } catch {
      setPasswordError("Error checking password");
    }
  };

  const handleSettingsChange = useCallback((next) => {
    setSettings(next);
    localStorage.setItem("itecify:settings", JSON.stringify(next));
  }, []);

  // Keep language in sync with active file's metadata
  const handleFileSelect = useCallback(
    (filename, lang, location) => {
      setActiveFile(filename);
      setLanguage(lang || "javascript");
      setOpenTabs((prev) => prev.includes(filename) ? prev : [...prev, filename]);
      if (location?.line) revealEditorLocation(location.line, location.column);
    },
    [revealEditorLocation],
  );

  const handleTabClose = useCallback((filename) => {
    setOpenTabs((prev) => {
      const next = prev.filter((f) => f !== filename);
      if (filename === activeFile && next.length > 0) {
        const idx = prev.indexOf(filename);
        const fallback = next[Math.min(idx, next.length - 1)];
        const lang = yFiles.get(fallback)?.language || "javascript";
        setActiveFile(fallback);
        setLanguage(lang);
      }
      return next;
    });
  }, [activeFile]);

  const handleTabReorder = useCallback((fromIdx, toIdx) => {
    setOpenTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const handleCloseOthers = useCallback((filename) => {
    setOpenTabs([filename]);
    setActiveFile(filename);
    const lang = yFiles.get(filename)?.language || "javascript";
    setLanguage(lang);
  }, []);

  const handleCloseToRight = useCallback((filename) => {
    setOpenTabs((prev) => {
      const idx = prev.indexOf(filename);
      const next = prev.slice(0, idx + 1);
      if (!next.includes(activeFile)) {
        setActiveFile(filename);
        setLanguage(yFiles.get(filename)?.language || "javascript");
      }
      return next;
    });
  }, [activeFile]);

  const handleCloseToLeft = useCallback((filename) => {
    setOpenTabs((prev) => {
      const idx = prev.indexOf(filename);
      const next = prev.slice(idx);
      if (!next.includes(activeFile)) {
        setActiveFile(filename);
        setLanguage(yFiles.get(filename)?.language || "javascript");
      }
      return next;
    });
  }, [activeFile]);

  const handleCloseAll = useCallback(() => {
    setOpenTabs([]);
  }, []);

  // When language dropdown changes, update the file's metadata in Yjs too
  const handleLanguageChange = useCallback(
    (lang) => {
      setLanguage(lang);
      if (activeFile && yFiles.has(activeFile)) {
        yFiles.set(activeFile, { language: lang });
      }
    },
    [activeFile],
  );

  const handleOpenDiff = useCallback((targetFile) => {
    setDiffTargetFile(targetFile || null);
  }, []);

  const handleCloseDiff = useCallback(() => {
    setDiffTargetFile(null);
  }, []);

  const handleFollowUser = useCallback(
    (presence) => {
      if (!presence?.cursor?.file) return;

      const targetFile = presence.cursor.file;
      const targetMeta = yFiles.get(targetFile);
      if (!targetMeta) return;

      setActiveFile(targetFile);
      setLanguage(targetMeta.language || "javascript");
      revealEditorLocation(presence.cursor.line, presence.cursor.column);
    },
    [revealEditorLocation],
  );

  // Seed initial file selection from Yjs on first load
  useEffect(() => {
    if (!yFiles.has(activeFile)) {
      const first = [...yFiles.keys()][0];
      if (first) {
        const meta = yFiles.get(first);
        setActiveFile(first);
        setLanguage(meta?.language || "javascript");
      }
    }
  }, []);

  useEffect(() => {
    if (!diffTargetFile) return;
    if (!yFiles.has(diffTargetFile) || diffTargetFile === activeFile) {
      setDiffTargetFile(null);
    }
  }, [activeFile, diffTargetFile]);

  const collectWorkspaceFiles = useCallback(() => {
    const files = {};
    yFiles.forEach((_, fname) => {
      files[fname] = getYText(fname).toString();
    });
    return files;
  }, []);

  useEffect(() => {
    previewBusyRef.current = previewBusy;
  }, [previewBusy]);

  const handlePreviewStart = useCallback(
    async (opts = {}) => {
      setPreviewError(null);
      setPreviewNotice(null);
      setPreviewBusy(true);
      const t0 = performance.now();
      try {
        const files = collectWorkspaceFiles();
        const sizeCheck = validateWorkspaceSize(files);
        if (!sizeCheck.ok) {
          throw new Error(sizeCheck.error);
        }
        const forceAfterDemo = previewForceAfterViteDemoRef.current;
        const force = !!opts.force || forceAfterDemo;
        const nodeVersion = String(yRoomMeta.get("nodeVersion") || "20");
        const res = await fetch("/api/preview/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, files, force, nodeVersion }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Preview failed");
        if (forceAfterDemo) previewForceAfterViteDemoRef.current = false;
        previewLastPkgRef.current = files["package.json"] ?? null;
        const roundTripMs = Math.round(performance.now() - t0);
        setPreviewSyncInfo({
          at: Date.now(),
          ms: roundTripMs,
          mode: data.mode || "cold",
        });
        // IMPORTANT: nu folosi /api/preview/proxy ca src al iframe-ului. HTML-ul Vite are <script src="/src/main.jsx">;
        // pe același origin cu editorul (localhost:5173) acel URL încarcă main.jsx-ul iTECify (LandingPage), nu Docker.
        // Iframe pe host:port Docker — Vite servește din container.
        // ?itecify_rev= — URL mereu diferit față de ultimul setState → React reîncarcă iframe-ul. Fără asta, același
        // string nu remontează iframe-ul; pe Docker Desktop (volum host→container) Vite deseori nu vede HMR.
        const port = Number(data.hostPort);
        const rev = Date.now();
        const host = window.location.hostname || "localhost";
        let nextSrc = null;
        if (Number.isFinite(port) && port > 0) {
          nextSrc = `http://${host}:${port}/?itecify_rev=${rev}`;
        } else if (data.proxyPath && typeof data.proxyPath === "string") {
          const base = data.proxyPath.replace(/\/$/, "");
          nextSrc = `${base}/?itecify_rev=${rev}`;
        } else {
          throw new Error("Preview: răspuns invalid de la server");
        }
        if (!opts.silent) {
          setPreviewIframeSrc(nextSrc);
          previewIframeReloadAtRef.current = rev;
        } else {
          const minMs = 500;
          if (rev - previewIframeReloadAtRef.current >= minMs) {
            setPreviewIframeSrc(nextSrc);
            previewIframeReloadAtRef.current = rev;
          }
        }
        if (!opts.silent) {
          if (forceAfterDemo) {
            setPreviewNotice(
              "Preview repornit complet după Vite demo — container Docker nou, doar proiectul minimal (pagina „iTECify live preview”).",
            );
          } else if (data.mode === "sync") {
            setPreviewNotice(
              "Sincronizat în container — Vite/HMR reîncarcă de obicei automat. Ține Shift+Preview pentru repornire completă (ex. după schimbări în dependencies).",
            );
          } else if (opts.force) {
            setPreviewNotice(
              "Preview repornit de la zero (npm install + dev server).",
            );
          }
          setPreviewFocus((n) => n + 1);
        }
      } catch (e) {
        setPreviewSyncInfo(null);
        setPreviewError(e.message || String(e));
        if (!opts.silent) setPreviewFocus((n) => n + 1);
      } finally {
        setPreviewBusy(false);
      }
    },
    [collectWorkspaceFiles, roomId],
  );

  useEffect(() => {
    handlePreviewStartRef.current = handlePreviewStart;
  }, [handlePreviewStart]);

  useEffect(() => {
    if (!featureFlags.livePreviewSync || viewOnly || !previewIframeSrc) {
      return undefined;
    }
    let timer;
    const schedule = () => {
      if (previewBusyRef.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (previewBusyRef.current) return;
        const files = collectWorkspaceFiles();
        const wv = validateWorkspaceSize(files);
        if (!wv.ok) return;
        const pkg = files["package.json"];
        const force =
          previewLastPkgRef.current != null &&
          previewLastPkgRef.current !== pkg;
        void handlePreviewStartRef.current({ force: !!force, silent: true });
      }, 720);
    };
    ydoc.on("afterTransaction", schedule);
    return () => {
      ydoc.off("afterTransaction", schedule);
      clearTimeout(timer);
    };
  }, [previewIframeSrc, collectWorkspaceFiles, viewOnly]);

  useEffect(() => {
    const key = `itecify:stdin:${roomId}:${activeFile}`;
    try {
      const v = localStorage.getItem(key);
      if (v != null) setStdin(v);
    } catch {
      /* ignore */
    }
  }, [activeFile, roomId]);

  useEffect(() => {
    const key = `itecify:stdin:${roomId}:${activeFile}`;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, stdin);
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [stdin, activeFile, roomId]);

  const handlePreviewStop = useCallback(async () => {
    try {
      await fetch("/api/preview/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
    } catch {
      /* ignore */
    }
    setPreviewIframeSrc(null);
    setPreviewError(null);
    setPreviewNotice(null);
    setPreviewSyncInfo(null);
    previewLastPkgRef.current = null;
    previewIframeReloadAtRef.current = 0;
  }, [roomId]);

  const applyViteDemo = useCallback(() => {
    mergeVitePreviewTemplate(yFiles, getYText);
    previewForceAfterViteDemoRef.current = true;
    setActiveFile("src/App.jsx");
    setLanguage("react-jsx");
  }, []);

  const handleViteDemo = useCallback(() => {
    const keys = [...yFiles.keys()];
    const hasOther = keys.some((k) => !VITE_PREVIEW_TEMPLATE_PATHS.has(k));
    if (hasOther) {
      setConfirmDlg({
        title: "Vite demo",
        body: "Se va inlocui tot continutul camerei cu exemplul Vite minimal.\nFisierele actuale dispar pentru toti colaboratorii.",
        danger: true,
        onOk: applyViteDemo,
      });
      return;
    }
    applyViteDemo();
  }, [applyViteDemo]);

  const applyFullstackDemo = useCallback(() => {
    mergeFullstackPreviewTemplate(yFiles, getYText);
    previewForceAfterViteDemoRef.current = true;
    setActiveFile("src/App.jsx");
    setLanguage("react-jsx");
  }, []);

  const handleFullstackDemo = useCallback(() => {
    const keys = [...yFiles.keys()];
    const hasOther = keys.some((k) => !FULLSTACK_TEMPLATE_PATHS.has(k));
    if (hasOther) {
      setConfirmDlg({
        title: "API demo",
        body: "Se va inlocui continutul camerei cu exemplul Vite + Express API.\nSe sterg fisierele existente pentru toti colaboratorii.",
        danger: true,
        onOk: applyFullstackDemo,
      });
      return;
    }
    applyFullstackDemo();
  }, [applyFullstackDemo]);

  const diffLanguage =
    yFiles.get(diffTargetFile)?.language ||
    yFiles.get(activeFile)?.language ||
    language;

  const handleRun = useCallback(async () => {
    const code = getYText(activeFile).toString();
    if (!code.trim()) return;

    if (new TextEncoder().encode(code).length > MAX_RUN_SOURCE_BYTES) {
      setOutput([
        {
          type: "stderr",
          text: "Fișierul activ depășește limita pentru Run. Folosește Preview sau împarte codul.",
        },
      ]);
      return;
    }

    if (!SANDBOX_RUN_LANGUAGES.has(language)) {
      setOutput([
        { type: "info", text: `▶ Run nu se aplică la „${language}”.` },
        {
          type: "stderr",
          text: "Sandbox-ul rulează un singur fișier (JS/TS/Python/Rust/Go/Java/C). Pentru HTML/CSS/JSON sau proiecte Vite/React, folosește butonul Preview (Docker).",
        },
      ]);
      return;
    }

    setRunning(true);
    setOutput([
      { type: "info", text: `▶ Running ${activeFile}…` },
      {
        type: "info",
        text: "Sandbox Docker: ~128 MB RAM, timeout 30s (direct: 10s).",
      },
    ]);

    try {
      const res = await fetch(`${SERVER_URL}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language,
          stdin,
          roomId,
          packages: packages.split(/[\s,]+/).filter(Boolean),
          env: Object.fromEntries(
            envVars
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.includes("="))
              .map((l) => {
                const i = l.indexOf("=");
                return [l.slice(0, i), l.slice(i + 1)];
              }),
          ),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setOutput((prev) => [
          ...prev,
          { type: "stderr", text: data.error || "Run failed" },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop(); // keep incomplete chunk
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          try {
            const { type, text } = JSON.parse(json);
            if (type === "done") {
              setOutput((prev) => {
                if (prev.length <= 1)
                  return [...prev, { type: "info", text: "(no output)" }];
                return prev;
              });
            } else {
              const lines = text.split("\n").filter((t) => t !== "");
              if (lines.length === 0) return;
              setOutput((prev) => [
                ...prev,
                ...lines.map((t) => ({ type, text: t })),
              ]);
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
      }
    } catch (err) {
      setOutput((prev) => [
        ...prev,
        { type: "stderr", text: `Error: ${err.message}` },
      ]);
    } finally {
      setRunning(false);
    }
  }, [activeFile, language, stdin, packages, envVars, roomId]);

  // Password gate — show before the full app if room is locked
  if (passwordRequired && !passwordUnlocked) {
    return (
      <div className="app-shell flex h-full w-full items-center justify-center px-4">
        <div className="soft-card w-full max-w-sm rounded-none p-8">
          <p
            className="mb-1 text-lg font-black uppercase tracking-[0.12em]"
            style={{ color: "var(--accent)" }}
          >
            ITECIFY
          </p>
          <p
            className="mb-4 text-xs leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Room{" "}
            <span
              className="font-mono"
              style={{ color: "var(--text-primary)" }}
            >
              #{roomId}
            </span>{" "}
            is password protected.
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="Enter room password"
            autoFocus
            className="panel-input mb-3 px-3 py-2.5 text-sm"
          />
          {passwordError && (
            <p className="text-xs mb-2" style={{ color: "var(--red)" }}>
              {passwordError}
            </p>
          )}
          <button
            type="button"
            onClick={handleUnlock}
            className="liquid-surface w-full rounded-none border px-3 py-2.5 text-sm font-semibold uppercase tracking-[0.12em]"
            style={{
              background: "var(--accent)",
              color: "var(--bg-primary)",
              borderColor: "var(--accent)",
            }}
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex h-full w-full flex-col">
      <ConnectionBanner />
      {showOnboarding && (
        <OnboardingTour onDismiss={() => setShowOnboarding(false)} />
      )}
      <ConfirmModal
        open={!!confirmDlg}
        title={confirmDlg?.title || ""}
        body={confirmDlg?.body || ""}
        danger={confirmDlg?.danger}
        onConfirm={() => {
          confirmDlg?.onOk?.();
          setConfirmDlg(null);
        }}
        onCancel={() => setConfirmDlg(null)}
      />
      <WorkspaceSearch
        open={workspaceSearchOpen}
        onClose={() => setWorkspaceSearchOpen(false)}
        onOpenResult={(fname, lang, location) => {
          handleFileSelect(fname, lang, location);
        }}
      />
      <TopBar
        filename={activeFile}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={viewOnly ? null : handleRun}
        running={running}
        onPreview={viewOnly ? null : handlePreviewStart}
        previewBusy={previewBusy}
        onViteDemo={viewOnly ? null : handleViteDemo}
        onFullstackDemo={viewOnly ? null : handleFullstackDemo}
        onOpenWorkspaceSearch={
          viewOnly ? undefined : () => setWorkspaceSearchOpen(true)
        }
        roomNodeVersion={roomNodeVersion}
        onRoomNodeVersionChange={(v) => yRoomMeta.set("nodeVersion", v)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onFollowUser={handleFollowUser}
        diffTargetFile={diffTargetFile}
        onOpenDiff={handleOpenDiff}
        onCloseDiff={handleCloseDiff}
        viewOnly={viewOnly}
      />

      <div className="flex flex-1 overflow-hidden">
        <FileTree
          activeFile={activeFile}
          onFileSelect={handleFileSelect}
          readOnly={viewOnly}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar
            tabs={openTabs}
            activeFile={activeFile}
            yFiles={yFiles}
            onSelect={(filename, lang) => handleFileSelect(filename, lang)}
            onClose={handleTabClose}
            onReorder={handleTabReorder}
            onCloseOthers={handleCloseOthers}
            onCloseToRight={handleCloseToRight}
            onCloseToLeft={handleCloseToLeft}
            onCloseAll={handleCloseAll}
          />
          <TimeTravel editorRef={editorRef} activeFile={activeFile} />
          <div className="flex-1 overflow-hidden">
            {editorReady ? (
              diffTargetFile ? (
                <DiffEditor
                  key={`${diffTargetFile}\0${activeFile}`}
                  originalLabel={diffTargetFile}
                  modifiedLabel={activeFile}
                  originalValue={getYText(diffTargetFile).toString()}
                  modifiedValue={getYText(activeFile).toString()}
                  language={diffLanguage}
                />
              ) : (
                <Editor
                  ref={editorRef}
                  language={language}
                  activeFile={activeFile}
                  settings={effectiveSettings}
                  readOnly={viewOnly}
                />
              )
            ) : (
              <div className="editor-loading">
                <div className="soft-card flex items-center gap-3 rounded-none px-4 py-3">
                  <div
                    className="h-2.5 w-2.5 animate-bounce rounded-none"
                    style={{ background: "var(--accent)" }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Preparing workspace...
                  </span>
                </div>
              </div>
            )}
          </div>
          <OutputPanel
            output={output}
            stdin={stdin}
            onStdinChange={setStdin}
            packages={packages}
            onPackagesChange={setPackages}
            envVars={envVars}
            onEnvVarsChange={setEnvVars}
            previewIframeSrc={previewIframeSrc}
            previewError={previewError}
            previewNotice={previewNotice}
            previewSyncInfo={previewSyncInfo}
            previewBusy={previewBusy}
            focusPreviewSignal={previewFocus}
            onPreviewStop={viewOnly ? undefined : handlePreviewStop}
            previewDisabled={viewOnly}
          />
        </div>

        <Sidebar
          editorRef={editorRef}
          activeFile={activeFile}
          language={language}
          output={output}
          onOpenWorkspaceFile={(path, lang) =>
            handleFileSelect(path, lang || "markdown")
          }
        />
      </div>
    </div>
  );
}
