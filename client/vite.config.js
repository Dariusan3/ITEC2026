import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  // Trebuie să coincidă cu PORT din .env pe server; 127.0.0.1 evită IPv6-only pe Windows
  const apiPort = env.PORT || '3001'
  const apiOrigin = `http://127.0.0.1:${apiPort}`

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
          ws: true,
        },
        '/auth': {
          target: apiOrigin,
          changeOrigin: true,
          autoRewrite: true,
        },
      },
    },
  }
})
