import { useEffect, useRef } from "react";

const THEMES = [
  { id: "vs-dark", label: "Dark" },
  { id: "vs", label: "Light" },
  { id: "hc-black", label: "Hi-C" },
];

const KEYMAPS = [
  { id: "default", label: "Default" },
  { id: "vim", label: "Vim" },
  { id: "emacs", label: "Emacs" },
];

export default function SettingsPanel({ settings, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const set = (key, value) => onChange({ ...settings, [key]: value });

  return (
    <div
      ref={ref}
      className="absolute right-0 top-[calc(100%+6px)] z-50 flex w-72 flex-col gap-3 border p-4"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
        color: "var(--text-primary)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        padding: "16px",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "var(--accent)" }}
        >
          Editor Settings
        </span>
        <button
          onClick={onClose}
          className="rounded-none border px-2 py-0.5 text-[10px] transition-all hover:brightness-110 active:scale-[0.93]"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
          }}
        >
          ✕
        </button>
      </div>

      {/* Theme — inline selector */}
      <Row label="Theme">
        <InlineSelect
          options={THEMES}
          value={settings.theme}
          onChange={(v) => set("theme", v)}
        />
      </Row>

      {/* Keymap — inline selector */}
      <Row label="Keymap">
        <InlineSelect
          options={KEYMAPS}
          value={settings.keymap}
          onChange={(v) => set("keymap", v)}
        />
      </Row>

      {/* Font size */}
      <Row label={`Font size — ${settings.fontSize}px`}>
        <input
          type="range"
          min={10}
          max={24}
          step={1}
          value={settings.fontSize}
          onChange={(e) => set("fontSize", Number(e.target.value))}
          className="w-full accent-violet-400"
          style={{ accentColor: "var(--accent)" }}
        />
      </Row>

      {/* Tab size */}
      <Row label="Tab size">
        <InlineSelect
          options={[
            { id: 2, label: "2" },
            { id: 4, label: "4" },
            { id: 8, label: "8" },
          ]}
          value={settings.tabSize}
          onChange={(v) => set("tabSize", v)}
        />
      </Row>

      {/* Toggles */}
      <Row label="Word wrap">
        <Toggle
          value={settings.wordWrap}
          onChange={(v) => set("wordWrap", v)}
        />
      </Row>
      <Row label="Minimap">
        <Toggle value={settings.minimap} onChange={(v) => set("minimap", v)} />
      </Row>
      <Row label="Line numbers">
        <Toggle
          value={settings.lineNumbers}
          onChange={(v) => set("lineNumbers", v)}
        />
      </Row>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="shrink-0 text-[11px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function InlineSelect({ options, value, onChange }) {
  return (
    <div
      className="flex items-center gap-px rounded-none border"
      style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
    >
      {options.map((opt, i) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className="flex-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-all duration-100 active:scale-[0.93] sm:text-[11px]"
            style={{
              background: selected ? "var(--accent)" : "transparent",
              color: selected ? "var(--bg-primary)" : "var(--text-secondary)",
              borderRight:
                i < options.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative h-5 w-10 shrink-0 float-right flex-shrink-0 rounded-full transition-colors duration-150"
      style={{
        background: value ? "var(--accent)" : "var(--bg-tertiary)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full transition-all duration-150"
        style={{
          background: value ? "var(--bg-primary)" : "var(--text-secondary)",
          left: value ? "22px" : "2px",
        }}
      />
    </button>
  );
}
