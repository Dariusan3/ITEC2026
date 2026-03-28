/**
 * config.js — central URL config for Vercel (frontend) + Railway (backend) deployment.
 *
 * Dev:  VITE_SERVER_URL is unset → SERVER_URL = '' → all fetch calls use relative
 *       paths, proxied by Vite to localhost:3001.
 * Prod: VITE_SERVER_URL = 'https://your-app.up.railway.app'
 *       → fetch calls get an absolute URL; WS uses wss://
 */

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

const wsBase = SERVER_URL
  ? SERVER_URL.replace(/^https/, 'wss').replace(/^http/, 'ws')
  : `ws://${window.location.hostname}:${import.meta.env.VITE_API_PORT || '3001'}`

export const YJS_WS_URL = import.meta.env.VITE_WS_URL || `${wsBase}/yjs`
export const TERM_WS_URL = import.meta.env.VITE_TERM_WS_URL || `${wsBase}/term`
