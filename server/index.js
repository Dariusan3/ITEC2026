const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });

const Groq = require("groq-sdk");
const express = require("express");
const cors = require("cors");
const http = require("http");
const Y = require("yjs");
const { WebSocketServer, WebSocket } = require("ws");
const { encoding, decoding, mutex } = require("lib0");

const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 1234;

// --- Express API server ---
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// --- AI suggestion endpoint ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post("/api/ai/suggest", async (req, res) => {
  const { code, prompt, language } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: "You are an AI coding assistant inside a collaborative editor called iTECify. Respond with ONLY a JSON object (no markdown, no code fences) in this exact format: {\"suggestion\": \"<the code to insert>\", \"explanation\": \"<one-line explanation>\"}. The \"suggestion\" field must contain ONLY code, no markdown fences. Use \\n for newlines inside the code string.",
        },
        {
          role: "user",
          content: `The user is editing a ${language || "javascript"} file. Here is their current code:\n\n\`\`\`${language || "javascript"}\n${code || ""}\n\`\`\`\n\nThe user asks: "${prompt}"`,
        },
      ],
    });

    const text = chatCompletion.choices[0].message.content.trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { suggestion: text, explanation: "AI suggestion" };
    }

    res.json({
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      suggestion: parsed.suggestion,
      explanation: parsed.explanation || "AI suggestion",
    });
  } catch (err) {
    console.error("[AI Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Code execution engine (Docker + fallback) ---
const Docker = require("dockerode");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const docker = new Docker();

/** OCI platform for pulls/creates — avoids exec format error when image arch mismatches the host. */
function getDockerLinuxPlatform() {
  const env = process.env.DOCKER_PLATFORM?.trim();
  if (env) {
    const parts = env.split("/");
    return { os: parts[0] || "linux", architecture: parts[1] || "amd64" };
  }
  const architecture =
    process.env.DOCKER_PLATFORM_ARCH?.trim()
    || (process.arch === "arm64" ? "arm64" : "amd64");
  return { os: "linux", architecture };
}

const DOCKER_LINUX_PLATFORM = getDockerLinuxPlatform();
const DOCKER_PLATFORM_SPEC = `${DOCKER_LINUX_PLATFORM.os}/${DOCKER_LINUX_PLATFORM.architecture}`;

const LANG_CONFIG = {
  javascript: { ext: ".js", image: "node:20-slim", cmd: ["node", "/sandbox/code.js"] },
  typescript: { ext: ".ts", image: "node:20-slim", cmd: ["node", "/sandbox/code.ts"] },
  python:     { ext: ".py", image: "python:3.11-slim", cmd: ["python", "/sandbox/code.py"] },
  rust:       { ext: ".rs", image: "rust:slim", cmd: ["sh", "-c", "rustc /sandbox/code.rs -o /sandbox/code && /sandbox/code"] },
};

const FALLBACK_CMD = {
  javascript: "node",
  typescript: "node",
  python: "python3",
};

const DANGEROUS_PATTERNS = {
  javascript: [/\brequire\s*\(\s*['"]child_process['"]\s*\)/, /\beval\s*\(/, /\bexecSync\s*\(/, /\bspawnSync\s*\(/],
  typescript: [/\brequire\s*\(\s*['"]child_process['"]\s*\)/, /\beval\s*\(/, /\bexecSync\s*\(/, /\bspawnSync\s*\(/],
  python: [/\bos\.system\s*\(/, /\bsubprocess\./, /\beval\s*\(/, /\bexec\s*\(/, /\b__import__\s*\(/],
  rust: [],
};

// Check Docker on every run (so it picks up Docker starting/stopping)
async function isDockerAvailable() {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

/** Docker Engine does not auto-pull on createContainer; ensure image exists locally. */
async function ensureDockerImage(image) {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    // not present locally
  }
  console.log(`[iTECify] Pulling Docker image ${image} (${DOCKER_PLATFORM_SPEC})...`);
  await new Promise((resolve, reject) => {
    docker.pull(
      image,
      { platform: DOCKER_PLATFORM_SPEC },
      (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (followErr) => (followErr ? reject(followErr) : resolve()));
      },
    );
  });
}

function scanCode(code, language) {
  const patterns = DANGEROUS_PATTERNS[language] || [];
  const warnings = [];
  for (const pattern of patterns) {
    if (pattern.test(code)) {
      warnings.push(`Warning: dangerous pattern detected: ${pattern.source}`);
    }
  }
  return warnings;
}

async function runInDocker(code, config) {
  await ensureDockerImage(config.image);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "itecify-"));
  const tmpFile = path.join(tmpDir, `code${config.ext}`);
  fs.writeFileSync(tmpFile, code);

  let container;
  try {
    container = await docker.createContainer({
      Image: config.image,
      Platform: DOCKER_LINUX_PLATFORM,
      Cmd: config.cmd,
      HostConfig: {
        Memory: 128 * 1024 * 1024,   // 128 MB
        CpuPeriod: 100000,
        CpuQuota: 50000,              // 0.5 CPUs
        NetworkMode: "none",          // no network access
        Binds: [`${tmpDir}:/sandbox:ro`],
        // AutoRemove + wait() races on Docker Desktop (404 no such container after fast exit)
        AutoRemove: false,
      },
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    const stream = await container.attach({ stream: true, stdout: true, stderr: true });

    let stdout = "";
    let stderr = "";
    const stdoutStream = new (require("stream").PassThrough)();
    const stderrStream = new (require("stream").PassThrough)();

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    stdoutStream.on("data", (chunk) => { stdout += chunk.toString(); });
    stderrStream.on("data", (chunk) => { stderr += chunk.toString(); });

    await container.start();

    const result = await Promise.race([
      container.wait(),
      new Promise((_, reject) =>
        setTimeout(async () => {
          try { await container.kill(); } catch {}
          reject(new Error("Execution timed out (30s limit)"));
        }, 30000)
      ),
    ]);

    return {
      stdout,
      stderr,
      exitCode: result.StatusCode,
    };
  } catch (err) {
    if (err.message.includes("timed out")) {
      return { stdout: "", stderr: "", error: err.message };
    }
    throw err;
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // already removed or daemon hiccup
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runDirect(code, language) {
  const cmd = FALLBACK_CMD[language];
  if (!cmd) throw new Error(`No fallback for ${language} — Docker required`);

  const config = LANG_CONFIG[language];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "itecify-"));
  const tmpFile = path.join(tmpDir, `code${config.ext}`);
  fs.writeFileSync(tmpFile, code);

  try {
    return await new Promise((resolve) => {
      execFile(cmd, [tmpFile], { timeout: 10000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        if (err && err.killed) {
          resolve({ stdout, stderr, error: "Execution timed out (10s limit)" });
        } else if (err) {
          resolve({ stdout, stderr: stderr || err.message });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

app.post("/api/run", async (req, res) => {
  const { code, language } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

  const config = LANG_CONFIG[language];
  if (!config) return res.status(400).json({ error: `Unsupported language: ${language}` });

  const warnings = scanCode(code, language);

  try {
    let result;
    let mode;

    if (await isDockerAvailable()) {
      mode = "docker";
      result = await runInDocker(code, config);
    } else {
      if (!FALLBACK_CMD[language]) {
        return res.status(400).json({ error: `${language} requires Docker — start Docker Desktop and restart the server` });
      }
      mode = "direct";
      result = await runDirect(code, language);
    }

    const warningText = warnings.length > 0 ? warnings.join("\n") + "\n" : "";
    res.json({
      stdout: result.stdout,
      stderr: warningText + (result.stderr || ""),
      error: result.error,
      mode,
    });
  } catch (err) {
    console.error("[Run Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Time-travel: snapshots endpoint ---
const Redis = require("ioredis");
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
let redis = null;

try {
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, retryStrategy: () => null });
  redis.on("error", () => {});
  redis.ping().then(() => {
    console.log("[iTECify] Redis connected — time-travel enabled");
  }).catch(() => {
    console.log("[iTECify] Redis not available — time-travel disabled");
    redis = null;
  });
} catch {
  console.log("[iTECify] Redis not available — time-travel disabled");
}

const SNAPSHOT_KEY = "itecify:snapshots";

app.get("/api/snapshots", async (_req, res) => {
  if (!redis) return res.json({ snapshots: [] });
  try {
    const raw = await redis.lrange(SNAPSHOT_KEY, 0, -1);
    const snapshots = raw.map((entry) => {
      const parsed = JSON.parse(entry);
      return { timestamp: parsed.timestamp, label: parsed.label };
    });
    res.json({ snapshots });
  } catch {
    res.json({ snapshots: [] });
  }
});

app.get("/api/snapshots/:timestamp", async (req, res) => {
  if (!redis) return res.status(503).json({ error: "Redis not available" });
  try {
    const raw = await redis.lrange(SNAPSHOT_KEY, 0, -1);
    const target = parseInt(req.params.timestamp);
    for (const entry of raw) {
      const parsed = JSON.parse(entry);
      if (parsed.timestamp === target) {
        return res.json({ snapshot: parsed.snapshot, timestamp: parsed.timestamp });
      }
    }
    res.status(404).json({ error: "Snapshot not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Shared terminal (node-pty) ---
const pty = require("node-pty");

let sharedPty = null;
const termClients = new Set();

function getDefaultShell() {
  if (process.platform === "win32") {
    if (process.env.COMSPEC) return process.env.COMSPEC;
    const root = process.env.SystemRoot || process.env.windir || "C:\\Windows";
    return path.join(root, "System32", "cmd.exe");
  }
  return process.env.SHELL || "/bin/bash";
}

function getOrCreatePty() {
  if (sharedPty) return sharedPty;
  try {
    const shell = getDefaultShell();
    sharedPty = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env },
    });
    sharedPty.onData((data) => {
      termClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "term:output", data }));
        }
      });
    });
    sharedPty.onExit(() => {
      sharedPty = null;
      termClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "term:exit" }));
        }
      });
    });
    return sharedPty;
  } catch (err) {
    console.error("[iTECify] Failed to spawn terminal:", err.message);
    return null;
  }
}

const TERM_WS_PORT = Number(process.env.TERM_WS_PORT) || 1235;
const termWss = new WebSocketServer({ port: TERM_WS_PORT });
termWss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[iTECify] Port ${TERM_WS_PORT} already in use (terminal WS). Stop the other \`npm run dev\` or change TERM_WS_PORT / VITE_TERM_WS_PORT in .env.`);
  } else {
    console.error("[iTECify] Terminal WebSocket error:", err.message);
  }
  process.exit(1);
});

termWss.on("connection", (ws) => {
  termClients.add(ws);
  const terminal = getOrCreatePty();

  if (!terminal) {
    ws.send(JSON.stringify({ type: "term:output", data: "[Terminal unavailable — node-pty spawn failed]\r\n" }));
    ws.on("close", () => termClients.delete(ws));
    return;
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "term:input" && sharedPty) {
        sharedPty.write(msg.data);
      } else if (msg.type === "term:resize" && msg.cols && msg.rows && sharedPty) {
        sharedPty.resize(msg.cols, msg.rows);
      }
    } catch {}
  });

  ws.on("close", () => {
    termClients.delete(ws);
  });
});

console.log(`[iTECify] Shared terminal WebSocket on ws://localhost:${TERM_WS_PORT}`);

const apiServer = http.createServer(app);
apiServer.listen(PORT, () => {
  console.log(`[iTECify] API server running on http://localhost:${PORT}`);
});

// --- Yjs WebSocket collaboration server ---

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

const docs = new Map();

function getYDoc(docName) {
  if (docs.has(docName)) return docs.get(docName);
  const doc = new Y.Doc();
  doc.name = docName;
  doc.conns = new Map();
  doc.awareness = { states: new Map(), meta: new Map() };
  docs.set(docName, doc);

  // Time-travel: snapshot every 10 seconds while doc has connections
  doc._snapshotInterval = setInterval(async () => {
    if (!redis || doc.conns.size === 0) return;
    try {
      const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
      const entry = JSON.stringify({
        timestamp: Date.now(),
        label: new Date().toLocaleTimeString(),
        snapshot,
      });
      await redis.rpush(SNAPSHOT_KEY, entry);
      // Keep max 360 snapshots (1 hour at 10s intervals)
      await redis.ltrim(SNAPSHOT_KEY, -360, -1);
    } catch {}
  }, 10000);

  return doc;
}

function broadcastUpdate(doc, message, excludeConn) {
  doc.conns.forEach((_, conn) => {
    if (conn !== excludeConn && conn.readyState === WebSocket.OPEN) {
      conn.send(message);
    }
  });
}

function encodeAwarenessUpdate(states, changedClients) {
  // Encode the inner awareness payload
  const innerEncoder = encoding.createEncoder();
  encoding.writeVarUint(innerEncoder, changedClients.length);
  for (const clientID of changedClients) {
    const state = states.get(clientID);
    encoding.writeVarUint(innerEncoder, clientID);
    encoding.writeVarUint(innerEncoder, state ? state.clock : 0);
    encoding.writeVarString(
      innerEncoder,
      state ? JSON.stringify(state.state) : "null",
    );
  }
  // Wrap in the message envelope: [MSG_AWARENESS][varUint8Array(payload)]
  const outerEncoder = encoding.createEncoder();
  encoding.writeVarUint(outerEncoder, MSG_AWARENESS);
  encoding.writeVarUint8Array(outerEncoder, encoding.toUint8Array(innerEncoder));
  return encoding.toUint8Array(outerEncoder);
}

function applyAwarenessUpdate(doc, buf, conn) {
  const decoder = decoding.createDecoder(buf);
  const len = decoding.readVarUint(decoder);
  const changed = [];

  for (let i = 0; i < len; i++) {
    const clientID = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const stateStr = decoding.readVarString(decoder);
    const state = JSON.parse(stateStr);

    const meta = doc.awareness.meta.get(clientID);
    const prevClock = meta ? meta.clock : 0;

    if (clock >= prevClock) {
      if (state === null) {
        doc.awareness.states.delete(clientID);
      } else {
        doc.awareness.states.set(clientID, { clock, state });
      }
      doc.awareness.meta.set(clientID, { clock, conn });
      changed.push(clientID);
    }
  }

  if (changed.length > 0) {
    const msg = encodeAwarenessUpdate(doc.awareness.states, changed);
    broadcastUpdate(doc, msg, null);
  }
}

function setupConnection(ws, req) {
  const urlPath = req.url.slice(1).split("?")[0];
  const docName = urlPath || "default";
  const doc = getYDoc(docName);

  doc.conns.set(ws, new Set());

  ws.on("message", (rawMsg) => {
    const message = new Uint8Array(rawMsg);
    const decoder = decoding.createDecoder(message);
    const msgType = decoding.readVarUint(decoder);

    if (msgType === MSG_SYNC) {
      const syncType = decoding.readVarUint(decoder);

      if (syncType === SYNC_STEP1) {
        // Client sends state vector, server responds with diff
        const sv = decoding.readVarUint8Array(decoder);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        encoding.writeVarUint(encoder, SYNC_STEP2);
        encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(doc, sv));
        ws.send(encoding.toUint8Array(encoder));

        // Also send server's state vector so client sends us what we're missing
        const svEncoder = encoding.createEncoder();
        encoding.writeVarUint(svEncoder, MSG_SYNC);
        encoding.writeVarUint(svEncoder, SYNC_STEP1);
        encoding.writeVarUint8Array(svEncoder, Y.encodeStateVector(doc));
        ws.send(encoding.toUint8Array(svEncoder));
      } else if (syncType === SYNC_STEP2 || syncType === SYNC_UPDATE) {
        const update = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(doc, update);

        if (syncType === SYNC_UPDATE) {
          // Broadcast update to all other clients
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MSG_SYNC);
          encoding.writeVarUint(encoder, SYNC_UPDATE);
          encoding.writeVarUint8Array(encoder, update);
          broadcastUpdate(doc, encoding.toUint8Array(encoder), ws);
        }
      }
    } else if (msgType === MSG_AWARENESS) {
      const awarenessData = decoding.readVarUint8Array(decoder);
      applyAwarenessUpdate(doc, awarenessData, ws);
    }
  });

  ws.on("close", () => {
    doc.conns.delete(ws);
    // Remove awareness states for this connection
    const removedClients = [];
    doc.awareness.meta.forEach((meta, clientID) => {
      if (meta.conn === ws) {
        doc.awareness.states.delete(clientID);
        doc.awareness.meta.delete(clientID);
        removedClients.push(clientID);
      }
    });
    if (removedClients.length > 0) {
      const msg = encodeAwarenessUpdate(doc.awareness.states, removedClients);
      broadcastUpdate(doc, msg, null);
    }
    if (doc.conns.size === 0) {
      clearInterval(doc._snapshotInterval);
      doc.destroy();
      docs.delete(doc.name);
    }
  });

  // Send existing awareness states to the new connection
  if (doc.awareness.states.size > 0) {
    const clients = Array.from(doc.awareness.states.keys());
    const msg = encodeAwarenessUpdate(doc.awareness.states, clients);
    ws.send(msg);
  }
}

const wss = new WebSocketServer({ port: WS_PORT });
wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[iTECify] Port ${WS_PORT} already in use (Yjs WS). Stop the other \`npm run dev\` or change WS_PORT / VITE_WS_PORT in .env.`);
  } else {
    console.error("[iTECify] Yjs WebSocket error:", err.message);
  }
  process.exit(1);
});
wss.on("connection", setupConnection);
console.log(
  `[iTECify] Yjs WebSocket server running on ws://localhost:${WS_PORT}`,
);
