export const PROJECT_TEMPLATES = [
  {
    id: "react-widget",
    label: "React Widget",
    description: "A tiny React starter with a component and styles.",
    files: {
      "src/App.jsx": {
        language: "javascript",
        content: `import './styles.css'

export default function App() {
  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">iTECify Template</p>
        <h1>React Widget</h1>
        <p>Start building a polished UI here.</p>
        <button type="button">Ship it</button>
      </section>
    </main>
  )
}
`,
      },
      "src/styles.css": {
        language: "css",
        content: `.shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at top, rgba(137, 180, 250, 0.18), transparent 35%),
    linear-gradient(160deg, #11111b, #1e1e2e 55%, #181825);
  color: #f5f7ff;
  font-family: 'Avenir Next', sans-serif;
}

.card {
  width: min(30rem, 92vw);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(24, 24, 37, 0.78);
  backdrop-filter: blur(14px);
  padding: 2rem;
}

.eyebrow {
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #89b4fa;
  font-size: 0.75rem;
}

button {
  margin-top: 1rem;
  border: 0;
  padding: 0.8rem 1.1rem;
  background: #cba6f7;
  color: #11111b;
  font-weight: 700;
}
`,
      },
      "package.json": {
        language: "json",
        content: `{
  "name": "react-widget",
  "private": true,
  "scripts": {
    "dev": "vite"
  }
}
`,
      },
    },
    entryFile: "src/App.jsx",
  },
  {
    id: "express-api",
    label: "Express API",
    description: "A minimal Node API with one health route.",
    files: {
      "server.js": {
        language: "javascript",
        content: `const express = require('express')

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'api', ts: Date.now() })
})

app.listen(3000, () => {
  console.log('API listening on http://localhost:3000')
})
`,
      },
      "package.json": {
        language: "json",
        content: `{
  "name": "express-api",
  "private": true,
  "scripts": {
    "start": "node server.js"
  }
}
`,
      },
      ".env.example": {
        language: "json",
        content: `PORT=3000
`,
      },
    },
    entryFile: "server.js",
  },
  {
    id: "python-cli",
    label: "Python CLI",
    description: "A simple command line app with argument parsing.",
    files: {
      "main.py": {
        language: "python",
        content: `import argparse


def greet(name: str) -> str:
    return f"Hello, {name}!"


def main() -> None:
    parser = argparse.ArgumentParser(description="Tiny CLI starter")
    parser.add_argument("name", nargs="?", default="iTECify")
    args = parser.parse_args()
    print(greet(args.name))


if __name__ == "__main__":
    main()
`,
      },
      "README.md": {
        language: "json",
        content: `Run:

python3 main.py
python3 main.py Ada
`,
      },
    },
    entryFile: "main.py",
  },
];
