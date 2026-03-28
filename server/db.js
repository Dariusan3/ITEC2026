/**
 * db.js — Supabase persistence layer for iTECify
 *
 * All functions are no-ops when SUPABASE_URL / SUPABASE_SERVICE_KEY are absent,
 * so the app works without a DB configured (dev / demo mode).
 */

const { createClient } = require("@supabase/supabase-js");

let supabase = null;
let enabled = false;

function init() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.log("[iTECify] Supabase not configured — persistence disabled (set SUPABASE_URL + SUPABASE_SERVICE_KEY)");
    return;
  }

  supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  enabled = true;
  console.log("[iTECify] Supabase connected — persistence enabled");
}

function isEnabled() {
  return enabled;
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

async function touchRoom(roomId) {
  if (!enabled) return;
  await supabase
    .from("rooms")
    .upsert({ id: roomId, last_active: new Date().toISOString() }, { onConflict: "id" });
}

// ─── Room Load ────────────────────────────────────────────────────────────────
// Called once when a Yjs doc is first created on the server.
// Seeds the doc with persisted file content + chat history.
// Uses transact origin "db-load" so Yjs observers can skip these inserts.

async function loadRoom(roomId, doc) {
  if (!enabled) return null;

  // Ensure room row exists
  await supabase
    .from("rooms")
    .upsert({ id: roomId }, { onConflict: "id", ignoreDuplicates: true });

  // Load files
  const { data: files, error: filesErr } = await supabase
    .from("files")
    .select("filename, language, content")
    .eq("room_id", roomId);

  if (filesErr) {
    console.error(`[DB] loadRoom files error for ${roomId}:`, filesErr.message);
    return null;
  }

  if (files?.length) {
    doc.transact(() => {
      const yFiles = doc.getMap("files");
      files.forEach((row) => {
        if (!yFiles.has(row.filename)) {
          yFiles.set(row.filename, { language: row.language });
        }
        const yText = doc.getText(`file:${row.filename}`);
        if (yText.length === 0 && row.content) {
          yText.insert(0, row.content);
        }
      });
    }, "db-load");
  }

  // Load last 100 chat messages
  const { data: messages, error: chatErr } = await supabase
    .from("chat_messages")
    .select("id, author, author_color, text, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (chatErr) {
    console.error(`[DB] loadRoom chat error for ${roomId}:`, chatErr.message);
  }

  if (messages?.length) {
    doc.transact(() => {
      const yChat = doc.getArray("chat");
      if (yChat.length === 0) {
        yChat.insert(
          0,
          messages.map((m) => ({
            id: m.id,
            author: m.author,
            color: m.author_color,
            text: m.text,
            time: new Date(m.created_at).getTime(),
          }))
        );
      }
    }, "db-load");
  }

  return { fileCount: files?.length ?? 0, messageCount: messages?.length ?? 0 };
}

// ─── Room Save ────────────────────────────────────────────────────────────────
// Upserts all files in the Yjs doc to the DB.
// Called on a debounced schedule (3 s after last update) and on doc destroy.

async function saveRoom(roomId, doc) {
  if (!enabled) return;

  const yFiles = doc.getMap("files");
  if (yFiles.size === 0) return;

  const entries = [];
  yFiles.forEach((meta, filename) => {
    const yText = doc.getText(`file:${filename}`);
    entries.push({
      room_id: roomId,
      filename,
      language: meta?.language ?? "javascript",
      content: yText.toString(),
      updated_at: new Date().toISOString(),
    });
  });

  const { error } = await supabase
    .from("files")
    .upsert(entries, { onConflict: "room_id,filename" });

  if (error) {
    console.error(`[DB] saveRoom error for ${roomId}:`, error.message);
    return;
  }

  await supabase
    .from("rooms")
    .update({ last_active: new Date().toISOString() })
    .eq("id", roomId);
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function upsertUser(user) {
  if (!enabled) return;
  const { error } = await supabase.from("users").upsert(
    {
      id: user.id,
      login: user.login,
      name: user.name ?? user.login,
      avatar_url: user.avatar ?? null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) console.error("[DB] upsertUser error:", error.message);
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

async function insertChatMessage(roomId, msg) {
  if (!enabled) return;
  const { error } = await supabase.from("chat_messages").insert({
    id: msg.id,
    room_id: roomId,
    author: msg.author,
    author_color: msg.color ?? "#cba6f7",
    text: msg.text,
    created_at: msg.time ? new Date(msg.time).toISOString() : new Date().toISOString(),
  });
  if (error && error.code !== "23505") {
    // 23505 = duplicate key; safe to ignore (message already persisted)
    console.error("[DB] insertChatMessage error:", error.message);
  }
}

// ─── Run History ──────────────────────────────────────────────────────────────

async function insertRunHistory({ roomId, userLogin, language, hasError, preview }) {
  if (!enabled) return;
  const { error } = await supabase.from("run_history").insert({
    room_id: roomId,
    user_login: userLogin ?? null,
    language,
    has_error: hasError,
    preview: preview ? preview.slice(0, 120) : null,
  });
  if (error) console.error("[DB] insertRunHistory error:", error.message);
}

// ─── Client-driven save ───────────────────────────────────────────────────────
// Called from the /api/room/:id/save endpoint with explicit file contents from the client.

async function saveRoomFiles(roomId, entries) {
  if (!enabled || !entries.length) return;
  const { error } = await supabase
    .from("files")
    .upsert(entries, { onConflict: "room_id,filename" });
  if (error) console.error(`[DB] saveRoomFiles error for ${roomId}:`, error.message);
  else {
    await supabase.from("rooms").update({ last_active: new Date().toISOString() }).eq("id", roomId);
  }
}

// ─── Room members ─────────────────────────────────────────────────────────────

async function touchRoomMember(roomId, userId) {
  if (!enabled || !userId) return;
  await supabase.from("room_members").upsert(
    { room_id: roomId, user_id: userId, last_seen: new Date().toISOString() },
    { onConflict: "room_id,user_id" }
  );
}

async function getUserRooms(userId) {
  if (!enabled) return [];
  const { data, error } = await supabase
    .from("room_members")
    .select("room_id, last_seen, rooms(last_active)")
    .eq("user_id", userId)
    .order("last_seen", { ascending: false })
    .limit(20);
  if (error) { console.error("[DB] getUserRooms error:", error.message); return []; }
  return data ?? [];
}

// ─── Room password ────────────────────────────────────────────────────────────

async function getRoomMeta(roomId) {
  if (!enabled) return { data: null };
  const { data, error } = await supabase
    .from("rooms")
    .select("id, password_hash")
    .eq("id", roomId)
    .maybeSingle();
  if (error) console.error("[DB] getRoomMeta error:", error.message);
  return { data };
}

async function setRoomPassword(roomId, hash) {
  if (!enabled) return false;
  // Ensure room row exists first
  await supabase.from("rooms").upsert({ id: roomId }, { onConflict: "id", ignoreDuplicates: true });
  const { error } = await supabase
    .from("rooms")
    .update({ password_hash: hash })
    .eq("id", roomId);
  if (error) { console.error("[DB] setRoomPassword error:", error.message); return false; }
  return true;
}

// ─── Status ───────────────────────────────────────────────────────────────────

async function ping() {
  if (!enabled) return false;
  const { error } = await supabase.from("rooms").select("id").limit(1);
  return !error;
}

module.exports = {
  init,
  isEnabled,
  touchRoom,
  loadRoom,
  saveRoom,
  upsertUser,
  touchRoomMember,
  getUserRooms,
  insertChatMessage,
  insertRunHistory,
  saveRoomFiles,
  getRoomMeta,
  setRoomPassword,
  ping,
};
