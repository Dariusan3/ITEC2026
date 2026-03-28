/**
 * db.js — Supabase persistence layer for iTECify
 *
 * All functions are no-ops when SUPABASE_URL / SUPABASE_SERVICE_KEY are absent,
 * so the app works without a DB configured (dev / demo mode).
 */

const { createClient } = require("@supabase/supabase-js");
const Y = require("yjs");

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

async function loadRoom(roomId, doc, userId = null) {
  if (!enabled) return null;

  // Ensure room row exists
  await supabase
    .from("rooms")
    .upsert({ id: roomId }, { onConflict: "id", ignoreDuplicates: true });

  // Load Yjs binary state — idempotent, no CRDT duplication
  const { data: room } = await supabase
    .from("rooms")
    .select("yjs_state")
    .eq("id", roomId)
    .maybeSingle();

  if (room?.yjs_state) {
    try {
      const update = Buffer.from(room.yjs_state, "base64");
      Y.applyUpdate(doc, update, "db-load");
      console.log(`[DB] Room ${roomId} loaded from Yjs binary state`);

      // Count for logging
      const yFiles = doc.getMap("files");
      const yChat = doc.getArray("chat");
      return { fileCount: yFiles.size, messageCount: yChat.length };
    } catch (err) {
      console.error(`[DB] loadRoom yjs_state error for ${roomId}:`, err.message);
    }
  }

  // Fallback: load from files table (legacy rooms saved before yjs_state column).
  // Prefer the authenticated user's own rows; fall back to anonymous rows if none found.
  let filesQuery = supabase.from("files").select("filename, language, content").eq("room_id", roomId);
  if (userId != null) filesQuery = filesQuery.eq("user_id", userId);
  else filesQuery = filesQuery.is("user_id", null);

  let { data: files, error: filesErr } = await filesQuery;

  // If no user-specific rows, widen the search to any row for this room
  if (!filesErr && (!files || files.length === 0) && userId != null) {
    ({ data: files, error: filesErr } = await supabase
      .from("files").select("filename, language, content").eq("room_id", roomId));
  }

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

    // Promote to binary yjs_state so future loads skip this non-idempotent path
    // (prevents content duplication when client IDB and server both have the same text)
    const yjsState = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
    supabase.from("rooms").upsert(
      { id: roomId, yjs_state: yjsState, last_active: new Date().toISOString() },
      { onConflict: "id" }
    ).then(({ error }) => {
      if (error) console.error(`[DB] loadRoom promote yjs_state error for ${roomId}:`, error.message);
      else console.log(`[DB] Room ${roomId} promoted from files table to yjs_state`);
    });
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
        yChat.insert(0, messages.map((m) => ({
          id: m.id, author: m.author, color: m.author_color,
          text: m.text, time: new Date(m.created_at).getTime(),
        })));
      }
    }, "db-load");
  }

  return { fileCount: files?.length ?? 0, messageCount: messages?.length ?? 0 };
}

// ─── Room Save ────────────────────────────────────────────────────────────────
// Upserts all files in the Yjs doc to the DB.
// Called on a debounced schedule (3 s after last update) and on doc destroy.

async function saveRoom(roomId, doc, userId = null) {
  if (!enabled) return;

  const yFiles = doc.getMap("files");
  if (yFiles.size === 0) {
    console.log(`[DB] saveRoom skipped for ${roomId} — yFiles empty (doc not yet synced)`);
    return;
  }

  // Don't overwrite good data with an empty doc (timing guard)
  const entries = [];
  yFiles.forEach((meta, filename) => {
    const content = doc.getText(`file:${filename}`).toString();
    entries.push({
      room_id: roomId,
      filename,
      language: meta?.language ?? "javascript",
      content,
      updated_at: new Date().toISOString(),
      user_id: userId ?? null,  // must always be present so ON CONFLICT can resolve it
    });
  });

  const hasContent = entries.some(e => e.content.length > 0);
  if (!hasContent) {
    console.log(`[DB] saveRoom skipped for ${roomId} — all files empty`);
    return;
  }

  // Save binary Yjs state — CRDT-safe, no duplication on load
  const yjsState = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");

  // Ensure room row exists first, then upsert yjs_state (never use update — it silently fails if row missing)
  await supabase.from("rooms").upsert(
    { id: roomId, yjs_state: yjsState, last_active: new Date().toISOString() },
    { onConflict: "id" }
  ).then(({ error }) => {
    if (error) console.error(`[DB] saveRoom rooms upsert error for ${roomId}:`, error.message);
  });

  // files_uniq_room_file_user: UNIQUE(room_id, filename, user_id) NULLS NOT DISTINCT
  // Works for both authenticated (user_id = id) and anonymous (user_id = NULL) rows.
  const { error: filesError } = await supabase
    .from("files")
    .upsert(entries, { onConflict: "room_id,filename,user_id" });

  if (filesError) console.error(`[DB] saveRoom files error for ${roomId}:`, filesError.message);
  else console.log(`[DB] Saved room ${roomId} — ${entries.length} file(s), ${entries.reduce((s, e) => s + e.content.length, 0)} chars (user_id=${userId ?? "anon"})`);
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

async function saveRoomFiles(roomId, entries, userId = null) {
  if (!enabled || !entries.length) return;
  // Always stamp user_id (even as null) so ON CONFLICT (room_id,filename,user_id) resolves correctly
  const stamped = entries.map(e => ({ ...e, user_id: userId ?? null }));
  const { error } = await supabase
    .from("files")
    .upsert(stamped, { onConflict: "room_id,filename,user_id" });
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
