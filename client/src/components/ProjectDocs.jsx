import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  createElement,
} from "react";
import { yFiles, getYText } from "../lib/yjs";
import { listWorkspaceMarkdownPaths } from "../lib/workspaceDocPaths";

/** Same as Sidebar — text segments / ```fence``` blocks */
function parseDocSegments(text) {
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1] || "", content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length)
    parts.push({ type: "text", content: text.slice(last) });
  if (parts.length === 0) parts.push({ type: "text", content: text || "" });
  return parts;
}

/** Light rendering for readable Markdown (headings, lists, paragraphs). */
function RenderTextSegment({ content }) {
  const lines = content.split("\n");
  const blocks = [];
  let i = 0;
  let listBuf = [];

  const flushList = (ordered) => {
    if (listBuf.length === 0) return;
    blocks.push(
      ordered ? (
        <ol
          key={`ol-${blocks.length}`}
          className="my-2 list-inside list-decimal space-y-1 pl-1 text-[11px] sm:text-xs"
          style={{ color: "var(--text-primary)" }}
        >
          {listBuf.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              <span className="markdown-li-inner">{formatInline(item)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul
          key={`ul-${blocks.length}`}
          className="my-2 list-inside list-disc space-y-1 pl-1 text-[11px] sm:text-xs"
          style={{ color: "var(--text-primary)" }}
        >
          {listBuf.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              <span className="markdown-li-inner">{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      ),
    );
    listBuf = [];
  };

  const pushParagraph = (raw) => {
    const t = raw.trim();
    if (!t) return;
    blocks.push(
      <p
        key={`p-${blocks.length}`}
        className="my-2 text-[11px] leading-relaxed sm:text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        {formatInline(t)}
      </p>,
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      flushList(false);
      const level = hMatch[1].length;
      const sizes = [
        "text-base",
        "text-sm",
        "text-xs",
        "text-xs",
        "text-[11px]",
        "text-[10px]",
      ];
      const L = Math.min(Math.max(level, 1), 6);
      const tag = `h${L}`;
      blocks.push(
        createElement(
          tag,
          {
            key: `h-${i}`,
            className: `mt-4 mb-1.5 font-bold first:mt-0 ${sizes[level - 1] ?? "text-xs"}`,
            style: {
              color: level <= 2 ? "var(--accent)" : "var(--text-primary)",
              letterSpacing: level <= 2 ? "0.04em" : "normal",
            },
          },
          hMatch[2],
        ),
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      listBuf.push(trimmed.replace(/^[-*]\s+/, ""));
      i++;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushList(false);
      const olItems = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        olItems.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      listBuf = olItems;
      flushList(true);
      continue;
    }

    flushList(false);
    if (!trimmed) {
      i++;
      continue;
    }

    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    pushParagraph(paraLines.join(" "));
  }
  flushList(false);

  return <div className="space-y-0.5">{blocks}</div>;
}

/** Formatare minimală inline: `cod` și **bold** */
function formatInline(text) {
  const nodes = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const bold = remaining.match(/\*\*([^*]+)\*\*/);
    const code = remaining.match(/`([^`]+)`/);
    let pick = null;
    let type = null;
    if (bold && (!code || bold.index <= code.index)) {
      pick = bold;
      type = "bold";
    } else if (code) {
      pick = code;
      type = "code";
    }
    if (!pick) {
      nodes.push(remaining);
      break;
    }
    if (pick.index > 0) nodes.push(remaining.slice(0, pick.index));
    if (type === "bold") {
      nodes.push(
        <strong key={key++} style={{ color: "var(--text-primary)" }}>
          {pick[1]}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded-none px-1 py-px font-mono text-[10px]"
          style={{
            background: "var(--bg-primary)",
            color: "var(--accent)",
          }}
        >
          {pick[1]}
        </code>,
      );
    }
    remaining = remaining.slice(pick.index + pick[0].length);
  }
  return nodes;
}

function WorkspaceMarkdownBody({ source, revision = 0 }) {
  const segments = useMemo(() => parseDocSegments(source), [source, revision]);
  return (
    <div className="space-y-3">
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <div
            key={i}
            className="overflow-hidden rounded-none border"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-primary)",
            }}
          >
            {seg.lang ? (
              <div
                className="border-b px-2.5 py-1 text-[8px] font-medium uppercase tracking-wider opacity-60"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {seg.lang}
              </div>
            ) : null}
            <pre
              className="max-h-[min(50vh,22rem)] overflow-auto p-3 font-mono text-[10px] leading-snug"
              style={{ color: "var(--text-primary)" }}
            >
              <code>{seg.content}</code>
            </pre>
          </div>
        ) : (
          <RenderTextSegment key={i} content={seg.content} />
        ),
      )}
    </div>
  );
}

/**
 * Room project documentation — .md / .mdx files from Yjs, live updates.
 * @param {{ onOpenInEditor?: (path: string, language?: string) => void }} props
 */
export default function ProjectDocs({ onOpenInEditor }) {
  const [paths, setPaths] = useState(() => listWorkspaceMarkdownPaths(yFiles));
  const [selected, setSelected] = useState(
    () => listWorkspaceMarkdownPaths(yFiles)[0] ?? null,
  );
  const [docVersion, setDocVersion] = useState(0);

  const refreshPaths = useCallback(() => {
    const next = listWorkspaceMarkdownPaths(yFiles);
    setPaths(next);
    setSelected((prev) => {
      if (prev && next.includes(prev)) return prev;
      return next[0] ?? null;
    });
  }, []);

  useEffect(() => {
    const onFiles = () => refreshPaths();
    yFiles.observe(onFiles);
    return () => yFiles.unobserve(onFiles);
  }, [refreshPaths]);

  const source = selected ? getYText(selected).toString() : "";

  useEffect(() => {
    if (!selected) return undefined;
    const yText = getYText(selected);
    const bump = () => setDocVersion((v) => v + 1);
    yText.observe(bump);
    return () => {
      yText.unobserve(bump);
    };
  }, [selected]);

  const openInEditor = () => {
    if (!selected || !onOpenInEditor) return;
    const meta = yFiles.get(selected);
    const lang = meta?.language ?? "markdown";
    onOpenInEditor(selected, lang);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:gap-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0 flex-1">
          <span
            className="block text-[11px] font-bold uppercase tracking-wider sm:text-xs"
            style={{ color: "var(--accent)" }}
          >
            Guide project
          </span>
          <span
            className="block pt-0.5 text-[9px] uppercase tracking-[0.14em]"
            style={{ color: "var(--text-secondary)" }}
          >
            From room files (.md)
          </span>
        </div>
        {selected && onOpenInEditor ? (
          <button
            type="button"
            onClick={openInEditor}
            className="liquid-surface shrink-0 rounded-none border px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide shadow-[0_8px_16px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 sm:text-[10px]"
            style={{
              background: "var(--bg-tertiary)",
              borderColor: "var(--border)",
              color: "var(--accent)",
            }}
          >
            Edit
          </button>
        ) : null}
      </div>

      {paths.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <div
            className="soft-card max-w-[19rem] space-y-2 rounded-none border p-5"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-tertiary)",
            }}
          >
            <p
              className="text-[11px] font-semibold leading-snug"
              style={{ color: "var(--text-primary)" }}
            >
              No documentation in workspace yet
            </p>
            <p
              className="text-[10px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              Create or import a{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                README.md
              </strong>
              , or any{" "}
              <code
                className="font-mono text-[9px]"
                style={{ color: "var(--accent)" }}
              >
                .md
              </code>{" "}
              /{" "}
              <code
                className="font-mono text-[9px]"
                style={{ color: "var(--accent)" }}
              >
                .mdx
              </code>{" "}
              — it will appear here for everyone in the room, updated live.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0 sm:flex-row">
          <div
            className="flex max-h-32 shrink-0 flex-col gap-1 overflow-y-auto border-b px-2 py-2 sm:max-h-none sm:w-[38%] sm:border-b-0 sm:border-r"
            style={{ borderColor: "var(--border)" }}
          >
            {paths.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelected(p)}
                className="w-full truncate rounded-none border px-2.5 py-2 text-left text-[10px] font-medium transition-all duration-150 sm:text-[11px]"
                style={{
                  borderColor:
                    selected === p ? "var(--accent)" : "var(--border)",
                  background:
                    selected === p
                      ? "color-mix(in srgb, var(--accent) 14%, var(--bg-tertiary))"
                      : "var(--bg-secondary)",
                  color:
                    selected === p ? "var(--accent)" : "var(--text-secondary)",
                }}
                title={p}
              >
                {p}
              </button>
            ))}
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
            style={{ color: "var(--text-primary)" }}
          >
            {selected ? (
              <WorkspaceMarkdownBody source={source} revision={docVersion} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
