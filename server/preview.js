const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const httpProxy = require("http-proxy");

const previewSessions = new Map();

/** Primul răspuns HTTP de la Vite/Next poate întârzia (compilare). npm install poate depăși 2 min. */
const PREVIEW_READY_MS = Math.max(
  120000,
  parseInt(process.env.PREVIEW_READY_TIMEOUT_MS || "540000", 10) || 540000,
);

/** npm mai rapid, mai puțin zgomot */
const NPM_INSTALL =
  "npm install --no-audit --no-fund --loglevel warn";

const PROTECTED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".vite",
  ".turbo",
]);

function sanitizeRoomId(roomId) {
  const s = String(roomId ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 128);
  return s || null;
}

function isSafeRelPath(p) {
  if (!p || typeof p !== "string") return false;
  if (p.startsWith("/") || p.includes("..")) return false;
  const norm = path.posix.normalize(p.replace(/\\/g, "/"));
  if (norm.startsWith("..") || norm.includes("../")) return false;
  if (norm.split("/").some((seg) => PROTECTED_SEGMENTS.has(seg))) return false;
  return true;
}

function inferDevSetup(packageJsonText) {
  let p;
  try {
    p = JSON.parse(packageJsonText);
  } catch {
    throw new Error("Invalid package.json");
  }
  const dev = String(p.scripts?.dev || "");
  if (/next\s/.test(dev)) {
    return {
      internalPort: 3000,
      shellCmd: `set -e; cd /workspace && ${NPM_INSTALL} && npx next dev -H 0.0.0.0 -p 3000`,
    };
  }
  if (/vite/.test(dev)) {
    return {
      internalPort: 5173,
      shellCmd: `set -e; cd /workspace && ${NPM_INSTALL} && npm run dev -- --host 0.0.0.0 --port 5173`,
    };
  }
  if (/webpack|vue-cli-service/.test(dev)) {
    return {
      internalPort: 8080,
      shellCmd: `set -e; cd /workspace && ${NPM_INSTALL} && HOST=0.0.0.0 npm run dev`,
    };
  }
  return {
    internalPort: 5173,
    shellCmd: `set -e; cd /workspace && ${NPM_INSTALL} && npm run dev -- --host 0.0.0.0 --port 5173`,
  };
}

async function containerIsRunning(docker, containerId) {
  if (!containerId) return false;
  try {
    const inspect = await docker.getContainer(containerId).inspect();
    return !!inspect.State?.Running;
  } catch {
    return false;
  }
}

function writeWorkspaceFiles(workspaceDir, files) {
  let written = 0;
  for (const [rel, content] of Object.entries(files)) {
    if (!isSafeRelPath(rel)) continue;
    const abs = path.join(workspaceDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, String(content ?? ""), "utf8");
    written += 1;
  }
  return written;
}

function pruneRemovedFiles(workspaceDir, previousKeys, newKeySet) {
  for (const rel of previousKeys) {
    if (newKeySet.has(rel) || !isSafeRelPath(rel)) continue;
    const abs = path.join(workspaceDir, rel);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) fs.unlinkSync(abs);
    } catch {
      // ignore
    }
  }
}

async function stopPreview(roomId, docker) {
  const safe = sanitizeRoomId(roomId);
  if (!safe) return;
  const sess = previewSessions.get(safe);
  if (!sess) return;
  previewSessions.delete(safe);
  try {
    const c = docker.getContainer(sess.containerId);
    await c.kill().catch(() => {});
    await c.remove({ force: true }).catch(() => {});
  } catch {
    // ignore
  }
  try {
    fs.rmSync(sess.workspaceDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Așteaptă până TCP răspunde pe port și HTTP returnează (orice status).
 * Răspunsul la primul request poate fi lent din cauza compilării — timeout mare pe request.
 */
function waitForHttpPort(port, timeoutMs = PREVIEW_READY_MS) {
  const deadline = Date.now() + timeoutMs;
  const started = Date.now();
  let lastLog = 0;

  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const now = Date.now();
      if (now >= deadline) {
        const mins = Math.round(timeoutMs / 60000);
        reject(
          new Error(
            `Preview: serverul de dev nu a răspuns în ${mins} min (port host ${port}). Adesea npm install sau prima compilare Vite/Next depășeau limita. En PREVIEW_READY_TIMEOUT_MS în .env (ex. 900000). Verifică logurile containerului în consola serverului după acest mesaj.`,
          ),
        );
        return;
      }

      if (now - lastLog > 45000) {
        lastLog = now;
        console.log(
          `[Preview] Încă aștept răspuns pe 127.0.0.1:${port} (${Math.round((now - started) / 1000)}s / ${Math.round(timeoutMs / 1000)}s)…`,
        );
      }

      const req = http.get(
        `http://127.0.0.1:${port}/`,
        { timeout: 45000 },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        setTimeout(tryOnce, 750);
      });
      req.on("timeout", () => {
        req.destroy();
        setTimeout(tryOnce, 750);
      });
    };
    setTimeout(tryOnce, 400);
  });
}

async function logPreviewContainerTail(docker, containerId, label) {
  if (!containerId || !docker) return;
  try {
    const buf = await docker
      .getContainer(containerId)
      .logs({ stdout: true, stderr: true, tail: 120 });
    const txt = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
    console.error(`[Preview start] ${label} — ultimele linii din container:\n${txt.slice(-8000)}`);
  } catch (e) {
    console.error("[Preview start] Nu am putut citi logurile containerului:", e.message);
  }
}

async function ensureImage(docker, image, platformSpec) {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    // pull
  }
  await new Promise((resolve, reject) => {
    docker.pull(
      image,
      platformSpec ? { platform: platformSpec } : {},
      (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (e) => (e ? reject(e) : resolve()));
      },
    );
  });
}

/**
 * @param {{ force?: boolean }} [options] force — repornire completă (npm install din nou)
 */
async function startPreview(roomId, files, docker, platformSpec, options = {}) {
  const force = !!options.force;
  const safe = sanitizeRoomId(roomId);
  if (!safe) throw new Error("Invalid roomId");

  const pkg = files["package.json"];
  if (!pkg || typeof pkg !== "string") {
    throw new Error("package.json is required for preview");
  }

  const { internalPort, shellCmd } = inferDevSetup(pkg);
  const existing = previewSessions.get(safe);

  if (existing && !force) {
    const running = await containerIsRunning(docker, existing.containerId);
    const sameProject =
      existing.packageJsonSnapshot === pkg &&
      existing.internalPort === internalPort;
    if (running && sameProject) {
      const written = writeWorkspaceFiles(existing.workspaceDir, files);
      if (written === 0) throw new Error("No valid files to write");
      const newKeys = Object.keys(files).filter(isSafeRelPath);
      pruneRemovedFiles(
        existing.workspaceDir,
        existing.fileKeysSnapshot || [],
        new Set(newKeys),
      );
      existing.fileKeysSnapshot = newKeys;
      return {
        hostPort: existing.hostPort,
        internalPort: existing.internalPort,
        safeRoomId: safe,
        mode: "sync",
      };
    }
  }

  await stopPreview(safe, docker);

  const workspaceDir = path.join(os.tmpdir(), `itecify-preview-${safe}`);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const written = writeWorkspaceFiles(workspaceDir, files);
  if (written === 0) throw new Error("No valid files to write");

  await ensureImage(docker, "node:20-slim", platformSpec);

  const containerPortStr = String(internalPort);
  const container = await docker.createContainer({
    Image: "node:20-slim",
    Platform: platformSpec || undefined,
    WorkingDir: "/workspace",
    Cmd: ["sh", "-c", shellCmd],
    ExposedPorts: { [`${containerPortStr}/tcp`]: {} },
    HostConfig: {
      Binds: [`${workspaceDir}:/workspace`],
      PortBindings: {
        [`${containerPortStr}/tcp`]: [{ HostPort: "0" }],
      },
      Memory: 1024 * 1024 * 1024,
      CpuPeriod: 100000,
      CpuQuota: 200000,
      NetworkMode: "bridge",
      AutoRemove: false,
    },
    Env: ["NODE_ENV=development"],
  });

  await container.start();
  const inspect = await container.inspect();
  const binding =
    inspect.NetworkSettings?.Ports?.[`${containerPortStr}/tcp`]?.[0]?.HostPort;
  if (!binding) {
    await stopPreview(safe, docker);
    throw new Error("Could not read host port for preview");
  }

  const hostPort = parseInt(binding, 10);
  const containerId = inspect.Id;
  const fileKeysSnapshot = Object.keys(files).filter(isSafeRelPath);
  previewSessions.set(safe, {
    containerId,
    hostPort,
    workspaceDir,
    internalPort,
    startedAt: Date.now(),
    packageJsonSnapshot: pkg,
    fileKeysSnapshot,
  });

  try {
    await waitForHttpPort(hostPort, PREVIEW_READY_MS);
  } catch (e) {
    await logPreviewContainerTail(docker, containerId, "timeout / eroare ready");
    await stopPreview(safe, docker);
    throw e;
  }

  return {
    hostPort,
    internalPort,
    safeRoomId: safe,
    mode: "cold",
  };
}

const proxy = httpProxy.createProxyServer({
  ws: true,
  xfwd: true,
  secure: false,
});

proxy.on("error", (err, req, res) => {
  if (
    res &&
    !res.headersSent &&
    typeof res.writeHead === "function" &&
    typeof res.end === "function"
  ) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Preview proxy error");
  }
  void err;
  void req;
});

function createPreviewProxy() {
  return (req, res) => {
    const rawRoom = req.params?.roomId;
    const safe = sanitizeRoomId(rawRoom);
    if (!safe) {
      res.status(400).end("Invalid room");
      return;
    }
    const sess = previewSessions.get(safe);
    if (!sess) {
      res
        .status(503)
        .end("Preview not running — use Preview in the toolbar to start");
      return;
    }
    const target = `http://127.0.0.1:${sess.hostPort}`;
    proxy.web(req, res, { target, changeOrigin: true });
  };
}

function handlePreviewUpgrade(req, socket, head) {
  const url = req.url || "";
  const m = url.match(/^\/api\/preview\/proxy\/([^/?#]+)(.*)$/);
  if (!m) return false;
  const safe = sanitizeRoomId(m[1]);
  if (!safe || !previewSessions.has(safe)) {
    socket.destroy();
    return true;
  }
  const sess = previewSessions.get(safe);
  const rest = m[2] && m[2].length > 0 ? m[2] : "/";
  req.url = rest;
  const target = `ws://127.0.0.1:${sess.hostPort}`;
  proxy.ws(req, socket, head, { target, changeOrigin: true });
  return true;
}

module.exports = {
  sanitizeRoomId,
  startPreview,
  stopPreview,
  previewSessions,
  createPreviewProxy,
  handlePreviewUpgrade,
};
