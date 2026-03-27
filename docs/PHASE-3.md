# Phase 3 -- Sandboxing

**Status:** Planned
**Scope:** Let users run their code securely inside Docker containers with real-time output streaming.

## Features

### 1. Run Button
- "Run" button in the top bar triggers code execution
- Sends current editor content + selected language to the backend
- Disabled while code is running (shows spinner)

### 2. Safety Scanner
- Before execution, backend scans code with simple pattern matching
- Flags dangerous patterns: `eval`, `exec`, `os.system`, `subprocess`, `require('child_process')`
- Returns warnings to the user (non-blocking, but visible)
- Configurable per language

### 3. Docker Execution
- Uses `dockerode` to spin up ephemeral containers on-the-fly
- Language-specific images:
  - Python: `python:3.11-slim`
  - Node.js: `node:20-slim`
  - Rust: `rust:slim`
- Code is written to a temp file and mounted into the container
- Container is destroyed after execution

### 4. Output Streaming
- stdout/stderr streamed back to the client via WebSocket
- Output appears in the bottom terminal panel in real-time
- Supports ANSI color codes for colored output
- Execution timeout (30 seconds default) to prevent infinite loops

## How to Test

1. Write a Python/JS/Rust program in the editor
2. Select the language from the dropdown
3. Click "Run"
4. See output stream into the bottom terminal panel
5. Try running dangerous code -- see the safety warning
