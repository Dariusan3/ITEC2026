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

async function ensureRoomOwnership(roomId, userId) {
  if (!enabled || !roomId || !userId) return { claimed: false, ownerUserId: null };

  await touchRoom(roomId);

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("owner_user_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) {
    console.error("[DB] ensureRoomOwnership read error:", roomError.message);
    return { claimed: false, ownerUserId: null };
  }

  if (room?.owner_user_id) {
    return { claimed: false, ownerUserId: room.owner_user_id };
  }

  const { data: updated, error: updateError } = await supabase
    .from("rooms")
    .update({ owner_user_id: userId, last_active: new Date().toISOString() })
    .eq("id", roomId)
    .is("owner_user_id", null)
    .select("owner_user_id")
    .maybeSingle();

  if (updateError) {
    console.error("[DB] ensureRoomOwnership update error:", updateError.message);
    return { claimed: false, ownerUserId: null };
  }

  if (updated?.owner_user_id === userId) {
    await supabase.from("room_members").upsert(
      {
        room_id: roomId,
        user_id: userId,
        is_admin: true,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "room_id,user_id" }
    );
    return { claimed: true, ownerUserId: userId };
  }

  return { claimed: false, ownerUserId: updated?.owner_user_id ?? null };
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

async function getRoomMemberRole(roomId, userId) {
  if (!enabled || !userId) return "member";
  const { data, error } = await supabase
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[DB] getRoomMemberRole error:", error.message);
    return "member";
  }
  return data?.role || "member";
}

async function setRoomMemberRole(roomId, userId, role) {
  if (!enabled || !userId) return false;
  const { error } = await supabase.from("room_members").upsert(
    {
      room_id: roomId,
      user_id: userId,
      role,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "room_id,user_id" },
  );
  if (error) {
    console.error("[DB] setRoomMemberRole error:", error.message);
    return false;
  }
  return true;
}

async function listRoomMembers(roomId) {
  if (!enabled) return [];
  const { data: room } = await supabase
    .from("rooms")
    .select("owner_user_id")
    .eq("id", roomId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("room_members")
    .select("user_id, role, is_admin, last_seen, users(id, login, name, avatar_url)")
    .eq("room_id", roomId)
    .order("last_seen", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[DB] listRoomMembers error:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    user_id: row.user_id,
    role: row.role || "member",
    is_admin: !!row.is_admin,
    is_owner: Number(room?.owner_user_id || 0) === Number(row.user_id),
    last_seen: row.last_seen,
    user: Array.isArray(row.users) ? row.users[0] : row.users,
  }));
}

async function roomHasTeacher(roomId) {
  if (!enabled) return false;
  const { count, error } = await supabase
    .from("room_members")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("role", "teacher");
  if (error) {
    console.error("[DB] roomHasTeacher error:", error.message);
    return false;
  }
  return Number(count || 0) > 0;
}

async function getRoomAdminState(roomId, userId) {
  if (!enabled || !userId) {
    return { isOwner: false, isAdmin: false, ownerUserId: null };
  }
  const [{ data: room }, { data: member }] = await Promise.all([
    supabase.from("rooms").select("owner_user_id").eq("id", roomId).maybeSingle(),
    supabase
      .from("room_members")
      .select("is_admin")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const ownerUserId = room?.owner_user_id ?? null;
  const isOwner = Number(ownerUserId || 0) === Number(userId);
  const isAdmin = isOwner || !!member?.is_admin;
  return { isOwner, isAdmin, ownerUserId };
}

async function setRoomMemberAdmin(roomId, userId, isAdmin) {
  if (!enabled || !userId) return false;
  const { error } = await supabase.from("room_members").upsert(
    {
      room_id: roomId,
      user_id: userId,
      is_admin: !!isAdmin,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "room_id,user_id" },
  );
  if (error) {
    console.error("[DB] setRoomMemberAdmin error:", error.message);
    return false;
  }
  return true;
}

async function transferRoomOwnership(roomId, nextOwnerUserId) {
  if (!enabled || !roomId || !nextOwnerUserId) return false;
  const now = new Date().toISOString();
  const { error: roomError } = await supabase
    .from("rooms")
    .update({ owner_user_id: nextOwnerUserId, last_active: now })
    .eq("id", roomId);
  if (roomError) {
    console.error("[DB] transferRoomOwnership room error:", roomError.message);
    return false;
  }

  const { error: memberError } = await supabase.from("room_members").upsert(
    {
      room_id: roomId,
      user_id: nextOwnerUserId,
      is_admin: true,
      last_seen: now,
    },
    { onConflict: "room_id,user_id" },
  );
  if (memberError) {
    console.error("[DB] transferRoomOwnership member error:", memberError.message);
    return false;
  }
  return true;
}

async function createRoomInvite({
  roomId,
  token,
  createdByUserId = null,
  role = "member",
  grantAdmin = false,
  expiresAt = null,
  maxUses = 1,
}) {
  if (!enabled) return null;
  const { data, error } = await supabase
    .from("room_invites")
    .insert({
      room_id: roomId,
      token,
      created_by_user_id: createdByUserId,
      role,
      grant_admin: !!grantAdmin,
      expires_at: expiresAt,
      max_uses: maxUses ?? 1,
    })
    .select("id, token, role, grant_admin, expires_at, created_at, max_uses, use_count, revoked_at")
    .single();
  if (error) {
    console.error("[DB] createRoomInvite error:", error.message);
    return null;
  }
  return data ?? null;
}

async function getRoomInviteByToken(token) {
  if (!enabled || !token) return null;
  const { data, error } = await supabase
    .from("room_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("[DB] getRoomInviteByToken error:", error.message);
    return null;
  }
  return data ?? null;
}

async function acceptRoomInvite(token, userId) {
  if (!enabled || !token || !userId) return null;
  const invite = await getRoomInviteByToken(token);
  if (!invite) return null;
  const now = new Date().toISOString();
  const isExpired = invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();
  const isRevoked = !!invite.revoked_at;
  const maxUses = Number(invite.max_uses ?? 1);
  const useCount = Number(invite.use_count ?? 0);
  if (isExpired || isRevoked || useCount >= maxUses) return null;

  const { data, error } = await supabase
    .from("room_invites")
    .update({
      accepted_by_user_id: userId,
      accepted_at: now,
      use_count: useCount + 1,
    })
    .eq("token", token)
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[DB] acceptRoomInvite error:", error.message);
    return null;
  }
  return data ?? null;
}

async function listRoomInvites(roomId, { includeUsed = false, limit = 30 } = {}) {
  if (!enabled || !roomId) return [];
  let query = supabase
    .from("room_invites")
    .select("id, token, role, grant_admin, expires_at, accepted_at, accepted_by_user_id, created_at, max_uses, use_count, revoked_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeUsed) {
    query = query.is("revoked_at", null);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[DB] listRoomInvites error:", error.message);
    return [];
  }
  const now = Date.now();
  return (data ?? []).filter((invite) => {
    if (includeUsed) return true;
    const expired =
      invite.expires_at && new Date(invite.expires_at).getTime() < now;
    const exhausted =
      Number(invite.use_count ?? 0) >= Number(invite.max_uses ?? 1);
    return !expired && !exhausted;
  });
}

async function revokeRoomInvite(roomId, inviteId, actorUserId = null) {
  if (!enabled || !roomId || !inviteId) return false;
  const { error } = await supabase
    .from("room_invites")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: actorUserId,
    })
    .eq("room_id", roomId)
    .eq("id", inviteId)
    .is("revoked_at", null);
  if (error) {
    console.error("[DB] revokeRoomInvite error:", error.message);
    return false;
  }
  return true;
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

// ─── Interview sessions ───────────────────────────────────────────────────────

async function createInterviewSession(roomId, title, startedBy) {
  if (!enabled) return null;
  const { data, error } = await supabase
    .from("interview_sessions")
    .insert({ room_id: roomId, title: title || null, started_by: startedBy || null })
    .select("id, room_id, title, started_by, started_at")
    .single();
  if (error) { console.error("[DB] createInterviewSession error:", error.message); return null; }
  return data ?? null;
}

async function stopInterviewSession(sessionId, { participants, notes, yjsSnapshot, replayTimeline } = {}) {
  if (!enabled) return false;
  const { error } = await supabase
    .from("interview_sessions")
    .update({
      ended_at: new Date().toISOString(),
      participants: participants || [],
      notes: notes || null,
      yjs_snapshot: yjsSnapshot || null,
      replay_timeline: replayTimeline || [],
    })
    .eq("id", sessionId);
  if (error) { console.error("[DB] stopInterviewSession error:", error.message); return false; }
  return true;
}

async function getInterviewSession(sessionId) {
  if (!enabled) return null;
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error) return null;
  return data;
}

async function listRoomInterviewSessions(roomId) {
  if (!enabled) return [];
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("id, title, started_by, started_at, ended_at, participants")
    .eq("room_id", roomId)
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) { console.error("[DB] listRoomInterviewSessions error:", error.message); return []; }
  return data ?? [];
}

// ─── Room audit log ──────────────────────────────────────────────────────────

async function insertRoomAuditLog({
  roomId,
  actorUserId = null,
  actorLogin = null,
  action,
  targetUserId = null,
  metadata = {},
}) {
  if (!enabled || !roomId || !action) return false;
  const { error } = await supabase.from("room_audit_log").insert({
    room_id: roomId,
    actor_user_id: actorUserId,
    actor_login: actorLogin,
    action,
    target_user_id: targetUserId,
    metadata,
  });
  if (error) {
    console.error("[DB] insertRoomAuditLog error:", error.message);
    return false;
  }
  return true;
}

async function listRoomAuditLog(roomId, limit = 30) {
  if (!enabled) return [];
  const { data, error } = await supabase
    .from("room_audit_log")
    .select("id, action, actor_user_id, actor_login, target_user_id, metadata, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[DB] listRoomAuditLog error:", error.message);
    return [];
  }
  return data ?? [];
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
  ensureRoomOwnership,
  getUserRooms,
  getRoomMemberRole,
  setRoomMemberRole,
  listRoomMembers,
  roomHasTeacher,
  getRoomAdminState,
  setRoomMemberAdmin,
  transferRoomOwnership,
  createRoomInvite,
  getRoomInviteByToken,
  acceptRoomInvite,
  listRoomInvites,
  revokeRoomInvite,
  insertChatMessage,
  insertRunHistory,
  saveRoomFiles,
  getRoomMeta,
  setRoomPassword,
  createInterviewSession,
  stopInterviewSession,
  getInterviewSession,
  listRoomInterviewSessions,
  insertRoomAuditLog,
  listRoomAuditLog,
  ping,
};
