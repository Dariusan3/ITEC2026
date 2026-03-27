# Phase 3 -- Sandboxing

**Status:** Done
**Scope:** Let users run their code securely inside Docker containers with real-time output, safety scanning, and resource limits. Graceful fallback to direct execution when Docker isn't available.

## Features Implemented

### 1. Run Button
- "Run" button in the top bar triggers code execution
- Sends current editor content + selected language to `POST /api/run`
- Disabled while code is running (shows "Running...")
- Output panel auto-expands and scrolls to show results

### 2. Safety Scanner
- Before execution, backend scans code with regex pattern matching per language
- JavaScript/TypeScript: `require('child_process')`, `eval()`, `execSync()`, `spawnSync()`
- Python: `os.system()`, `subprocess.*`, `eval()`, `exec()`, `__import__()`
- Warnings shown in red in the output panel (non-blocking)

### 3. Docker Execution (Primary)
- Uses `dockerode` SDK to spin up ephemeral containers
- Language-specific images:
  - JavaScript/TypeScript: `node:20-slim`
  - Python: `python:3.11-slim`
  - Rust: `rust:slim` (compile + run)
- Code written to a temp dir, bind-mounted as read-only into `/sandbox`
- Containers auto-removed after execution
- 30-second execution timeout

### 4. Resource Limits (Docker mode)
- `--memory=128m` -- 128 MB RAM cap
- `--cpus=0.5` -- half a CPU core
- `--network=none` -- no internet access from sandbox
- Prevents resource abuse and runaway processes

### 5. Direct Execution Fallback
- When Docker daemon is not running, falls back to `child_process.execFile`
- Supports JavaScript (node) and Python (python3) in fallback mode
- Rust requires Docker (no local fallback)
- 10-second timeout in fallback mode
- Output panel shows `[Direct execution]` or `[Docker sandbox]` indicator

### 6. Output Panel
- Shows stdout in white, stderr in red, info in gray italic
- Execution mode indicator at top of output
- Auto-scrolls to bottom on new output
- Collapsible with toggle button

## Files Modified

| File | Changes |
|------|---------|
| `server/index.js` | Added `dockerode`, `runInDocker()`, `runDirect()`, `scanCode()`, `POST /api/run` |
| `client/src/App.jsx` | Wired `handleRun` callback through to TopBar and OutputPanel |
| `client/src/components/TopBar.jsx` | `onRun` and `running` props, disabled state |
| `client/src/components/OutputPanel.jsx` | Accepts `output` prop, renders lines by type |

## How to Test

### With Docker (sandboxed):
1. Start Docker Desktop
2. Restart the server (`npm run dev`)
3. Look for `[iTECify] Docker daemon connected` in server logs
4. Write code, select language, click Run
5. Output shows `[Docker sandbox]`

### Without Docker (fallback):
1. Stop Docker Desktop (or leave it stopped)
2. Start the server
3. Look for `[iTECify] Docker daemon not available — using direct execution fallback`
4. Write JS or Python code, click Run
5. Output shows `[Direct execution]`

### Safety scanner:
1. Write `eval("alert(1)")` in JavaScript
2. Click Run
3. See warning in red: `Warning: dangerous pattern detected`
