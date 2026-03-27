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

// --- Code execution endpoint ---
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LANG_CONFIG = {
  javascript: { ext: ".js", cmd: "node" },
  typescript: { ext: ".ts", cmd: "node" },
  python: { ext: ".py", cmd: "python3" },
};

const DANGEROUS_PATTERNS = {
  javascript: [/\brequire\s*\(\s*['"]child_process['"]\s*\)/, /\beval\s*\(/, /\bexecSync\s*\(/, /\bspawnSync\s*\(/],
  typescript: [/\brequire\s*\(\s*['"]child_process['"]\s*\)/, /\beval\s*\(/, /\bexecSync\s*\(/, /\bspawnSync\s*\(/],
  python: [/\bos\.system\s*\(/, /\bsubprocess\./, /\beval\s*\(/, /\bexec\s*\(/, /\b__import__\s*\(/],
};

app.post("/api/run", async (req, res) => {
  const { code, language } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

  const config = LANG_CONFIG[language];
  if (!config) return res.status(400).json({ error: `Unsupported language: ${language}` });

  // Safety scan
  const patterns = DANGEROUS_PATTERNS[language] || [];
  const warnings = [];
  for (const pattern of patterns) {
    if (pattern.test(code)) {
      warnings.push(`Warning: potentially dangerous pattern detected: ${pattern.source}`);
    }
  }

  // Write code to temp file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "itecify-"));
  const tmpFile = path.join(tmpDir, `code${config.ext}`);
  fs.writeFileSync(tmpFile, code);

  try {
    const result = await new Promise((resolve) => {
      execFile(config.cmd, [tmpFile], { timeout: 10000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        if (err && err.killed) {
          resolve({ stdout, stderr, error: "Execution timed out (10s limit)" });
        } else if (err) {
          resolve({ stdout, stderr: stderr || err.message });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    const warningText = warnings.length > 0 ? warnings.join("\n") + "\n" : "";
    res.json({
      stdout: result.stdout,
      stderr: warningText + (result.stderr || ""),
      error: result.error,
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

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
wss.on("connection", setupConnection);
console.log(
  `[iTECify] Yjs WebSocket server running on ws://localhost:${WS_PORT}`,
);
