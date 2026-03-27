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

const ydoc = new Y.Doc()

const wsProvider = new WebsocketProvider(
  `ws://${window.location.hostname}:1234`,
  'itecify-room',
  ydoc
)

const color = COLORS[Math.floor(Math.random() * COLORS.length)]
const name = getRandomName()

wsProvider.awareness.setLocalStateField('user', {
  name,
  color,
})

const ytext = ydoc.getText('monaco')
const yAiBlocks = ydoc.getMap('aiBlocks')

export { ydoc, wsProvider, ytext, yAiBlocks, color, name }
