import { useState, useEffect, useCallback } from "react";
import { yReactions } from "../lib/yjs";
import { name as localName } from "../lib/yjs";

const QUICK_EMOJIS = ["👍", "❤️", "🔥", "💡", "🤔", "👀", "🎉", "😂"];

/** Returns all reactions for a given file, grouped by line */
function useReactions(activeFile) {
  const [reactions, setReactions] = useState([]);

  useEffect(() => {
    const update = () => {
      const all = yReactions.toArray().filter((r) => r.file === activeFile);
      setReactions(all);
    };
    update();
    yReactions.observe(update);
    return () => yReactions.unobserve(update);
  }, [activeFile]);

  return reactions;
}

/** Group reactions by line then by emoji */
function groupReactions(reactions) {
  const byLine = {};
  for (const r of reactions) {
    if (!byLine[r.line]) byLine[r.line] = {};
    if (!byLine[r.line][r.emoji]) byLine[r.line][r.emoji] = [];
    byLine[r.line][r.emoji].push(r.author);
  }
  return byLine;
}

export default function EmojiReactions({ editorRef, activeFile }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactions = useReactions(activeFile);
  const byLine = groupReactions(reactions);

  const currentLine = useCallback(() => {
    const editor = editorRef?.current?.getEditor?.();
    return editor?.getPosition?.()?.lineNumber ?? 1;
  }, [editorRef]);

  const addReaction = useCallback(
    (emoji) => {
      const line = currentLine();
      // Remove my previous reaction with the same emoji on this line
      const existing = yReactions.toArray().findIndex(
        (r) => r.file === activeFile && r.line === line && r.emoji === emoji && r.author === localName,
      );
      if (existing !== -1) {
        yReactions.delete(existing, 1);
      } else {
        yReactions.push([
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file: activeFile,
            line,
            emoji,
            author: localName,
          },
        ]);
      }
      setPickerOpen(false);
    },
    [activeFile, currentLine],
  );

  // Summary of reactions across all lines for the reaction bar
  const emojiTotals = {};
  for (const lineReactions of Object.values(byLine)) {
    for (const [emoji, authors] of Object.entries(lineReactions)) {
      emojiTotals[emoji] = (emojiTotals[emoji] || []).concat(authors);
    }
  }

  const lineCount = Object.keys(byLine).length;

  return (
    <div
      className="flex shrink-0 items-center gap-2 overflow-x-auto border-b px-3 py-1.5"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-secondary)",
        scrollbarWidth: "none",
        minHeight: "2rem",
      }}
    >
      {/* Emoji picker trigger */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="liquid-surface flex h-6 items-center gap-1 rounded-xl border px-2 py-0.5 text-[10px] font-semibold transition-all duration-150 hover:-translate-y-px hover:brightness-110"
          style={{
            borderColor: pickerOpen ? "var(--accent)" : "var(--border)",
            background: pickerOpen ? "color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))" : "var(--bg-tertiary)",
            color: pickerOpen ? "var(--accent)" : "var(--text-secondary)",
          }}
          title="React to current line"
        >
          <span style={{ fontSize: 11 }}>+</span>
          <span>React</span>
        </button>

        {pickerOpen && (
          <div
            className="absolute bottom-[calc(100%+6px)] left-0 z-50 flex gap-1 rounded-2xl border p-2 shadow-[0_16px_36px_rgba(0,0,0,0.32)]"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addReaction(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-100 hover:scale-125 hover:bg-[var(--bg-tertiary)]"
                style={{ fontSize: 16 }}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      {Object.keys(emojiTotals).length > 0 && (
        <span
          className="h-4 w-px shrink-0"
          style={{ background: "var(--border)" }}
        />
      )}

      {/* Reaction badges */}
      {Object.entries(emojiTotals).map(([emoji, authors]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => addReaction(emoji)}
          className="liquid-surface flex h-6 shrink-0 items-center gap-1 rounded-xl border px-2 py-0.5 transition-all duration-150 hover:-translate-y-px hover:brightness-110"
          style={{
            background: authors.includes(localName)
              ? "color-mix(in srgb, var(--accent) 14%, var(--bg-tertiary))"
              : "var(--bg-tertiary)",
            borderColor: authors.includes(localName)
              ? "color-mix(in srgb, var(--accent) 32%, var(--border))"
              : "var(--border)",
          }}
          title={`${authors.join(", ")} reacted with ${emoji}`}
        >
          <span style={{ fontSize: 11 }}>{emoji}</span>
          <span
            className="text-[10px] font-semibold tabular-nums"
            style={{ color: "var(--text-secondary)" }}
          >
            {authors.length}
          </span>
        </button>
      ))}

      {/* Lines with reactions indicator */}
      {lineCount > 0 && (
        <span
          className="ml-auto shrink-0 text-[9px] uppercase tracking-[0.16em]"
          style={{ color: "var(--text-secondary)" }}
        >
          {lineCount} line{lineCount !== 1 ? "s" : ""} reacted
        </span>
      )}
    </div>
  );
}
