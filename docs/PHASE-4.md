# Phase 4 -- Side Quests

**Status:** Planned
**Scope:** Advanced features -- shared terminal, time-travel replay, and resource limits.

## Features

### 1. Shared Terminal
- Uses `node-pty` to spawn a real shell session on the server
- Terminal I/O broadcast to all connected users via WebSocket
- Rendered with `xterm.js` in the bottom panel
- Any user can type commands; all users see the output

### 2. Time-Travel Replay
- Every 10 seconds, a Yjs snapshot is taken and stored in Redis
- Each snapshot tagged with a timestamp
- UI: timeline slider at the top or bottom of the editor
- Dragging the slider replays the document state at that point in time
- Read-only mode during replay; click "Back to live" to resume editing

### 3. Resource Limits
- All Docker containers run with enforced limits:
  - `--memory=128m` (128 MB RAM cap)
  - `--cpus=0.5` (half a CPU core)
  - `--network=none` (no internet access from sandbox)
- Prevents resource abuse and runaway processes
- Configurable per language or per user tier

## How to Test

1. **Shared terminal:** Open two tabs, type a command in one, see it in both
2. **Time-travel:** Edit code for a minute, drag the slider back to see previous states
3. **Resource limits:** Run a memory-hungry script, see it get killed at 128 MB
