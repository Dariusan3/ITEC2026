import { useState, useRef, useCallback, useEffect } from "react";
import TopBar from "./components/TopBar";
import FileTree from "./components/FileTree";
import Editor from "./components/Editor";
import DiffEditor from "./components/DiffEditor";
import Sidebar from "./components/Sidebar";
import OutputPanel from "./components/OutputPanel";
import TimeTravel from "./components/TimeTravel";
import ConnectionBanner from "./components/ConnectionBanner";
import {
  yFiles,
  getYText,
  roomId,
  idbPersistence,
  wsProvider,
} from "./lib/yjs";
import { saveRoomNow } from "./lib/saveRoom";
import { SERVER_URL } from "./lib/config";
import { mergeVitePreviewTemplate } from "./lib/vitePreviewTemplate";
import { SANDBOX_RUN_LANGUAGES } from "./lib/sandboxLanguages";

// C2: Read-only mode — ?view=1 in URL
const viewOnly = new URLSearchParams(window.location.search).has("view");

// P4: Session history — track visited rooms in localStorage
function recordSession(id) {
  try {
    const hist = JSON.parse(localStorage.getItem("itecify:history") || "[]");
    const filtered = hist.filter((h) => h.id !== id);
    filtered.unshift({ id, visitedAt: Date.now() });
    localStorage.setItem(
      "itecify:history",
      JSON.stringify(filtered.slice(0, 20)),
    );
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
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);
  const [stdin, setStdin] = useState("");
  const [packages, setPackages] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [settings, setSettings] = useState(loadSettings);
  const [editorReady, setEditorReady] = useState(false);
  const [diffTargetFile, setDiffTargetFile] = useState(null);
  const editorRef = useRef(null);

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
      if (location?.line) revealEditorLocation(location.line, location.column);
    },
    [revealEditorLocation],
  );

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

  const handlePreviewStart = useCallback(
    async (opts = {}) => {
      setPreviewError(null);
      setPreviewNotice(null);
      setPreviewBusy(true);
      try {
        const files = collectWorkspaceFiles();
        const res = await fetch("/api/preview/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, files, force: !!opts.force }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Preview failed");
        // Iframe pe portul Docker: căile absolute Vite trebuie să rămână pe același host:port ca dev serverul din container.
        const port = Number(data.hostPort);
        if (Number.isFinite(port) && port > 0) {
          const host = window.location.hostname || "localhost";
          setPreviewIframeSrc(`http://${host}:${port}/`);
        } else if (data.proxyPath) {
          setPreviewIframeSrc(`${data.proxyPath}/`);
        } else {
          throw new Error("Preview: răspuns invalid de la server");
        }
        if (data.mode === "sync") {
          setPreviewNotice(
            "Sincronizat în container — Vite/HMR reîncarcă de obicei automat. Ține Shift+Preview pentru repornire completă (ex. după schimbări în dependencies).",
          );
        } else if (opts.force) {
          setPreviewNotice(
            "Preview repornit de la zero (npm install + dev server).",
          );
        }
        setPreviewFocus((n) => n + 1);
      } catch (e) {
        setPreviewError(e.message || String(e));
        setPreviewFocus((n) => n + 1);
      } finally {
        setPreviewBusy(false);
      }
    },
    [collectWorkspaceFiles, roomId],
  );

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
  }, [roomId]);

  const handleViteDemo = useCallback(() => {
    mergeVitePreviewTemplate(yFiles, getYText);
    setActiveFile("src/App.jsx");
    setLanguage("javascript");
  }, []);

  const diffLanguage =
    yFiles.get(diffTargetFile)?.language ||
    yFiles.get(activeFile)?.language ||
    language;

  const handleRun = useCallback(async () => {
    const code = getYText(activeFile).toString();
    if (!code.trim()) return;

    if (!SANDBOX_RUN_LANGUAGES.has(language)) {
      setOutput([
        { type: "info", text: `▶ Run nu se aplică la „${language}”.` },
        {
          type: "stderr",
          text:
            "Sandbox-ul rulează un singur fișier (JS/TS/Python/Rust/Go/Java/C). Pentru HTML/CSS/JSON sau proiecte Vite/React, folosește butonul Preview (Docker).",
        },
      ]);
      return;
    }

    setRunning(true);
    setOutput([{ type: "info", text: `▶ Running ${activeFile}...` }]);

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
        <div className="soft-card w-full max-w-sm rounded-[1.4rem] p-8">
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
            className="liquid-surface w-full rounded-2xl border px-3 py-2.5 text-sm font-semibold uppercase tracking-[0.12em]"
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
      <TopBar
        filename={activeFile}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={viewOnly ? null : handleRun}
        running={running}
        onPreview={viewOnly ? null : handlePreviewStart}
        previewBusy={previewBusy}
        onViteDemo={viewOnly ? null : handleViteDemo}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onFollowUser={handleFollowUser}
        diffTargetFile={diffTargetFile}
        onOpenDiff={handleOpenDiff}
        onCloseDiff={handleCloseDiff}
        viewOnly={viewOnly}
      />

      <div className="flex flex-1 overflow-hidden">
        <FileTree activeFile={activeFile} onFileSelect={handleFileSelect} />

        <div className="flex flex-col flex-1 overflow-hidden">
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
                  settings={settings}
                  readOnly={viewOnly}
                />
              )
            ) : (
              <div className="editor-loading">
                <div className="soft-card flex items-center gap-3 rounded-2xl px-4 py-3">
                  <div
                    className="h-2.5 w-2.5 animate-bounce rounded-full"
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
        />
      </div>
    </div>
  );
}
