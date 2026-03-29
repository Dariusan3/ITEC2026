import { useEffect, useState } from "react";
import * as Y from "yjs";
import { SERVER_URL } from "../lib/config";

function decodeBase64Update(snapshot) {
  const binary = atob(snapshot);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function extractFilesFromSnapshot(snapshot) {
  if (!snapshot) return [];

  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, decodeBase64Update(snapshot));

    const yFiles = doc.getMap("files");
    const files = [];

    yFiles.forEach((meta, filename) => {
      files.push({
        name: filename,
        language: meta?.language || "text",
        content: doc.getText(`file:${filename}`).toString(),
      });
    });

    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
  } catch {
    return [
      {
        name: "snapshot-error.txt",
        language: "text",
        content: "This replay snapshot could not be decoded.",
      },
    ];
  }
}

export default function ReplayApp() {
  const sessionId = new URLSearchParams(window.location.search).get("replay");
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    fetch(`${SERVER_URL}/api/interview/${sessionId}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || "Replay not found.");
          return;
        }
        setSession(data.session || null);
      })
      .catch(() => {
        setError("Could not load replay.");
      });
  }, [sessionId]);

  const timeline =
    Array.isArray(session?.replay_timeline) && session.replay_timeline.length > 0
      ? session.replay_timeline
      : session?.yjs_snapshot
        ? [
            {
              label: "Final",
              timestamp: session?.ended_at || session?.started_at || Date.now(),
              snapshot: session.yjs_snapshot,
            },
          ]
        : [];

  useEffect(() => {
    if (timeline.length === 0) {
      setTimelineIndex(0);
      return;
    }
    setTimelineIndex(timeline.length - 1);
  }, [session?.id]);

  useEffect(() => {
    const frame = timeline[timelineIndex];
    const nextFiles = extractFilesFromSnapshot(frame?.snapshot);
    setFiles(nextFiles);
    setActiveFile((current) => {
      if (nextFiles.some((file) => file.name === current)) return current;
      return nextFiles[0]?.name || "";
    });
  }, [timeline, timelineIndex]);

  const activeFileData =
    files.find((file) => file.name === activeFile) || files[0] || null;

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <div
        className="border-b px-5 py-4"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div
          className="text-xs uppercase tracking-[0.18em]"
          style={{ color: "var(--accent)" }}
        >
          Replay
        </div>
        <div className="mt-1 text-lg font-semibold">
          {session?.title || "Interview session"}
        </div>
        {session?.started_at && (
          <div
            className="mt-1 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            {new Date(session.started_at).toLocaleString()}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {error && (
          <div className="p-5">
            <div
              className="rounded-2xl border px-4 py-3 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--red)" }}
            >
              {error}
            </div>
          </div>
        )}

        {!error && !session && (
          <div className="p-5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading replay…
          </div>
        )}

        {!error && session && (
          <div className="flex h-full min-h-0">
            <div
              className="flex w-[19rem] shrink-0 flex-col border-r"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-secondary)",
              }}
            >
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <div
                  className="text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Session details
                </div>
                <div className="mt-2 text-sm">
                  Started by {session.started_by || "unknown"}
                </div>
                {session.participants?.length > 0 && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Participants: {session.participants.join(", ")}
                  </div>
                )}
                {session.notes && (
                  <div className="mt-2 whitespace-pre-wrap text-sm">
                    {session.notes}
                  </div>
                )}
              </div>

              <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <div
                  className="mb-2 text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Timeline
                </div>
                {timeline.length > 1 && (
                  <input
                    type="range"
                    min="0"
                    max={Math.max(timeline.length - 1, 0)}
                    value={timelineIndex}
                    onChange={(e) => setTimelineIndex(Number(e.target.value))}
                    className="w-full"
                  />
                )}
                <div className="mt-2 max-h-44 space-y-1 overflow-auto">
                  {timeline.map((entry, index) => (
                    <button
                      key={`${entry.timestamp}-${index}`}
                      type="button"
                      onClick={() => setTimelineIndex(index)}
                      className="w-full rounded-xl border px-3 py-2 text-left text-[11px]"
                      style={{
                        borderColor:
                          index === timelineIndex
                            ? "var(--accent)"
                            : "var(--border)",
                        background:
                          index === timelineIndex
                            ? "color-mix(in srgb, var(--accent) 10%, var(--bg-primary))"
                            : "var(--bg-primary)",
                        color:
                          index === timelineIndex
                            ? "var(--accent)"
                            : "var(--text-primary)",
                      }}
                    >
                      <div>{entry.label || `Checkpoint ${index + 1}`}</div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {entry.timestamp
                          ? new Date(entry.timestamp).toLocaleString()
                          : "No timestamp"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 px-4 py-3">
                <div
                  className="mb-2 text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Files
                </div>
                <div className="max-h-full space-y-1 overflow-auto pr-1">
                  {files.map((file) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => setActiveFile(file.name)}
                      className="w-full rounded-xl border px-3 py-2 text-left text-[11px]"
                      style={{
                        borderColor:
                          file.name === activeFile
                            ? "var(--accent)"
                            : "var(--border)",
                        background:
                          file.name === activeFile
                            ? "color-mix(in srgb, var(--accent) 10%, var(--bg-primary))"
                            : "var(--bg-primary)",
                        color:
                          file.name === activeFile
                            ? "var(--accent)"
                            : "var(--text-primary)",
                      }}
                    >
                      {file.name}
                    </button>
                  ))}
                  {files.length === 0 && (
                    <div
                      className="rounded-xl border px-3 py-2 text-[11px]"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No files found in this snapshot.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-auto p-5">
              <div
                className="rounded-2xl border"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-secondary)",
                }}
              >
                <div
                  className="border-b px-4 py-3 text-xs font-medium"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {activeFileData?.name || "Snapshot"}
                </div>
                <pre
                  className="overflow-auto p-4 text-xs"
                  style={{ color: "var(--text-primary)" }}
                >
                  {activeFileData?.content || "No snapshot content available."}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
