# iTECify — Feature Implementation Tracker

## Status legend
- ✅ Fully implemented (server + client)
- 🟡 Partially implemented (server only or client only)
- ❌ Not yet started

---

## Feature 1 — Persistent Rooms (Supabase) ✅

### What's done
- **`server/db.js`** — full persistence layer: `loadRoom`, `saveRoom`, `saveRoomFiles`, `touchRoom`, `upsertUser`, `insertChatMessage`, `insertRunHistory`, `getUserRooms`, `getRoomMeta`, `setRoomPassword`, `touchRoomMember`
- **`server/index.js`** — Yjs docs saved on 3 s debounce + on client `beforeunload` via `POST /api/room/:id/save`
- **`client/src/lib/saveRoom.js`** — calls `/api/room/:id/save` with current file contents
- **`migrations/008_rooms_extra_columns.sql`** — adds `yjs_state`, `password_hash` columns
- **`migrations/009_files_user_id.sql`** — adds `user_id` column + unique constraint
- **`migrations/010_room_members.sql`** — `room_members` table for per-user room history
- Room loads from Yjs binary snapshot (`yjs_state`), falls back to `files` table for legacy rooms
- Room chat (`chat_messages` table) loaded on first join, persisted as new messages arrive
- Recent rooms shown on LandingPage for logged-in users

### How to test
1. Open a room, type some code
2. Reload the page → code should still be there (IndexedDB + Supabase)
3. Open the same room URL in an incognito window → same content syncs via WebSocket + DB

---

## Feature 2 — Embeddable Widget ✅

### What's done
- **`client/src/components/EmbedApp.jsx`** — renders the full App inside an iframe-friendly wrapper
- **`client/src/main.jsx`** — detects `?embed` query param and renders `<EmbedApp>` instead of the full shell
- **`client/src/main.jsx`** — detects `?replay=<sessionId>` and renders `<ReplayApp>`

### How to embed
```html
<iframe
  src="https://your-domain.com/?embed#your-room-id"
  width="800"
  height="600"
  allow="clipboard-write"
></iframe>
```

### How to test
1. Open a room: `http://localhost:5173/#myroom`
2. Add `?embed` to get: `http://localhost:5173/?embed#myroom`
3. The full editor loads without the landing page chrome

---

## Feature 3 — Interview Mode ✅

### What's done

**Server (`server/index.js` + `server/db.js`)**
- `POST /api/interview/start` — creates `interview_sessions` row, requires login + room permission
- `POST /api/interview/stop` — captures live Yjs binary snapshot + Redis time-travel checkpoints between `started_at` and `ended_at`, stores `replay_timeline` JSON
- `GET /api/interview/room/:roomId` — list sessions for a room
- `GET /api/interview/:sessionId` — fetch single session with snapshot
- `db.createInterviewSession`, `db.stopInterviewSession`, `db.getInterviewSession`, `db.listRoomInterviewSessions`
- Audit trail entries logged for `interview.started` / `interview.stopped`

**Client (`client/src/components/Sidebar.jsx`)**
- **Interview tab** in Sidebar with:
  - Optional session title input
  - Start Recording / Stop & Save buttons
  - Live REC indicator while recording
  - Past sessions list with date, participant count, and "View Replay →" link

**Replay (`client/src/components/ReplayApp.jsx`)**
- `GET /?replay=<sessionId>` renders the replay viewer
- Loads Yjs snapshot from session, shows files at that point in time

**DB (`migrations/011_interview_sessions.sql`)**
```sql
CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT REFERENCES rooms(id),
  started_by TEXT, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
  participants TEXT[], title TEXT, notes TEXT,
  yjs_snapshot TEXT, replay_timeline JSONB,
  is_public BOOLEAN DEFAULT TRUE
);
```

### How to test
1. Login via GitHub/Google
2. Open a room and go to **Sidebar → Interview tab**
3. Enter a title → click **Start Recording**
4. Make some edits, add collaborators
5. Click **Stop & Save**
6. Session appears in "Past Sessions" list
7. Click **View Replay →** to open the snapshot viewer

---

## Feature 4 — Educational Orgs (Teacher/Student Roles) ✅

### What's done

**Server (`server/index.js` + `server/db.js`)**
- Role-based invite system: `POST /api/room/:roomId/invites` with `role: "teacher"|"student"|"member"`
- `GET /api/room/:roomId/member-role` — returns the logged-in user's role in the room
- Room ownership transfer: `POST /api/room/:roomId/transfer-owner`
- Room admin promotion: role-based permission checks throughout
- `db.getRoomMemberRole`, `db.getRoomAdminState`, `db.createRoomInvite`, `db.transferRoomOwnership`

**Client (`client/src/components/Sidebar.jsx` → Who's Here tab)**
- **Role badge** — shows current user's server-assigned role (member / teacher / student)
- **Teacher controls** (visible only when `roomRole === "teacher"`):
  - **Broadcast Message** — sets `awareness.org.broadcast` field, shown as banner to all users
  - **Lock Room** — sets `awareness.org.locked = true`, makes editor read-only for all students
- **Student view** — when room is locked, shows "editing disabled by teacher" message

**Client (`client/src/App.jsx`)**
- `classState` computed from any teacher's awareness `org` field
- `effectiveClassLock = classState.locked && roomRole !== "teacher" && !viewOnly`
- Banner shown when teacher broadcasts a message or locks the room

### How to test (requires Supabase DB)
1. Login as user A, open a room
2. Create a teacher invite: `POST /api/room/:roomId/invites` with `{ role: "teacher" }`
3. Use the invite link to join as user B → B gets teacher role
4. In Sidebar → Who's Here, user B sees teacher controls
5. Click **Lock Room** → all students see read-only mode
6. Click **Broadcast Message** → message banner appears for all users
7. Unlock → editing resumes

### How to test (no DB, demo mode)
- Set role manually in App.jsx `handleRoleChange` (teacher controls appear in TopBar)
- Or set `roomRole` state directly in dev tools

---

## Feature 5 — Real React/Multi-file App Execution 🟡

### What's done
- **Docker preview**: `POST /api/preview/start` spins up a Vite dev server in Docker for multi-file projects
- Supports React, Vue, plain HTML, Node.js full-stack projects
- `GET /api/preview/proxy/:roomId` reverse-proxies the container
- Auto-sync file changes to the running container
- Pre-built Vite demo template available via **Preview → Vite Demo** button

### What's missing
- No in-browser terminal for running arbitrary CLI commands against the project
- Preview only supports Node.js-based projects (no Django, Rails, etc.)

---

## Feature 6 — AI Persistence 🟡

### Current state
- **AI sidebar messages** (Ask AI, Explain, Fix, Tests, Review) are stored in React `useState` — **lost on page reload**
- **Room chat** (Chat tab) IS persisted via `chat_messages` table in Supabase

### What's needed to persist AI history
- Store AI conversation per room in a Supabase table (e.g. `ai_messages`)
- Load on room join, save on new message
- Or: use `ydoc.getArray("ai_chat")` so AI history syncs to all room members in real time

---

## Planned / Not Started

| Feature | Notes |
|---|---|
| Org management dashboard | Create org, invite members, manage rooms |
| SSO / SAML for orgs | Enterprise login |
| AI-powered code review during interview | Auto-score candidates |
| Real-time whiteboard | Canvas-based collaborative drawing tab |
