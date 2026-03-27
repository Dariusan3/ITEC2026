# Phase 2 -- AI Block Suggestions

**Status:** In Progress
**Scope:** Integrate Claude AI into the editor so users can ask for code suggestions that appear as visually distinct, reviewable blocks.

## Features

### 1. Ask AI Sidebar
- Right sidebar transforms into a chat-style interface
- Text input + "Ask AI" button to send prompts
- Chat history showing user prompts and AI responses
- Current editor content is sent as context with each request

### 2. Claude API Backend
- `POST /api/ai/suggest` endpoint on the Express server
- Sends the current file content + user prompt to Claude (claude-sonnet-4-20250514)
- Returns AI-generated code suggestion
- Uses `ANTHROPIC_API_KEY` from environment

### 3. AI Blocks in Editor
- AI suggestions appear as special "blocks" inside the Monaco Editor
- Visual styling: light purple background (#cba6f720), dashed purple border
- Each block has Accept and Reject buttons:
  - **Accept:** Merges the suggestion into normal code
  - **Reject:** Removes the block entirely
- Blocks are inserted at the current cursor position

### 4. Collaborative AI Blocks (Yjs Map)
- AI blocks stored in a shared Yjs Map (`ydoc.getMap('aiBlocks')`)
- All connected users see the same AI suggestions in real-time
- Accept/Reject actions sync across all clients
- Each block has a unique ID, line position, content, and status

## API Contract

```
POST /api/ai/suggest
Body: { "code": "...", "prompt": "...", "language": "javascript" }
Response: { "id": "block_xxx", "suggestion": "...", "explanation": "..." }
```

## How to Test

1. Start both servers: `npm run dev`
2. Type some code in the editor
3. Type a prompt in the AI sidebar (e.g., "Add error handling")
4. See the AI block appear in the editor with purple styling
5. Click Accept to merge or Reject to discard
6. Open a second tab -- AI blocks should appear there too
