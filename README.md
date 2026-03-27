# iTECify

A collaborative code editor and sandboxing platform built for real-time pair programming, AI-assisted coding, and secure code execution.

## What is iTECify?

iTECify is a browser-based IDE where multiple developers can write code together in real-time, get AI-powered code suggestions from Claude, and run code safely inside Docker containers. Think Google Docs meets VS Code meets a sandboxed playground.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, Monaco Editor, Tailwind CSS |
| Backend | Node.js + Express + WebSocket (ws) |
| Real-time Sync | Yjs (CRDT) for conflict-free collaboration |
| AI | Anthropic Claude API for code suggestions |
| Execution | Docker SDK (dockerode) for sandboxed code running |
| State | Redis for session/cursor state and time-travel snapshots |

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

## Development Phases

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 1 | Core Editor + Collaboration | Done | Monaco Editor with Yjs CRDT sync and multi-cursor awareness |
| 2 | AI Block Suggestions | Done | Groq/Llama AI integration with accept/reject code blocks |
| 3 | Sandboxing | Done | Docker-based code execution with safety scanning and resource limits |
| 4 | Side Quests | Done | Shared terminal, time-travel replay, resource limits |

See the [docs/](docs/) folder for detailed feature documentation per phase.

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
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude | required |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `PORT` | Express API server port | `3001` |
| `WS_PORT` | Yjs WebSocket server port | `1234` |

## License

MIT
