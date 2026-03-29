const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });

const Groq = require("groq-sdk");
const express = require("express");
const cors = require("cors");
const http = require("http");
const Y = require("yjs");
const { WebSocketServer, WebSocket } = require("ws");
const { encoding, decoding } = require("lib0");

const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// --- Database (Supabase) ---
const db = require("./db");
db.init();

// --- Express API server ---
const app = express();
const session = require("express-session");

// Use Postgres-backed session store when DATABASE_URL is set, otherwise in-memory
let sessionStore;
if (process.env.DATABASE_URL) {
  const pgSession = require("connect-pg-simple")(session);
  sessionStore = new pgSession({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: false,
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
  });
  console.log("[iTECify] Session store: Postgres");
} else {
  console.log(
    "[iTECify] Session store: in-memory (set DATABASE_URL for persistence)",
  );
}

const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: IS_PROD ? allowedOrigin : true, credentials: true }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "12mb" }));

const { logStructured } = require("./logger");
const { assertWorkspaceWithinLimit } = require("./workspaceLimits");
const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "itecify-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
  },
});
app.use(sessionMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.get("/api/db/status", async (_req, res) => {
  if (!db.isEnabled())
    return res.json({ enabled: false, reason: "SUPABASE_URL not configured" });
  const ok = await db.ping();
  res.json({ enabled: true, connected: ok });
});

// --- AI suggestion endpoint ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/** Când modelul returnează JSON invalid, extragem manual string-ul din "suggestion". */
function extractJsonStringField(text, field) {
  if (!text || typeof text !== "string") return null;
  const needle = `"${field}"`;
  const idx = text.indexOf(needle);
  if (idx === -1) return null;
  const after = text.slice(idx + needle.length);
  const colon = after.indexOf(":");
  if (colon === -1) return null;
  let rest = after.slice(colon + 1).trim();
  if (!rest.startsWith('"')) return null;
  let i = 1;
  let out = "";
  while (i < rest.length) {
    const c = rest[i];
    if (c === "\\" && i + 1 < rest.length) {
      const n = rest[i + 1];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === '"' || n === "\\" || n === "/") out += n;
      else if (n === "u" && i + 5 < rest.length) {
        const hex = rest.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        out += n;
      } else out += n;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out;
}

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
          content:
            'You are an AI coding assistant inside a collaborative editor called iTECify. Respond with ONLY valid JSON (no markdown, no code fences). The JSON must have exactly two keys: "suggestion" (string, the code only) and "explanation" (string, one short line). Both keys must be double-quoted. Example: {"suggestion":"#include <stdio.h>\\n...", "explanation":"Reads n numbers"}. Never use unquoted text as a JSON key.',
        },
        {
          role: "user",
          content: `The user is editing a ${language || "javascript"} file. Here is their current code:\n\n\`\`\`${language || "javascript"}\n${code || ""}\n\`\`\`\n\nThe user asks: "${prompt}"`,
        },
      ],
    });

    const raw = chatCompletion.choices[0].message.content.trim();
    // Strip markdown code fences if the model wrapped the JSON
    const stripped = raw
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    let suggestion;
    let explanation = "AI suggestion";
    try {
      const parsed = JSON.parse(stripped);
      suggestion = parsed.suggestion;
      explanation = parsed.explanation || explanation;
    } catch {
      suggestion = extractJsonStringField(stripped, "suggestion");
      const expl = extractJsonStringField(stripped, "explanation");
      if (expl != null) explanation = expl;
      if (suggestion == null) suggestion = stripped;
    }
    if (typeof suggestion !== "string") suggestion = String(suggestion ?? "");
    if (typeof suggestion === "string" && suggestion.trim().startsWith("{")) {
      try {
        const inner = JSON.parse(suggestion);
        if (inner.suggestion != null) suggestion = inner.suggestion;
      } catch {
        const loose = extractJsonStringField(suggestion, "suggestion");
        if (loose != null) suggestion = loose;
      }
    }

    res.json({
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      suggestion,
      explanation,
    });
  } catch (err) {
    console.error("[AI Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Shared helper for plain-text AI responses
async function askGroq(systemPrompt, userMessage, maxTokens = 1024) {
  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  return res.choices[0].message.content.trim();
}

// A1: Explain selected code
app.post("/api/ai/explain", async (req, res) => {
  const { selection, language } = req.body;
  if (!selection)
    return res.status(400).json({ error: "selection is required" });
  try {
    const explanation = await askGroq(
      "You are an expert coding tutor. Explain the provided code snippet clearly and concisely in plain English. Focus on what it does, not how to rewrite it. Use bullet points if helpful. No markdown code fences.",
      `Language: ${language || "code"}\n\nCode to explain:\n${selection}`,
    );
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Prefixează fiecare linie ca modelul să poată ținti exact zona din mesajul de eroare. */
function codeWithLineNumbers(src) {
  return src
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, "0")} | ${line}`)
    .join("\n");
}

function stripOuterCodeFences(s) {
  let t = String(s ?? "").trim();
  t = t.replace(/^```(?:[\w+#]+)?\n?/i, "").replace(/\n?```$/i, "").trim();
  return t;
}

function parseLooseJson(text) {
  const stripped = stripOuterCodeFences(text);
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

// A2: Fix errors
app.post("/api/ai/fix", async (req, res) => {
  const { code, error: errorText, language, hintLine } = req.body;
  if (!code || !errorText)
    return res.status(400).json({ error: "code and error are required" });
  try {
    const hint =
      typeof hintLine === "number" && hintLine > 0
        ? `\n(The client suggests focusing near line ${hintLine} if the error message references a line number.)`
        : "";
    const userMsg = `Language: ${language || "code"}

Below is the FULL current source with line numbers on the left (format: NNNN | code). You MUST return the ENTIRE file as "fixed" — same length/order of logic as much as possible, changing only what is needed to resolve the error. Do not omit valid parts of the file. Do not return a diff only.

--- source ---
${codeWithLineNumbers(code)}
--- end source ---

--- tool/runtime output ---
${errorText.trim()}
--- end output ---${hint}`;

    const raw = await askGroq(
      `You are an expert programmer. The user's code failed to compile or run. Analyze the error output and the numbered source.

Respond with ONLY valid JSON (no markdown, no code fences). Exactly two keys, both double-quoted: "fixed" (string: the COMPLETE corrected source file, with real newlines as \\n in JSON) and "explanation" (string: one short sentence in plain language naming the bug and the fix).

Rules:
- "fixed" must be runnable source only — no line number prefixes, no explanations inside the string.
- Preserve the user's style, comments, and unrelated correct code.
- If the error points to a specific line, fix that cause without rewriting the whole program unnecessarily.`,
      userMsg,
      4096,
    );

    const stripped = stripOuterCodeFences(raw)
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    let fixed;
    let explanation = "Am aplicat corecția sugerată.";
    try {
      const parsed = JSON.parse(stripped);
      fixed = parsed.fixed;
      explanation = parsed.explanation || explanation;
    } catch {
      fixed = extractJsonStringField(stripped, "fixed");
      const expl = extractJsonStringField(stripped, "explanation");
      if (expl != null) explanation = expl;
      if (fixed == null) fixed = stripOuterCodeFences(stripped);
    }

    if (typeof fixed !== "string") fixed = String(fixed ?? "");
    fixed = stripOuterCodeFences(fixed);
    if (fixed.trim().startsWith("{")) {
      try {
        const inner = JSON.parse(fixed);
        if (inner.fixed != null) fixed = String(inner.fixed);
      } catch {
        const loose = extractJsonStringField(fixed, "fixed");
        if (loose != null) fixed = loose;
      }
    }

    if (!fixed.trim()) {
      return res.status(422).json({ error: "Model returned empty fix" });
    }

    res.json({ fixed, explanation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A3: Generate tests
app.post("/api/ai/tests", async (req, res) => {
  const { code, language } = req.body;
  if (!code) return res.status(400).json({ error: "code is required" });
  const testFramework = language === "python" ? "pytest" : "jest";
  try {
    const raw = await askGroq(
      `You are an expert in ${testFramework}. Generate a complete test file for the provided code using ${testFramework}. Return ONLY the test code, no explanation, no markdown fences.`,
      `Language: ${language || "javascript"}\n\nCode to test:\n${code}`,
      2048,
    );
    res.json({ tests: raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A5: AI code review
app.post("/api/ai/review", async (req, res) => {
  const { code, language } = req.body;
  if (!code) return res.status(400).json({ error: "code is required" });

  try {
    const raw = await askGroq(
      `You are a senior code reviewer. Review the file and return ONLY valid JSON with one key: "issues".
"issues" must be an array of objects. Each object must contain:
- "line": integer line number
- "severity": one of "info", "warning", "error"
- "message": one short review comment

Focus on correctness, bugs, risky behavior, or missing edge-case handling. Return an empty array when there are no meaningful findings. Do not include markdown or code fences.`,
      `Language: ${language || "javascript"}\n\nReview this file:\n${codeWithLineNumbers(code)}`,
      2048,
    );

    const parsed = parseLooseJson(raw);
    const issues = Array.isArray(parsed?.issues)
      ? parsed.issues
          .map((issue) => ({
            line:
              Number.isFinite(Number(issue?.line)) && Number(issue.line) > 0
                ? Number(issue.line)
                : 1,
            severity: ["info", "warning", "error"].includes(issue?.severity)
              ? issue.severity
              : "info",
            message: String(issue?.message || "").trim(),
          }))
          .filter((issue) => issue.message)
          .slice(0, 12)
      : [];

    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Code execution engine (Docker + fallback) ---
const Docker = require("dockerode");
const { spawn } = require("child_process");
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
    process.env.DOCKER_PLATFORM_ARCH?.trim() ||
    (process.arch === "arm64" ? "arm64" : "amd64");
  return { os: "linux", architecture };
}

const DOCKER_LINUX_PLATFORM = getDockerLinuxPlatform();
const DOCKER_PLATFORM_SPEC = `${DOCKER_LINUX_PLATFORM.os}/${DOCKER_LINUX_PLATFORM.architecture}`;

const LANG_CONFIG = {
  javascript: {
    ext: ".js",
    image: "node:20-slim",
    cmd: ["node", "/sandbox/code.js"],
    pkgMgr: "npm",
  },
  typescript: {
    ext: ".ts",
    image: "node:20-slim",
    cmd: ["node", "/sandbox/code.ts"],
    pkgMgr: "npm",
  },
  python: {
    ext: ".py",
    image: "python:3.11-slim",
    cmd: ["python", "-u", "/sandbox/code.py"],
    pkgMgr: "pip",
  },
  rust: {
    ext: ".rs",
    image: "rust:slim",
    cmd: [
      "sh",
      "-c",
      "rustc /sandbox/code.rs -o /tmp/itecify-bin && stdbuf -o0 -e0 /tmp/itecify-bin",
    ],
    pkgMgr: null,
  },
  go: {
    ext: ".go",
    image: "golang:1.21-alpine",
    cmd: ["sh", "-c", "go run /sandbox/code.go"],
    pkgMgr: null,
  },
  java: {
    ext: ".java",
    image: "openjdk:21-slim",
    cmd: [
      "sh",
      "-c",
      "javac -d /tmp /sandbox/code.java && stdbuf -o0 -e0 java -cp /tmp code",
    ],
    pkgMgr: null,
  },
  c: {
    ext: ".c",
    image: "gcc:latest",
    /* stdbuf -o0: stdout nebufferizat — prompturi fără \\n se văd înainte de scanf */
    cmd: [
      "sh",
      "-c",
      "gcc /sandbox/code.c -o /tmp/itecify-bin && stdbuf -o0 -e0 /tmp/itecify-bin",
    ],
    pkgMgr: null,
  },
};

// X4: Pre-pull all Docker images on startup so first run is instant
async function prePullImages() {
  const available = await isDockerAvailable().catch(() => false);
  if (!available) return;
  for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
    try {
      await docker.getImage(cfg.image).inspect();
    } catch {
      console.log(`[Docker] Pre-pulling ${cfg.image} for ${lang}...`);
      await new Promise((resolve) => {
        docker.pull(
          cfg.image,
          { platform: DOCKER_PLATFORM_SPEC },
          (err, stream) => {
            if (err || !stream) return resolve();
            docker.modem.followProgress(stream, () => {
              console.log(`[Docker] ${cfg.image} ready`);
              resolve();
            });
          },
        );
      });
    }
  }
}
prePullImages().catch(() => {});

function buildCmdWithPackages(config, packages) {
  if (!packages || packages.length === 0)
    return { cmd: config.cmd, network: "none" };
  const safe = packages
    .map((p) => p.replace(/[^a-zA-Z0-9@._/\-]/g, ""))
    .filter(Boolean)
    .slice(0, 10);
  if (safe.length === 0) return { cmd: config.cmd, network: "none" };

  const pkgList = safe.join(" ");
  let installCmd;
  if (config.pkgMgr === "npm") {
    const usesJest = safe.some((p) => p === "jest" || /^jest@/.test(p));
    const sandboxFile = `/sandbox/code${config.ext}`;
    const runCmd = usesJest
      ? `/tmp/pkgs/node_modules/.bin/jest ${sandboxFile} --runInBand --forceExit`
      : `NODE_PATH=/tmp/pkgs/node_modules ${config.cmd.join(" ")}`;
    installCmd = `npm install --prefix /tmp/pkgs ${pkgList} --quiet 2>&1 && ${runCmd}`;
  } else if (config.pkgMgr === "pip") {
    const runCmd = config.cmd.join(" ");
    installCmd = `pip install --quiet ${pkgList} 2>&1 && ${runCmd}`;
  } else {
    return {
      cmd: config.cmd,
      network: "none",
      warning: "Package installs not supported for this language",
    };
  }
  return { cmd: ["sh", "-c", installCmd], network: "bridge" };
}

const FALLBACK_CMD = {
  javascript: "node",
  typescript: "node",
  python: "python3",
};

const DANGEROUS_PATTERNS = {
  javascript: [
    /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
    /\beval\s*\(/,
    /\bexecSync\s*\(/,
    /\bspawnSync\s*\(/,
  ],
  typescript: [
    /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
    /\beval\s*\(/,
    /\bexecSync\s*\(/,
    /\bspawnSync\s*\(/,
  ],
  python: [
    /\bos\.system\s*\(/,
    /\bsubprocess\./,
    /\beval\s*\(/,
    /\bexec\s*\(/,
    /\b__import__\s*\(/,
  ],
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
  console.log(
    `[iTECify] Pulling Docker image ${image} (${DOCKER_PLATFORM_SPEC})...`,
  );
  await new Promise((resolve, reject) => {
    docker.pull(image, { platform: DOCKER_PLATFORM_SPEC }, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (followErr) =>
        followErr ? reject(followErr) : resolve(),
      );
    });
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

async function runInDocker(
  code,
  config,
  onData,
  stdin = "",
  packages = [],
  env = {},
) {
  await ensureDockerImage(config.image);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "itecify-"));
  const tmpFile = path.join(tmpDir, `code${config.ext}`);
  fs.writeFileSync(tmpFile, code);

  const { cmd, network, warning } = buildCmdWithPackages(config, packages);
  if (warning) onData("info", warning);

  const hasStdin = !!(stdin && stdin.trim().length > 0);

  let container;
  try {
    const envList = Object.entries(env).map(([k, v]) => `${k}=${v}`);

    container = await docker.createContainer({
      Image: config.image,
      Platform: DOCKER_PLATFORM_SPEC,
      Cmd: cmd,
      Env: envList.length ? envList : undefined,
      HostConfig: {
        Memory: 128 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 50000,
        NetworkMode: network,
        Binds: [`${tmpDir}:/sandbox:ro`],
        // AutoRemove + wait() races on Docker Desktop (404 no such container after fast exit)
        AutoRemove: false,
      },
      AttachStdin: hasStdin,
      OpenStdin: hasStdin,
      StdinOnce: hasStdin,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    const stream = await container.attach({
      stream: true,
      stdin: hasStdin,
      stdout: true,
      stderr: true,
    });

    const stdoutStream = new (require("stream").PassThrough)();
    const stderrStream = new (require("stream").PassThrough)();

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    stdoutStream.on("data", (chunk) => onData("stdout", chunk.toString()));
    stderrStream.on("data", (chunk) => onData("stderr", chunk.toString()));

    await container.start();

    if (hasStdin) {
      const payload = stdin.endsWith("\n") ? stdin : `${stdin}\n`;
      await new Promise((r) => setTimeout(r, 20));
      stream.write(payload);
      stream.end();
    }

    const result = await Promise.race([
      container.wait(),
      new Promise((_, reject) =>
        setTimeout(async () => {
          try {
            await container.kill();
          } catch {}
          reject(new Error("Execution timed out (30s limit)"));
        }, 30000),
      ),
    ]);

    return { exitCode: result.StatusCode };
  } catch (err) {
    if (err.message.includes("timed out")) {
      onData("stderr", err.message);
      return { exitCode: 1 };
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

async function runDirect(code, language, onData, stdin = "") {
  const cmd = FALLBACK_CMD[language];
  if (!cmd) throw new Error(`No fallback for ${language} — Docker required`);

  const config = LANG_CONFIG[language];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "itecify-"));
  const tmpFile = path.join(tmpDir, `code${config.ext}`);
  fs.writeFileSync(tmpFile, code);

  try {
    return await new Promise((resolve) => {
      const child = spawn(cmd, [tmpFile]);
      const timer = setTimeout(() => {
        child.kill();
        onData("stderr", "Execution timed out (10s limit)");
        resolve({ exitCode: 1 });
      }, 10000);

      child.stdout.on("data", (chunk) => onData("stdout", chunk.toString()));
      child.stderr.on("data", (chunk) => onData("stderr", chunk.toString()));

      if (stdin && stdin.trim().length > 0) {
        child.stdin.write(stdin.endsWith("\n") ? stdin : stdin + "\n");
      }
      child.stdin.end();

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1 });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        onData("stderr", err.message);
        resolve({ exitCode: 1 });
      });
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// X5: Rate limit — 20 runs/min per IP (ipKeyGenerator: IPv6-safe, see ERR_ERL_KEY_GEN_IPV6)
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const runLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many runs — max 20 per minute. Please wait." },
  keyGenerator: (req) => {
    const login = req.session?.user?.login;
    if (login) return `user:${login}`;
    return ipKeyGenerator(req.ip ?? "");
  },
});

app.post("/api/run", runLimiter, async (req, res) => {
  const {
    code,
    language,
    stdin = "",
    packages = [],
    env = {},
    roomId,
  } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

  const config = LANG_CONFIG[language];
  if (!config)
    return res.status(400).json({ error: `Unsupported language: ${language}` });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (type, text) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
    }
  };

  const warnings = scanCode(code, language);
  warnings.forEach((w) => send("stderr", w));

  try {
    const dockerAvailable = await isDockerAvailable();
    const mode = dockerAvailable ? "docker" : "direct";
    send(
      "info",
      `[${mode === "docker" ? "Docker sandbox" : "Direct execution"}]`,
    );
    if (mode === "docker") {
      send(
        "info",
        "Limite sandbox: ~128 MB RAM, CPU limitat, timeout execuție 30s.",
      );
    } else {
      send("info", "Execuție directă: timeout 10s (fără Docker).");
    }

    logStructured("run", "start", {
      roomId: String(roomId || "").slice(0, 32),
      language,
      mode,
    });

    if (dockerAvailable) {
      await runInDocker(code, config, send, stdin, packages, env);
    } else {
      if (!FALLBACK_CMD[language]) {
        send(
          "stderr",
          `${language} requires Docker — start Docker Desktop and restart the server`,
        );
        send("done", "");
        return res.end();
      }
      await runDirect(code, language, send, stdin);
    }
  } catch (err) {
    console.error("[Run Error]", err.message);
    send("stderr", `Error: ${err.message}`);
  }

  send("done", "");
  res.end();

  logStructured("run", "end", {
    roomId: String(roomId || "").slice(0, 32),
    language,
  });

  // Persist run history (fire-and-forget)
  if (roomId) {
    db.insertRunHistory({
      roomId,
      userLogin: req.session?.user?.login ?? null,
      language,
      hasError: false,
      preview: code.split("\n")[0].slice(0, 80),
    }).catch(() => {});
  }
});

// --- Project preview (Docker dev server; sesiune persistentă + sync fișiere) ---
const preview = require("./preview");
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many preview requests — try again later." },
  keyGenerator: (req) => {
    const login = req.session?.user?.login;
    if (login) return `user:${login}`;
    return ipKeyGenerator(req.ip ?? "");
  },
});

app.post("/api/preview/start", previewLimiter, async (req, res) => {
  const { roomId, files, force, nodeVersion } = req.body;
  if (!files || typeof files !== "object")
    return res.status(400).json({ error: "files (path → content) required" });

  const dockerOk = await isDockerAvailable().catch(() => false);
  if (!dockerOk) {
    return res.status(503).json({
      error:
        "Docker is required for preview — start Docker Desktop and restart the server",
    });
  }

  try {
    try {
      assertWorkspaceWithinLimit(files, "Preview");
    } catch (sizeErr) {
      const code = sizeErr.status || 413;
      logStructured("preview", "reject_size", {
        roomId: String(roomId || "").slice(0, 32),
      });
      return res.status(code).json({ error: sizeErr.message });
    }

    logStructured("preview", "start", {
      roomId: String(roomId || "").slice(0, 32),
      force: !!force,
      nodeVersion: String(nodeVersion || "").slice(0, 8),
    });

    const result = await preview.startPreview(
      roomId,
      files,
      docker,
      DOCKER_PLATFORM_SPEC,
      { force: !!force, nodeVersion },
    );
    logStructured("preview", "ready", {
      roomId: String(roomId || "").slice(0, 32),
      mode: result.mode,
      hostPort: result.hostPort,
    });
    res.json({
      ok: true,
      proxyPath: `/api/preview/proxy/${result.safeRoomId}`,
      hostPort: result.hostPort,
      mode: result.mode || "cold",
    });
  } catch (err) {
    console.error("[Preview start]", err.message);
    logStructured("preview", "error", {
      roomId: String(roomId || "").slice(0, 32),
      message: err.message,
    });
    res.status(500).json({ error: err.message || "Preview failed" });
  }
});

app.post("/api/preview/stop", async (req, res) => {
  const { roomId } = req.body || {};
  try {
    await preview.stopPreview(roomId, docker);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/preview/status", (req, res) => {
  const roomId = req.query.room || req.query.roomId;
  const safe = preview.sanitizeRoomId(roomId);
  if (!safe) return res.json({ active: false });
  const s = preview.previewSessions.get(safe);
  res.json({
    active: !!s,
    proxyPath: s ? `/api/preview/proxy/${safe}` : null,
    hostPort: s?.hostPort ?? null,
    startedAt: s?.startedAt ?? null,
  });
});

app.use("/api/preview/proxy/:roomId", preview.createPreviewProxy());

// --- GitHub OAuth ---
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
// OAuth callback must be registered in your GitHub OAuth app settings

app.get("/auth/github", (req, res) => {
  if (!GITHUB_CLIENT_ID)
    return res.status(503).send("GitHub OAuth not configured");
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: "read:user",
    redirect_uri: `${CLIENT_ORIGIN}/auth/github/callback`,
    state: req.query.room || "",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get("/auth/github/callback", async (req, res) => {
  const { code, state: roomState } = req.query;
  const roomHash = roomState ? `#${roomState}` : "";
  if (!code) return res.redirect(`${CLIENT_ORIGIN}?auth=error${roomHash}`);

  try {
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token)
      return res.redirect(`${CLIENT_ORIGIN}?auth=error`);

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "iTECify",
      },
    });
    const user = await userRes.json();

    req.session.user = {
      id: user.id,
      name: user.name || user.login,
      login: user.login,
      avatar: user.avatar_url,
      token: tokenData.access_token,
    };

    // Persist user to DB (fire-and-forget)
    db.upsertUser({
      id: user.id,
      login: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
    }).catch(() => {});

    res.redirect(`${CLIENT_ORIGIN}?auth=ok${roomHash}`);
  } catch (err) {
    console.error("[OAuth Error]", err.message);
    res.redirect(`${CLIENT_ORIGIN}?auth=error${roomHash}`);
  }
});

app.get("/auth/me", (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const { id, name, login, avatar } = req.session.user;
  res.json({ user: { id, name, login, avatar } });
});

// Return rooms the logged-in user has visited
app.get("/api/rooms/mine", async (req, res) => {
  if (!req.session.user) return res.json({ rooms: [] });
  const rooms = await db.getUserRooms(req.session.user.id);
  res.json({ rooms });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --- Google OAuth ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

app.get("/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID)
    return res.status(503).send("Google OAuth not configured");
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${CLIENT_ORIGIN}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: req.query.room || "",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, state: roomState } = req.query;
  const roomHash = roomState ? `#${roomState}` : "";
  if (!code) return res.redirect(`${CLIENT_ORIGIN}?auth=error${roomHash}`);

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${CLIENT_ORIGIN}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token)
      return res.redirect(`${CLIENT_ORIGIN}?auth=error`);

    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );
    const user = await userRes.json();

    // Use a stable numeric ID from Google's sub claim (hashed to fit BIGINT)
    const stableId = BigInt(
      "0x" + Buffer.from(user.id).toString("hex").slice(0, 15),
    );

    req.session.user = {
      id: Number(stableId),
      name: user.name,
      login: user.email.split("@")[0],
      avatar: user.picture,
      provider: "google",
    };

    db.upsertUser({
      id: Number(stableId),
      login: user.email.split("@")[0],
      name: user.name,
      avatar: user.picture,
    }).catch(() => {});

    res.redirect(`${CLIENT_ORIGIN}?auth=ok${roomHash}`);
  } catch (err) {
    console.error("[Google OAuth Error]", err.message);
    res.redirect(`${CLIENT_ORIGIN}?auth=error${roomHash}`);
  }
});

// --- Room password ---
const bcrypt = require("bcrypt");

// Check if a room has a password set
app.get("/api/room/:roomId/has-password", async (req, res) => {
  const { roomId } = req.params;
  if (!db.isEnabled()) return res.json({ hasPassword: false });
  const { data } = await db.getRoomMeta(roomId);
  res.json({ hasPassword: !!data?.password_hash });
});

// Verify room password
app.post("/api/room/:roomId/verify-password", async (req, res) => {
  const { roomId } = req.params;
  const { password } = req.body;
  if (!password)
    return res.status(400).json({ ok: false, error: "password required" });

  const { data } = await db.getRoomMeta(roomId);
  if (!data?.password_hash) return res.json({ ok: true }); // no password set

  const match = await bcrypt.compare(password, data.password_hash);
  if (!match) return res.json({ ok: false, error: "Wrong password" });

  // Store in session so they don't need to re-enter
  if (!req.session.roomAccess) req.session.roomAccess = {};
  req.session.roomAccess[roomId] = true;
  res.json({ ok: true });
});

// Set or clear room password (must be logged in)
app.post("/api/room/:roomId/set-password", async (req, res) => {
  const { roomId } = req.params;
  const { password } = req.body;
  if (!req.session.user)
    return res
      .status(401)
      .json({ error: "Login required to set room password" });

  const hash = password ? await bcrypt.hash(password, 10) : null;
  const ok = await db.setRoomPassword(roomId, hash);
  res.json({ ok });
});

// --- Explicit room save (called by client on beforeunload / before OAuth) ---
app.post("/api/room/:roomId/save", async (req, res) => {
  const { roomId } = req.params;
  const { files } = req.body; // { filename: { content, language } }
  if (!files || typeof files !== "object") return res.json({ ok: false });

  try {
    // Ensure room row exists
    await db.touchRoom(roomId);

    // Save each file directly via Supabase
    if (!db.isEnabled()) return res.json({ ok: true, skipped: true });

    const entries = Object.entries(files).map(
      ([filename, { content, language }]) => ({
        room_id: roomId,
        filename,
        language: language || "javascript",
        content: content || "",
        updated_at: new Date().toISOString(),
      }),
    );

    if (entries.length === 0) return res.json({ ok: true });

    // Save plain-text files (stamped with the logged-in user's id if available)
    const saveUserId = req.session?.user?.id ?? null;
    await db.saveRoomFiles(roomId, entries, saveUserId);

    // Also flush the server's in-memory Yjs doc → updates yjs_state in DB.
    // loadRoom prefers yjs_state, so without this the OAuth redirect would
    // load a stale snapshot and lose any edits made in the last few seconds.
    const docName = `itecify-${roomId}`;
    if (docs.has(docName)) {
      clearTimeout(saveTimers.get(docName));
      saveTimers.delete(docName);
      await db.saveRoom(roomId, docs.get(docName), saveUserId).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[Save] Error:", err.message);
    res.json({ ok: false, error: err.message });
  }
});

// --- GitHub Gist ---
app.post("/api/gist", async (req, res) => {
  const { filename, content, description } = req.body;
  if (!filename || !content)
    return res.status(400).json({ error: "filename and content required" });

  const token = req.session?.user?.token || process.env.GITHUB_TOKEN;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": "iTECify",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const response = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers,
      body: JSON.stringify({
        description: description || `iTECify — ${filename}`,
        public: true,
        files: { [filename]: { content } },
      }),
    });
    const data = await response.json();
    if (!response.ok)
      return res
        .status(response.status)
        .json({ error: data.message || "GitHub API error" });
    res.json({ url: data.html_url, id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Time-travel: Redis + snapshots (per-room lists, auto-reconnect) ---
const Redis = require("ioredis");
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisClient = null;

function isRedisUsable() {
  return redisClient !== null && redisClient.status === "ready";
}

function createRedisClient() {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 20,
    retryStrategy(times) {
      if (times > 60) return null;
      return Math.min(times * 200, 3000);
    },
    connectTimeout: 10000,
  });
  client.on("error", (err) => {
    console.error("[iTECify] Redis error:", err.message);
  });
  client.on("ready", () => {
    console.log("[iTECify] Redis connected — time-travel enabled");
  });
  return client;
}

try {
  redisClient = createRedisClient();
} catch (err) {
  console.error("[iTECify] Redis client failed:", err.message);
  redisClient = null;
}

/** List key for time-travel snapshots; null if room id is missing or invalid. */
function snapshotListKey(roomId) {
  const safe = String(roomId ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 128);
  if (!safe) return null;
  return `itecify:snapshots:${safe}`;
}

app.get("/api/snapshots", async (req, res) => {
  const key = snapshotListKey(req.query.room);
  if (!key) return res.json({ snapshots: [] });
  if (!isRedisUsable()) return res.json({ snapshots: [] });
  try {
    const raw = await redisClient.lrange(key, 0, -1);
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
  const key = snapshotListKey(req.query.room);
  if (!key)
    return res.status(400).json({ error: "room query parameter required" });
  if (!isRedisUsable())
    return res.status(503).json({ error: "Redis not available" });
  try {
    const raw = await redisClient.lrange(key, 0, -1);
    const target = parseInt(req.params.timestamp, 10);
    for (const entry of raw) {
      const parsed = JSON.parse(entry);
      if (parsed.timestamp === target) {
        return res.json({
          snapshot: parsed.snapshot,
          timestamp: parsed.timestamp,
        });
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

const termWss = new WebSocketServer({ noServer: true });

termWss.on("connection", (ws) => {
  termClients.add(ws);
  const terminal = getOrCreatePty();

  if (!terminal) {
    ws.send(
      JSON.stringify({
        type: "term:output",
        data: "[Terminal unavailable — node-pty spawn failed]\r\n",
      }),
    );
    ws.on("close", () => termClients.delete(ws));
    return;
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "term:input" && sharedPty) {
        sharedPty.write(msg.data);
      } else if (
        msg.type === "term:resize" &&
        msg.cols &&
        msg.rows &&
        sharedPty
      ) {
        sharedPty.resize(msg.cols, msg.rows);
      }
    } catch {}
  });

  ws.on("close", () => {
    termClients.delete(ws);
  });
});

const apiServer = http.createServer(app);
apiServer.on("upgrade", (req, socket, head) => {
  if (preview.handlePreviewUpgrade(req, socket, head)) return;
});
apiServer.listen(PORT, () => {
  console.log(`[iTECify] Server running on http://localhost:${PORT}`);
  console.log(`[iTECify] Yjs WS  → ws://localhost:${PORT}/yjs`);
  console.log(`[iTECify] Term WS → ws://localhost:${PORT}/term`);
});

// --- Yjs WebSocket collaboration server ---

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

const docs = new Map();
// Debounce timers for room saves: docName → timer
const saveTimers = new Map();

function scheduleRoomSave(docName, doc) {
  clearTimeout(saveTimers.get(docName));
  saveTimers.set(
    docName,
    setTimeout(async () => {
      const roomId = docName.startsWith("itecify-")
        ? docName.slice("itecify-".length)
        : docName;
      await db.saveRoom(roomId, doc, doc.lastUserId ?? null).catch(() => {});
      saveTimers.delete(docName);
    }, 3000),
  );
}

function getYDoc(docName, userId = null) {
  if (docs.has(docName)) return docs.get(docName);
  const doc = new Y.Doc();
  doc.name = docName;
  doc.conns = new Map();
  doc.awareness = { states: new Map(), meta: new Map() };
  doc.lastUserId = null; // updated whenever an authenticated user connects
  docs.set(docName, doc);

  const roomId = docName.startsWith("itecify-")
    ? docName.slice("itecify-".length)
    : docName;

  // Broadcast any update the server applies to the doc (e.g. from DB load)
  doc.on("update", (update, origin) => {
    if (origin === "db-load") {
      // Broadcast the loaded content to all already-connected clients
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      encoding.writeVarUint(encoder, SYNC_UPDATE);
      encoding.writeVarUint8Array(encoder, update);
      broadcastUpdate(doc, encoding.toUint8Array(encoder), null);
    }
  });

  // Observe chat array: persist new messages that weren't loaded from DB
  const yChat = doc.getArray("chat");
  let chatPersistedCount = 0;
  yChat.observe((_event, transaction) => {
    if (transaction.origin === "db-load") {
      // These were loaded from DB — update baseline, don't re-insert
      chatPersistedCount = yChat.length;
      return;
    }
    const all = yChat.toArray();
    const newMsgs = all.slice(chatPersistedCount);
    for (const msg of newMsgs) {
      if (msg && msg.id && msg.text) {
        db.insertChatMessage(roomId, msg).catch(() => {});
      }
    }
    chatPersistedCount = all.length;
  });

  // Load room from DB. Store the promise so SYNC_STEP1 can await it before
  // sending SYNC_STEP2 — this guarantees the client always gets the full
  // persisted content in the initial sync, without needing a page refresh.
  doc.loadRoomPromise = db.loadRoom(roomId, doc, userId)
    .then((result) => {
      if (result?.fileCount) {
        console.log(
          `[DB] Room ${roomId} loaded — ${result.fileCount} file(s), ${result.messageCount} message(s)`,
        );
        chatPersistedCount = result.messageCount ?? 0;
      }
    })
    .catch((err) => {
      console.error(`[DB] loadRoom failed for ${roomId}:`, err.message);
    });

  const snapshotKey = snapshotListKey(roomId);
  // Time-travel: snapshot every 10 seconds while doc has connections
  doc._snapshotInterval = setInterval(async () => {
    if (!snapshotKey || !isRedisUsable() || doc.conns.size === 0) return;
    try {
      const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc)).toString(
        "base64",
      );
      const entry = JSON.stringify({
        timestamp: Date.now(),
        label: new Date().toLocaleTimeString(),
        snapshot,
      });
      await redisClient.rpush(snapshotKey, entry);
      // Keep max 360 snapshots (1 hour at 10s intervals)
      await redisClient.ltrim(snapshotKey, -360, -1);
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
  encoding.writeVarUint8Array(
    outerEncoder,
    encoding.toUint8Array(innerEncoder),
  );
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
  // Resolve userId before getYDoc so the first loadRoom call receives it
  const userId = req.session?.user?.id ?? null;
  const doc = getYDoc(docName, userId);

  doc.conns.set(ws, new Set());

  // Record room membership for logged-in users (session is available via cookies on the upgrade request)
  const roomIdFromDoc = docName.startsWith("itecify-")
    ? docName.slice("itecify-".length)
    : docName;
  if (userId) {
    db.touchRoomMember(roomIdFromDoc, userId).catch(() => {});
    // Track the most recently connected authenticated user so saves carry user_id
    doc.lastUserId = userId;
  }

  ws.on("message", async (rawMsg) => {
    const message = new Uint8Array(rawMsg);
    const decoder = decoding.createDecoder(message);
    const msgType = decoding.readVarUint(decoder);

    if (msgType === MSG_SYNC) {
      const syncType = decoding.readVarUint(decoder);

      if (syncType === SYNC_STEP1) {
        // Wait for DB load to finish so SYNC_STEP2 contains the full persisted
        // state — client gets everything in the initial handshake, no refresh needed.
        await (doc.loadRoomPromise || Promise.resolve());

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
        // Save on both STEP2 (initial full sync) and UPDATE (edits)
        scheduleRoomSave(docName, doc);
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
      // Cancel any pending debounced save and flush immediately
      clearTimeout(saveTimers.get(docName));
      saveTimers.delete(docName);
      const roomIdOnClose = docName.startsWith("itecify-")
        ? docName.slice("itecify-".length)
        : docName;
      db.saveRoom(roomIdOnClose, doc, doc.lastUserId ?? null)
        .catch(() => {})
        .finally(() => {
          doc.destroy();
          docs.delete(doc.name);
        });
    }
  });

  // Send existing awareness states to the new connection
  if (doc.awareness.states.size > 0) {
    const clients = Array.from(doc.awareness.states.keys());
    const msg = encodeAwarenessUpdate(doc.awareness.states, clients);
    ws.send(msg);
  }
}

const wss = new WebSocketServer({ noServer: true });

// Unified WebSocket upgrade handler — routes /yjs/* and /term on the single HTTP port.
// This allows Railway (and any single-port host) to serve both WS connections.
apiServer.on("upgrade", (req, socket, head) => {
  const pathname = req.url.split("?")[0];
  const fakeRes = { getHeader: () => {}, setHeader: () => {}, end: () => {} };

  if (pathname.startsWith("/yjs")) {
    // Strip /yjs prefix so setupConnection sees the room name (e.g. /itecify-abc123)
    req.url = req.url.slice("/yjs".length) || "/";
    sessionMiddleware(req, fakeRes, () => {
      wss.handleUpgrade(req, socket, head, (ws) => setupConnection(ws, req));
    });
  } else if (pathname.startsWith("/term")) {
    termWss.handleUpgrade(req, socket, head, (ws) => {
      termWss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});
