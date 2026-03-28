import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

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
  let roomId = window.location.hash.slice(1)
  if (!roomId) {
    roomId = Math.random().toString(36).slice(2, 10)
    window.location.hash = roomId
  }
  return roomId
}

export const roomId = getOrCreateRoomId()

const ydoc = new Y.Doc()

const wsProvider = new WebsocketProvider(
  `ws://${window.location.hostname}:1234`,
  `itecify-${roomId}`,
  ydoc
)

const color = COLORS[Math.floor(Math.random() * COLORS.length)]
const name = getRandomName()

wsProvider.awareness.setLocalStateField('user', { name, color })

// yFiles: Map of filename -> { language }
const yFiles = ydoc.getMap('files')
const yAiBlocks = ydoc.getMap('aiBlocks')

// Get or create a Yjs text for a given filename
function getYText(filename) {
  return ydoc.getText(`file:${filename}`)
}

// Seed default file if none exist
if (yFiles.size === 0) {
  yFiles.set('main.js', { language: 'javascript' })
}

// Legacy export
const ytext = getYText('main.js')

export { ydoc, wsProvider, ytext, yFiles, yAiBlocks, getYText, color, name }
