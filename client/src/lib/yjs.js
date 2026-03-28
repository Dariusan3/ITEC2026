import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import { YJS_WS_URL } from './config'

const COLORS = [
  '#cba6f7', '#f38ba8', '#a6e3a1', '#89b4fa',
  '#f9e2af', '#fab387', '#94e2d5', '#f5c2e7',
  '#74c7ec', '#b4befe',
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

// Get or create a Yjs text for a given filename
export function getYText(filename) {
  return ydoc.getText(`file:${filename}`)
}

// Seed default file only after IDB has loaded (so we don't overwrite persisted state)
idbPersistence.whenSynced.then(() => {
  if (yFiles.size === 0) {
    yFiles.set('main.js', { language: 'javascript' })
  }
})

// Legacy export
const ytext = getYText('main.js')

export { ytext, color, name }
