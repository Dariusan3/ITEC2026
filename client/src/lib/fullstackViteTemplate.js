/**
 * Minimal Vite + React + Express API (proxy /api → :3001 in the same container).
 * A single `npm run dev` starts Vite (5173) and the API; Docker preview exposes 5173.
 */
import { ydoc } from "./yjs";

const PKG = JSON.stringify(
  {
    name: "itecify-fullstack-demo",
    private: true,
    type: "module",
    scripts: {
      dev: 'concurrently -k "npm run dev:vite" "npm run dev:api"',
      "dev:vite": "vite --host 0.0.0.0 --port 5173",
      "dev:api": "node server/index.js",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      concurrently: "^9.1.2",
      express: "^4.21.2",
      react: "^18.3.1",
      "react-dom": "^18.3.1",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.4",
      vite: "^5.4.11",
    },
  },
  null,
  2,
);

export const FULLSTACK_PREVIEW_TEMPLATE_FILES = {
  "package.json": PKG,

  "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    watch: { usePolling: true, interval: 300 },
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
})
`,

  "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>iTECify Fullstack</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,

  "src/main.jsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,

  "src/App.jsx": `import { useEffect, useState } from 'react'

export default function App() {
  const [api, setApi] = useState(null)
  useEffect(() => {
    fetch('/api/hello')
      .then((r) => r.json())
      .then(setApi)
      .catch(() => setApi({ error: 'API unavailable' }))
  }, [])
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>Fullstack demo</h1>
      <p>Vite (frontend) + Express on port 3001; in the browser you call <code>/api/…</code> via proxy.</p>
      <pre style={{ background: '#111', color: '#8f8', padding: '1rem', borderRadius: 8 }}>
        {JSON.stringify(api, null, 2)}
      </pre>
    </div>
  )
}
`,

  "src/index.css": `body { margin: 0; background: #f4f4f5; }
code { background: #e4e4e7; padding: 0.1rem 0.35rem; border-radius: 4px; }
`,

  "server/index.js": `import express from 'express'

const app = express()
app.get('/api/hello', (_req, res) => {
  res.json({ ok: true, from: 'express', time: new Date().toISOString() })
})

app.listen(3001, '0.0.0.0', () => {
  console.log('[api] http://0.0.0.0:3001')
})
`,
};

export const FULLSTACK_TEMPLATE_PATHS = new Set(
  Object.keys(FULLSTACK_PREVIEW_TEMPLATE_FILES),
);

/**
 * @param {import('yjs').Map<string, { language?: string }>} yFiles
 * @param {(name: string) => import('yjs').Text} getYText
 */
export function mergeFullstackPreviewTemplate(yFiles, getYText) {
  const metaFor = (fname) => {
    if (fname.endsWith(".json")) return { language: "json" };
    if (fname.endsWith(".css")) return { language: "css" };
    if (fname.endsWith(".html")) return { language: "html" };
    if (fname.endsWith(".md")) return { language: "markdown" };
    if (fname.endsWith(".jsx")) return { language: "react-jsx" };
    if (fname.endsWith(".js")) return { language: "javascript" };
    return { language: "javascript" };
  };

  ydoc.transact(() => {
    for (const name of [...yFiles.keys()]) {
      yFiles.delete(name);
    }
    for (const [fname, content] of Object.entries(FULLSTACK_PREVIEW_TEMPLATE_FILES)) {
      yFiles.set(fname, metaFor(fname));
      const y = getYText(fname);
      y.delete(0, y.length);
      y.insert(0, content);
    }
  }, "fullstack-demo");
}
