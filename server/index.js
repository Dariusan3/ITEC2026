const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });

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
