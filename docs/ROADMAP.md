# iTECify — Roadmap

This document tracks all planned features grouped by category, with effort estimates and implementation notes.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## Editor UX

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| E1 | **Cursor name labels** | S | Yjs awareness already has position; render a DOM overlay next to each remote cursor |
| E2 | **Vim / Emacs keybindings** | XS | Monaco has `editor.setOption('keymap', 'vim')` — just a toggle |
| E3 | **Theme switcher** | S | Monaco `setTheme()` + CSS variable swap; store preference in localStorage |
| E4 | **Editor settings panel** | S | Font size, tab size, word wrap, minimap — Monaco `updateOptions()` |
| E5 | **Find across files** | M | Panel that searches all Yjs text objects and highlights matches |
| E6 | **Diff view** | M | Monaco `createDiffEditor()` — compare current file with a snapshot or another file |
| E7 | **Breadcrumb / outline** | S | Monaco `DocumentSymbolProvider` — show function/class list on the right |

---

## AI Features

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| A1 | **AI: explain selection** | S | Right-click → "Explain this" — send selected text to Groq, show explanation in sidebar |
| A2 | **AI: fix errors** | S | When run output contains stderr, show "Fix with AI" — send code + error to Groq, apply patch |
| A3 | **AI: generate tests** | S | Button in sidebar — send current file to Groq, get back a test file, create it in the file tree |
| A4 | **Inline autocomplete** | L | Ghost-text completions as you type — debounce keystrokes, call Groq, render as Monaco inline completion |
| A5 | **AI code review** | S | "Review file" button — Groq reviews the file, returns annotated comments shown as Monaco markers |

---

## Execution & Sandbox

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| X1 | **Run history** | S | Store last N runs (timestamp, language, exit code, first line of output) in localStorage or Yjs |
| X2 | **Environment variables panel** | S | Key-value UI in OutputPanel; passed to Docker via `Env: ["KEY=value"]` in createContainer |
| X3 | **Output download** | XS | "Save output" button — `Blob` + `URL.createObjectURL` to download stdout as `.txt` |
| X4 | **Docker image pre-pull** | S | On server start, `docker.pull(image)` for all LANG_CONFIG images so first run is instant |
| X5 | **Rate limiting** | S | `express-rate-limit` on `/api/run` — e.g. 20 runs/min per IP |
| X6 | **More languages** | S | Add Go (`golang:1.21-alpine`), Java (`openjdk:21-slim`), C (`gcc:latest`) to LANG_CONFIG |
| X7 | **Interactive REPL** | L | Keep a container alive between runs; send lines incrementally via stdin stream |

---

## Collaboration

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| C1 | **Follow mode** | M | Click avatar → your viewport scrolls to that user's cursor position; Monaco `revealLine()` |
| C2 | **Read-only share link** | S | URL param `?view=1` → set Monaco `readOnly: true`, hide run/edit controls |
| C3 | **Inline code comments** | M | Anchor a Yjs-backed comment to a line number; render as Monaco glyph margin + tooltip |
| C4 | **Emoji reactions** | S | Float emoji over a line — stored in `ydoc.getArray('reactions')` with line + emoji + author |
| C5 | **Typing indicators** | XS | Show "Alex is typing…" in the chat panel using Yjs awareness |

---

## Project Management

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| P1 | **Export as ZIP** | S | Use `jszip` on the client — iterate `yFiles`, zip all file contents, trigger download |
| P2 | **Fork session** | S | Copy all files from current Yjs doc into a new room ID; redirect to new URL |
| P3 | **Open from GitHub** | M | Paste a GitHub repo URL → fetch file list via GitHub API → load files into yFiles |
| P4 | **Session history** | S | Store visited room IDs + timestamps in localStorage; show a "Recent sessions" list |
| P5 | **Project templates** | S | Dropdown to start from a pre-filled template (React app, Express API, Python CLI, etc.) |

---

## Infrastructure

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| I1 | **Deploy frontend to Vercel** | XS | Vercel MCP is available — run `deploy_to_vercel` from the client folder |
| I2 | **Persistent rooms (DB)** | L | Store room file contents in PostgreSQL/MongoDB so they survive server restart |
| I3 | **Health dashboard** | S | `/admin` page showing active rooms, connected users, Redis status, Docker status |
| I4 | **WebRTC P2P sync** | XL | Replace Yjs WebSocket with WebRTC for peer-to-peer sync (reduces server load) |
| I5 | **Horizontal scaling** | XL | Use `y-redis` provider so multiple server instances share Yjs state via Redis |

---

## Effort Key

| Label | Meaning |
|-------|---------|
| XS | < 1 hour |
| S | 1–3 hours |
| M | half day |
| L | full day |
| XL | multi-day |

---

## Suggested Next Sprint

A balanced set of high-value, low-effort items:

1. **E1** — Cursor name labels (most visible collaboration polish)
2. **A2** — AI fix errors (completes the AI feedback loop)
3. **X1** — Run history (useful for debugging)
4. **I1** — Deploy to Vercel (you have the MCP, takes minutes)
5. **E2** — Vim keybindings (fan favourite, one line of config)
