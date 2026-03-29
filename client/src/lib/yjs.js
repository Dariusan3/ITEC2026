import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import { YJS_WS_URL } from './config'

const COLORS = [
  '#8ff7a7', '#6fe3a3', '#74f0c2', '#d7f58d',
  '#5ccf7f', '#9cecae', '#4fd0a5', '#7edfb3',
  '#b8ffca', '#3fbf74',
]

function getRandomName() {
  const adjectives = ['Swift', 'Bright', 'Calm', 'Bold', 'Keen', 'Warm', 'Cool', 'Quick']
  const nouns = ['Fox', 'Owl', 'Bear', 'Wolf', 'Hawk', 'Lynx', 'Deer', 'Crow']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj}${noun}`
}

function getOrCreateRoomId() {
  const id = window.location.hash.slice(1)
  if (!id) {
    // Fallback: generate a room id if somehow the editor loads without a hash
    const newId = Math.random().toString(36).slice(2, 10)
    window.location.hash = newId
    return newId
  }
  return id
}

export const roomId = getOrCreateRoomId()

export const ydoc = new Y.Doc()

// ── Local persistence (IndexedDB) ───────────────────────────────────────────
// Stores the Yjs doc in browser IndexedDB — survives page reloads, logouts,
// and OAuth redirects without depending on server save timing.
export const idbPersistence = new IndexeddbPersistence(`itecify-${roomId}`, ydoc)

// ── WebSocket sync (server) ──────────────────────────────────────────────────
export const wsProvider = new WebsocketProvider(
  YJS_WS_URL,
  `itecify-${roomId}`,
  ydoc
)

const color = COLORS[Math.floor(Math.random() * COLORS.length)]
const name = getRandomName()

wsProvider.awareness.setLocalStateField('user', { name, color })

// yFiles: Map of filename -> { language }
export const yFiles = ydoc.getMap('files')
export const yAiBlocks = ydoc.getMap('aiBlocks')
/** Room metadata (e.g. nodeVersion for Docker preview) — Yjs synced */
export const yRoomMeta = ydoc.getMap('roomMeta')
// yReactions: Array of { id, file, line, emoji, author }
export const yReactions = ydoc.getArray('reactions')

// Get or create a Yjs text for a given filename
export function getYText(filename) {
  return ydoc.getText(`file:${filename}`)
}

// Seed default workspace only after IDB has loaded (so we don't overwrite persisted state)
idbPersistence.whenSynced.then(async () => {
  if (yFiles.size === 0) {
    const { applyDefaultRoomSeed } = await import('./seedRoom')
    await applyDefaultRoomSeed(yFiles, getYText)
  }
  if (yRoomMeta.get('nodeVersion') == null) {
    yRoomMeta.set('nodeVersion', '20')
  }
})

// Legacy export
const ytext = getYText('main.js')

export { ytext, color, name }
