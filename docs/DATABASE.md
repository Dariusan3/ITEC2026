# iTECify — Database Architecture (Supabase / PostgreSQL)

## Why a Database?

### Current state (what lives where)

| Data | Where now | Problem |
|------|-----------|---------|
| Room file contents | Yjs in-memory (RAM) | **Lost on server restart** |
| User accounts | Nowhere | GitHub OAuth user never saved |
| Chat messages | Yjs array (RAM) | Lost when all users leave |
| Run history | `localStorage` (browser) | Per-device only, not shared |
| Editor settings | `localStorage` (browser) | Per-device only |
| Sessions (auth cookies) | `express-session` in-memory | **Lost on server restart** |
| Time-travel snapshots | Redis (optional) | Lost if Redis isn't running |

### What breaks today without a DB

1. **Server restart = everyone loses their work.** All Yjs docs are in-memory. No recovery.
2. **GitHub login is ephemeral.** The session cookie is stored in memory; restart logs everyone out.
3. **Rooms don't exist between sessions.** Share a room link, come back tomorrow — it's empty.
4. **Chat history disappears** when the last user leaves the room.
5. **Run history is private** and lives only in the browser that ran the code.

### What Supabase gives us

- **Hosted PostgreSQL** — free tier covers development + small production use
- **JavaScript SDK** (`@supabase/supabase-js`) — works in Node.js
- **Row-Level Security (RLS)** — rooms are isolated at the DB level
- **Real-time subscriptions** — could optionally replace some Yjs usage for non-critical data
- **Supabase Auth** — can replace or complement our custom GitHub OAuth

---

## Architecture Decision

### What goes in the DB vs what stays in Yjs

| Concern | Layer | Reason |
|---------|-------|--------|
| Real-time cursor positions | Yjs awareness (RAM) | Too frequent to write to DB |
| Active collaborative editing | Yjs CRDT (RAM) | Conflict resolution must be local |
| **File contents (checkpoint)** | **DB** | Persist on save / disconnect |
| **User profiles** | **DB** | Stable identity across sessions |
| **Chat messages** | **DB** | Survive room inactivity |
| **Run history** | **DB** | Shared across collaborators |
| **Session store** | **DB** (connect-pg-simple) | Survive server restarts |
| Time-travel snapshots | Redis → DB migration | Redis optional, DB reliable |

### Sync strategy for file contents

```
User edits → Yjs CRDT (instant, local) → debounced 3s → save to DB
                                                          ↓
New user joins room → load from DB if Yjs doc is empty → seed Yjs doc
```

This means:
- Real-time collaboration stays fast (Yjs never touches the DB during editing)
- Work is persisted every ~3 seconds of inactivity
- Server restarts are safe — state rehydrates from DB on next connection

---

## Schema

### Migration 001 — core tables

```sql
-- 001_create_rooms.sql

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_last_active ON rooms (last_active);
```

```sql
-- 002_create_users.sql

CREATE TABLE IF NOT EXISTS users (
  id         BIGINT PRIMARY KEY,   -- GitHub user ID (stable)
  login      TEXT   NOT NULL,
  name       TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```sql
-- 003_create_files.sql

CREATE TABLE IF NOT EXISTS files (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    TEXT        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  filename   TEXT        NOT NULL,
  language   TEXT        NOT NULL DEFAULT 'javascript',
  content    TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT files_room_filename UNIQUE (room_id, filename)
);

CREATE INDEX idx_files_room ON files (room_id);
```

```sql
-- 004_create_chat_messages.sql

CREATE TABLE IF NOT EXISTS chat_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      TEXT        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  author       TEXT        NOT NULL,
  author_color TEXT        NOT NULL DEFAULT '#cba6f7',
  text         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_room ON chat_messages (room_id, created_at);
```

```sql
-- 005_create_run_history.sql

CREATE TABLE IF NOT EXISTS run_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    TEXT        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_login TEXT,
  language   TEXT        NOT NULL,
  exit_code  INTEGER,
  has_error  BOOLEAN     NOT NULL DEFAULT FALSE,
  preview    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_run_history_room ON run_history (room_id, created_at DESC);
```

```sql
-- 006_create_sessions.sql
-- For connect-pg-simple (express-session backed by Postgres)

CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR    NOT NULL COLLATE "default",
  "sess"   JSON       NOT NULL,
  "expire" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX idx_session_expire ON "session" (expire);
```

### Migration 002 — cleanup policy (optional)

```sql
-- 007_cleanup_policy.sql
-- Auto-delete rooms inactive for more than 30 days

CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM rooms WHERE last_active < NOW() - INTERVAL '30 days';
END;
$$;

-- Run via pg_cron (Supabase supports this) or a server-side cron job
-- SELECT cron.schedule('cleanup-rooms', '0 3 * * *', 'SELECT cleanup_old_rooms()');
```

---

## Row-Level Security (Supabase)

In Supabase, enable RLS on all tables and add policies:

```sql
-- Allow anyone to read/write their own room's data
-- (for now rooms are public — add auth later if needed)

ALTER TABLE rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_history   ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (tighten when auth is fully wired)
CREATE POLICY "rooms_public"         ON rooms         FOR ALL USING (true);
CREATE POLICY "files_public"         ON files         FOR ALL USING (true);
CREATE POLICY "chat_public"          ON chat_messages FOR ALL USING (true);
CREATE POLICY "run_history_public"   ON run_history   FOR ALL USING (true);
```

---

## Server Integration Plan

### New environment variables

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key   # server-side only, never expose to client
DATABASE_URL=postgresql://...                 # for connect-pg-simple
```

### Package additions

```bash
# In /server
npm install @supabase/supabase-js connect-pg-simple
```

### What changes in server/index.js

| Feature | Change |
|---------|--------|
| Session store | Replace in-memory with `connect-pg-simple` + `DATABASE_URL` |
| Room load | On Yjs room open: `SELECT * FROM files WHERE room_id = $1` → seed Yjs doc |
| Room save | Debounced `UPSERT INTO files` every 3s after last edit |
| User save | On OAuth callback: `INSERT INTO users ... ON CONFLICT DO UPDATE` |
| Chat persist | On Yjs chat array change: `INSERT INTO chat_messages` |
| Run history | After `/api/run` completes: `INSERT INTO run_history` |
| Room create | On first connection: `INSERT INTO rooms` |

### File persistence hook (pseudocode)

```js
const saveTimers = new Map()  // roomId → debounce timer

function scheduleRoomSave(roomId) {
  clearTimeout(saveTimers.get(roomId))
  saveTimers.set(roomId, setTimeout(() => saveRoom(roomId), 3000))
}

async function saveRoom(roomId) {
  const entries = []
  yFiles.forEach((meta, filename) => {
    entries.push({
      room_id: roomId,
      filename,
      language: meta.language,
      content: getYText(filename).toString(),
      updated_at: new Date().toISOString(),
    })
  })
  await supabase.from('files').upsert(entries, { onConflict: 'room_id,filename' })
  await supabase.from('rooms').upsert({ id: roomId, last_active: new Date().toISOString() })
}

async function loadRoom(roomId) {
  const { data } = await supabase.from('files').select('*').eq('room_id', roomId)
  if (!data?.length) return  // new room
  data.forEach(row => {
    yFiles.set(row.filename, { language: row.language })
    const yText = getYText(row.filename)
    if (yText.length === 0) yText.insert(0, row.content)
  })
}
```

---

## Setup Steps

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to your users
3. Copy the **Project URL** and **Service Role Key** (Settings → API)
4. Copy the **Connection String** (Settings → Database → Connection string → URI)

### 2. Run migrations

In the Supabase SQL editor (or via `psql`), run each migration file in order:

```bash
# Via psql (if you have the connection string)
psql "$DATABASE_URL" -f migrations/001_create_rooms.sql
psql "$DATABASE_URL" -f migrations/002_create_users.sql
psql "$DATABASE_URL" -f migrations/003_create_files.sql
psql "$DATABASE_URL" -f migrations/004_create_chat_messages.sql
psql "$DATABASE_URL" -f migrations/005_create_run_history.sql
psql "$DATABASE_URL" -f migrations/006_create_sessions.sql
```

Or paste them directly in the Supabase SQL editor one by one.

### 3. Update .env

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres
```

### 4. Install packages and migrate session store

```bash
cd server && npm install @supabase/supabase-js connect-pg-simple
```

---

## Migration Files Location

```
ITEC2026/
└── migrations/
    ├── 001_create_rooms.sql
    ├── 002_create_users.sql
    ├── 003_create_files.sql
    ├── 004_create_chat_messages.sql
    ├── 005_create_run_history.sql
    ├── 006_create_sessions.sql
    └── 007_cleanup_policy.sql
```

---

## What Does NOT Change

- Yjs CRDT stays as the real-time sync layer — no change to collaboration speed
- Monaco editor binding unchanged
- WebSocket server unchanged
- Docker execution unchanged
- The DB is purely an async persistence layer underneath Yjs

---

## Summary: Impact vs Effort

| Change | Impact | Effort |
|--------|--------|--------|
| Session persistence | Users stay logged in after restart | XS |
| Room persistence | Work survives server restarts | S |
| User table | Named identity across sessions | XS |
| Chat persistence | History loads when joining a room | S |
| Run history shared | All collaborators see run logs | S |
| **Total** | **Production-grade persistence** | **~1 day** |
