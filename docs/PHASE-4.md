# Phase 4 -- Side Quests

**Status:** Done
**Scope:** Advanced features -- shared terminal, time-travel replay, and resource limits.

## Features Implemented

### 1. Shared Terminal
- Server spawns a real shell session via `node-pty` (zsh/bash)
- Dedicated WebSocket server on port `1235` for terminal I/O
- All connected users share the same shell — any user can type, all see output
- Client renders with `@xterm/xterm` using Catppuccin color theme
- Auto-resizes to fit the panel via `@xterm/addon-fit`
- Bottom panel has tabs: **Output** (code execution results) and **Terminal** (shared shell)

### 2. Time-Travel Replay
- Server takes a Yjs snapshot every 10 seconds while clients are connected
- Snapshots stored in Redis as base64-encoded Yjs state updates
- Max 360 snapshots retained (1 hour of history)
- **API endpoints:**
  - `GET /api/snapshots` — list all snapshots with timestamps
  - `GET /api/snapshots/:timestamp` — fetch a specific snapshot
- **Timeline slider** sits between the top bar and the editor
  - Drag to any point in time to see the code at that moment
  - Editor switches to read-only during replay
  - "Back to Live" button restores live editing
  - Snapshot list refreshes every 15 seconds
- Gracefully disabled when Redis is not running

### 3. Resource Limits (from Phase 3)
- Already enforced on Docker containers:
  - `--memory=128m`, `--cpus=0.5`, `--network=none`

## Files Created/Modified

| File | Purpose |
|------|---------|
| `client/src/components/Terminal.jsx` | xterm.js terminal connected to shared pty |
| `client/src/components/TimeTravel.jsx` | Timeline slider for snapshot replay |
| `client/src/components/OutputPanel.jsx` | Added tab switching (Output / Terminal) |
| `client/src/App.jsx` | Added TimeTravel component above editor |
| `server/index.js` | Added node-pty (port 1235), Redis snapshots, snapshot API |
| `server/package.json` | Added `node-pty`, `ioredis` |
| `client/package.json` | Added `@xterm/xterm`, `@xterm/addon-fit` |

## How to Test

### Shared terminal:
1. Start the server (`npm run dev` in /server)
2. Open http://localhost:5173 in two browser tabs
3. Click the **Terminal** tab in the bottom panel
4. Type a command (e.g., `ls`) in one tab — see it appear in both

### Time-travel (requires Redis):
1. Start Redis: `redis-server` or via Docker: `docker run -p 6379:6379 redis`
2. Restart the server — look for `[iTECify] Redis connected — time-travel enabled`
3. Edit code for a minute (snapshots save every 10s)
4. Drag the timeline slider left to replay past states
5. Click "Back to Live" to resume editing
