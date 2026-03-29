/**
 * Minimal Vite + React workspace for testing the Docker preview.
 * Apply with mergeVitePreviewTemplate(yFiles, getYText) from the client.
 */
import { ydoc } from "./yjs";

export const VITE_PREVIEW_TEMPLATE_FILES = {
  "package.json": JSON.stringify(
    {
      name: "itecify-preview",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
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
  ),

  "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,

  "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>iTECify Preview</title>
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

  "src/App.jsx": `import { useState } from 'react'

export default function App() {
  const [n, setN] = useState(0)
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', color: '#111' }}>
      <h1>iTECify live preview</h1>
      <p>
        Editează <code>src/App.jsx</code> — cu Preview activ, fișierele se sincronizează spre container (HMR).
        Altfel apasă din nou Preview.
      </p>
      <button type="button" onClick={() => setN((x) => x + 1)}>
        Count: {n}
      </button>
    </div>
  )
}
`,

  "src/index.css": `body { margin: 0; background: #f4f4f5; }
button { margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer; }
`,

  "README.md": `# Proiect Vite + React (iTECify)

## Comenzi
- \`npm run dev\` — dev server (în Preview Docker: pornit automat)
- \`npm run build\` — build producție
- \`npm run preview\` — servește build-ul

## În editor
Folosește **Preview** cu Docker; ține **Shift+Preview** după schimbări în dependencies sau \`package.json\`.
`,
};

/** Căi incluse în demo — utile pentru confirmare în UI */
export const VITE_PREVIEW_TEMPLATE_PATHS = new Set(
  Object.keys(VITE_PREVIEW_TEMPLATE_FILES),
);

/** @typedef {{ language: string }} FileMeta */

/**
 * Înlocuiește **tot** conținutul camerei cu proiectul minimal Vite.
 * (Dacă doar suprascrii câteva fișiere, monorepo-ul iTECify — client/, server/ —
 * rămâne în Yjs și Preview pornește în continuare `concurrently` pe tot proiectul.)
 *
 * @param {import('yjs').Map<string, FileMeta>} yFiles
 * @param {(name: string) => import('yjs').Text} getYText
 */
export function mergeVitePreviewTemplate(yFiles, getYText) {
  ydoc.transact(() => {
    for (const name of [...yFiles.keys()]) {
      yFiles.delete(name);
    }

    const metaFor = (fname) => {
      if (fname.endsWith(".json")) return { language: "json" };
      if (fname.endsWith(".css")) return { language: "css" };
      if (fname.endsWith(".html")) return { language: "html" };
      if (fname.endsWith(".md")) return { language: "markdown" };
      if (fname.endsWith(".jsx")) return { language: "react-jsx" };
      return { language: "javascript" };
    };
    for (const [fname, content] of Object.entries(
      VITE_PREVIEW_TEMPLATE_FILES,
    )) {
      yFiles.set(fname, metaFor(fname));
      const y = getYText(fname);
      y.delete(0, y.length);
      y.insert(0, content);
    }
  }, "vite-demo");
}
