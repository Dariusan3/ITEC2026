# Phase 5 — Polish, UX & Collaboration

**Status:** Done
**Scope:** Production-grade UX improvements, full collaboration suite, execution upgrades, and auth.

---

## Features Implemented

### 1. Live Output Streaming
- `/api/run` now responds with **Server-Sent Events (SSE)** instead of waiting for full completion
- Docker stdout/stderr chunks are forwarded to the client in real-time as they arrive
- Direct (fallback) execution uses `spawn` with streaming pipes instead of `execFile`
- Client reads `response.body.getReader()` and appends lines to the output panel incrementally
- Long-running programs show output line-by-line — no more waiting for the process to finish

### 2. Stdin Input Support
- "stdin" toggle button in the Output panel reveals a textarea
- Users type input before hitting Run — each line becomes one line of stdin
- For **Docker**: container created with `AttachStdin/OpenStdin/StdinOnce: true`, input written to the attach stream
- For **direct**: piped to `child.stdin` via `spawn`
- Trailing newline is appended automatically

### 3. Custom Package Installs (npm / pip)
- Packages field appears alongside stdin in the Output panel (space or comma separated)
- On Docker runs, a shell install step is prepended before the user's code runs:
  - **npm** (JS/TS): `npm install --prefix /tmp/pkgs PKG && NODE_PATH=/tmp/pkgs/node_modules node ...`
  - **pip** (Python): `pip install --quiet PKG && python ...`
- Network mode switches from `"none"` to `"bridge"` **only** when packages are specified
- Package names are sanitized (alphanumeric + safe chars, max 10 packages)
- Not supported for Rust (shown as info message)

### 4. Save to GitHub Gist
- **"↗ Gist"** button in TopBar saves the current file as a public GitHub Gist
- `POST /api/gist` on the server calls the GitHub Gist API
- Opens the created Gist URL in a new tab automatically
- If the user is logged in via OAuth, the Gist is attributed to their account
- If `GITHUB_TOKEN` is set in `.env`, that is used for anonymous-but-attributed saves
- Button cycles through states: idle → saving (`...`) → done (`✓ Gist`) / error (`✗ Failed`)

### 5. GitHub OAuth Login
- **"Login with GitHub"** button in TopBar when not authenticated
- Full server-side OAuth flow: `/auth/github` → GitHub authorize → `/auth/github/callback` → session cookie
- After login: GitHub name + avatar replace the random `SwiftFox` name in the UI and Yjs awareness (so collaborators see your real name and cursor label)
- `express-session` used for server-side sessions (cookie-based, 7-day expiry)
- `POST /auth/logout` clears the session
- `GET /auth/me` returns the current session user for the frontend

### 6. Multi-file Support
- File Explorer sidebar with full CRUD: create, rename, delete files
- Each file gets its own Yjs Text object (`file:${filename}` key) — independent CRDT sync per file
- Monaco creates a per-file model with a unique URI (`file:///filename`) — undo history preserved per file
- Language auto-detected from file extension
- Right-click context menu for Rename / Delete
- Prevents deleting the last file

### 7. Prettier Auto-format
- Registered as a Monaco action on `Shift+Alt+F`
- Uses Prettier standalone (browser build) with plugins: babel, estree, typescript, postcss, html
- Parser auto-selected based on file extension
- Formats in-place without a round-trip to the server

### 8. Reconnection UI (`ConnectionBanner`)
- Listens to `wsProvider` status events
- Shows a yellow "Reconnecting..." banner or red "Disconnected" banner when the Yjs WebSocket drops
- Automatically disappears when reconnected — zero UI when connected

### 9. Rooms & Session Isolation
- Room ID derived from URL hash (`#roomId`)
- If no hash is present, a random room ID is generated and set
- Share button copies the full URL (including hash) to clipboard
- Each room has a fully isolated Yjs document

### 10. Chat Sidebar
- Shared chat in the sidebar using `ydoc.getArray('chat')` — messages sync in real-time via CRDT
- Messages include: author name, color, text, timestamp
- Enter key to send; auto-scrolls to latest

### 11. Presence — "Who's Here" Tab
- Lists all connected users from `wsProvider.awareness` with colored avatar initials
- De-duplicated by name (prevents StrictMode double-mount phantoms)
- Updates live as users join/leave

---

## Files Created/Modified

| File | Change |
|------|--------|
| `server/index.js` | SSE streaming run, stdin piping, package installs, Gist API, GitHub OAuth routes, express-session |
| `server/package.json` | Added `express-session`; `postinstall` chmod for node-pty spawn-helper |
| `client/src/App.jsx` | stdin + packages state, SSE stream reader in handleRun |
| `client/src/components/OutputPanel.jsx` | stdin textarea, packages input, toggle button |
| `client/src/components/TopBar.jsx` | Gist button, GitHub login/logout/avatar UI |
| `client/src/components/FileTree.jsx` | Full CRUD file explorer |
| `client/src/components/Chat.jsx` | Real-time Yjs-backed chat |
| `client/src/components/ConnectionBanner.jsx` | WebSocket status banner |
| `client/src/components/Sidebar.jsx` | AI / Chat / Who's Here tabs |
| `client/src/lib/auth.js` | `useAuth` hook — OAuth login/logout/me |
| `client/src/lib/yjs.js` | Multi-file yFiles map, getYText per file, roomId from hash |
| `client/vite.config.js` | Proxy `/auth/*`, `changeOrigin: true` for SSE |
| `.env` | Added GitHub OAuth + session secret variables |

---

## Environment Variables Added

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `SESSION_SECRET` | Random string for express-session signing |
| `GITHUB_TOKEN` | Optional personal access token for Gist attribution |

---

## How to Set Up GitHub OAuth

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**
2. Set **Homepage URL**: `http://localhost:5173`
3. Set **Callback URL**: `http://localhost:5173/auth/github/callback`
4. Copy Client ID and Client Secret into `.env`
5. Restart the server

---

## How to Test

**Stdin:**
1. Write a Python program that calls `input()`
2. Click "stdin" in the Output panel, type your input
3. Hit Run — the program reads it

**Custom packages:**
1. Write `const _ = require('lodash'); console.log(_.chunk([1,2,3,4], 2))`
2. In the stdin/packages panel, type `lodash` in the packages field
3. Run — Docker installs lodash then executes

**Gist:**
1. Write some code
2. Click "↗ Gist" in TopBar — GitHub opens with your file

**OAuth:**
1. Fill in `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`
2. Restart server
3. Click "Login with GitHub" — your name and avatar appear in the editor
