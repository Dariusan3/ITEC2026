import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  envDir: path.resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
