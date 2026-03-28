# iTECify

A collaborative code editor and sandboxing platform built for real-time pair programming, AI-assisted coding, and secure code execution.

## What is iTECify?

iTECify is a browser-based IDE where multiple developers can write code together in real-time, get AI-powered code suggestions from Groq/Llama, and run code safely inside Docker containers. Think Google Docs meets VS Code meets a sandboxed playground.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, Monaco Editor, Tailwind CSS |
| Backend | Node.js + Express + WebSocket (ws) |
| Real-time Sync | Yjs (CRDT) for conflict-free collaboration |
| AI | Groq API (llama-3.3-70b-versatile) for code suggestions |
| Execution | Docker SDK (dockerode) for sandboxed code running |
| State | Redis for time-travel snapshots |
| Auth | GitHub OAuth + express-session |

## Project Structure

```
ITEC2026/
├── client/                 React app (Vite + Tailwind)
│   └── src/
│       ├── components/     UI components (Editor, TopBar, Sidebar, etc.)
│       └── lib/            Shared utilities (Yjs setup, etc.)
├── server/                 Node.js API + WebSocket server
├── docker/                 Dockerfile templates per language
├── docs/                   Phase tracking and feature documentation
├── .env.example            Environment variable template
└── package.json            Root workspace (runs both client + server)
```

## UI Layout

```
+---------------------------------------------------------------+
|  iTECify   main.js   [JavaScript v]   [Run]   (avatars)      |  <- Top Bar
+----------+------------------------------------+---------------+
|          |                                    |               |
| Explorer |        Monaco Editor               |  AI Assistant |
|          |     (collaborative, multi-cursor)   |  (Claude)     |
|  main.js |                                    |               |
|          |                                    |               |
|          |                                    |               |
+----------+------------------------------------+---------------+
|  Output Terminal (collapsible)                                |
+---------------------------------------------------------------+
```

## Features

- **Real-time collaboration** — multi-cursor editing with Yjs CRDT, awareness presence, and live chat
- **Multi-file editor** — create, rename, delete files; each has independent undo history and CRDT sync
- **AI suggestions** — ask the AI assistant to suggest, explain, or fix code; accept/reject inline blocks
- **Sandboxed execution** — run JS, Python, Rust, TypeScript in isolated Docker containers with memory/CPU limits
- **Live output streaming** — see stdout/stderr line-by-line as the program runs
- **Stdin support** — feed input to your program before running
- **Custom packages** — install npm/pip packages per run (Docker only)
- **Shared terminal** — all collaborators share a real shell session
- **Time-travel replay** — drag a slider to replay any point in the session's editing history
- **Prettier formatting** — `Shift+Alt+F` to auto-format (JS, TS, CSS, HTML, JSON)
- **GitHub OAuth** — log in to get your real name/avatar in the editor
- **Save to Gist** — one-click publish current file to GitHub Gist
- **Room isolation** — each session is a unique URL; share the link to invite collaborators

## Development Phases

| Phase | Name | Status | Docs |
|-------|------|--------|------|
| 1 | Core Editor + Collaboration | Done | [PHASE-1.md](docs/PHASE-1.md) |
| 2 | AI Block Suggestions | Done | [PHASE-2.md](docs/PHASE-2.md) |
| 3 | Sandboxing | Done | [PHASE-3.md](docs/PHASE-3.md) |
| 4 | Terminal + Time-Travel | Done | [PHASE-4.md](docs/PHASE-4.md) |
| 5 | Polish, UX & Auth | Done | [PHASE-5.md](docs/PHASE-5.md) |
| 6+ | Roadmap | Planned | [ROADMAP.md](docs/ROADMAP.md) |

See [docs/ROADMAP.md](docs/ROADMAP.md) for all planned features with effort estimates.

## Getting Started

```bash
# 1. Clone and install
npm install
cd client && npm install
cd ../server && npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Run both client and server
npm run dev
```

- Client: http://localhost:5173
- API Server: http://localhost:3001
- WebSocket (Yjs): ws://localhost:1234

Open two browser tabs to test real-time collaboration.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key for AI suggestions | required |
| `REDIS_URL` | Redis connection URL (time-travel) | `redis://localhost:6379` |
| `PORT` | Express API server port | `3001` |
| `WS_PORT` | Yjs WebSocket server port | `1234` |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID | optional |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret | optional |
| `SESSION_SECRET` | Secret for signing session cookies | required in production |
| `GITHUB_TOKEN` | Personal token for Gist attribution | optional |

## License

MIT
