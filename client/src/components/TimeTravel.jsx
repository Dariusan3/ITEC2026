import { useState, useEffect, useCallback, useRef } from "react";
import * as Y from "yjs";
import { getYText, ydoc, roomId } from "../lib/yjs";
import { SERVER_URL } from "../lib/config";

export default function TimeTravel({ editorRef, activeFile }) {
  const [snapshots, setSnapshots] = useState([]);
  const [sliderValue, setSliderValue] = useState(-1);
  const [replaying, setReplaying] = useState(false);
  /** Backup text pentru replay; ținut în ref ca să nu rulăm side-effect-uri în updateri de setState (Monaco → awareness → TopBar). */
  const liveBackupRef = useRef(null);
  const liveBackupDoneRef = useRef(false);

  const fetchSnapshots = useCallback(async () => {
    try {
      const q = new URLSearchParams({ room: roomId });
      const res = await fetch(`${SERVER_URL}/api/snapshots?${q}`);
      const data = await res.json();
      setSnapshots(data.snapshots || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchSnapshots();
    const interval = setInterval(fetchSnapshots, 15000);
    return () => clearInterval(interval);
  }, [fetchSnapshots]);

  const exitReplay = useCallback(
    (opts = {}) => {
      const restoreLive = opts.restoreLive !== false;
      const backup = liveBackupRef.current;
      liveBackupRef.current = null;
      liveBackupDoneRef.current = false;
      setReplaying(false);
      setSliderValue(-1);
      queueMicrotask(() => {
        const editor = editorRef?.current?.getEditor();
        if (!editor) return;
        editor.updateOptions({ readOnly: false });
        if (restoreLive && backup !== null) {
          editor.getModel()?.setValue(backup);
        }
      });
    },
    [editorRef],
  );

  const goToIndex = useCallback(
    async (idx) => {
      setSliderValue(idx);

      if (idx === snapshots.length - 1 || idx < 0) {
        exitReplay();
        return;
      }

      const snapshot = snapshots[idx];
      if (!snapshot) return;

      if (!liveBackupDoneRef.current) {
        liveBackupRef.current = getYText(activeFile).toString();
        liveBackupDoneRef.current = true;
      }
      setReplaying(true);

      try {
        const sq = new URLSearchParams({ room: roomId });
        const res = await fetch(`${SERVER_URL}/api/snapshots/${snapshot.timestamp}?${sq}`);
        const data = await res.json();
        if (data.snapshot) {
          const update = Uint8Array.from(atob(data.snapshot), (c) =>
            c.charCodeAt(0),
          );
          const tmpDoc = new Y.Doc();
          Y.applyUpdate(tmpDoc, update);
          const yChunk = tmpDoc.getText(`file:${activeFile}`);
          const text = yChunk.toString();
          tmpDoc.destroy();

          const editor = editorRef?.current?.getEditor();
          if (editor) {
            editor.updateOptions({ readOnly: true });
            editor.getModel()?.setValue(text);
          }
        }
      } catch {}
    },
    [snapshots, editorRef, exitReplay, activeFile],
  );

  const handleSliderChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    goToIndex(idx);
  };

  const handleMinus = () => {
    if (snapshots.length < 2) return;
    if (sliderValue === -1) {
      goToIndex(snapshots.length - 2);
    } else if (sliderValue > 0) {
      goToIndex(sliderValue - 1);
    }
  };

  const handlePlus = () => {
    if (sliderValue === -1) return;
    goToIndex(sliderValue + 1);
  };

  const saveFromReplay = useCallback(() => {
    if (!replaying) return;
    const editor = editorRef?.current?.getEditor();
    const model = editor?.getModel();
    if (!model) return;
    const text = model.getValue();
    const yFileText = getYText(activeFile);
    ydoc.transact(() => {
      const len = yFileText.length;
      if (len > 0) yFileText.delete(0, len);
      yFileText.insert(0, text);
    });
    exitReplay({ restoreLive: false });
  }, [replaying, editorRef, exitReplay, activeFile]);

  const liveIndex = snapshots.length > 0 ? snapshots.length - 1 : 0;
  const canStepBack =
    snapshots.length >= 2 &&
    (sliderValue === -1 || (sliderValue > 0 && sliderValue < snapshots.length));
  const canStepForward =
    replaying && sliderValue >= 0 && sliderValue < liveIndex;

  const barShellClass =
    "flex min-h-12 w-full items-center border-b px-3 py-2.5 sm:px-4";
  const barStyle = {
    background: "var(--bg-secondary)",
    borderColor: "var(--border)",
  };

  if (snapshots.length === 0) {
    return (
      <div
        className={`${barShellClass} text-xs sm:text-sm`}
        style={{ ...barStyle, color: "var(--text-secondary)" }}
      >
        No snapshots yet (saves every 10s)
      </div>
    );
  }

  return (
    <div className={`${barShellClass} flex-wrap gap-2`} style={barStyle}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
        <span
          className="shrink-0 text-[11px] font-semibold whitespace-nowrap sm:text-xs"
          style={{
            color: replaying ? "var(--yellow)" : "var(--text-secondary)",
            marginLeft: "10px",
          }}
        >
          {replaying ? "REPLAY" : "Timeline"}
        </span>

        <button
          type="button"
          aria-label="Pas înapoi în istoric"
          disabled={!canStepBack}
          onClick={handleMinus}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg font-semibold leading-none transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
          }}
        >
          −
        </button>

        <input
          type="range"
          min={0}
          max={liveIndex}
          value={sliderValue === -1 ? liveIndex : sliderValue}
          onChange={handleSliderChange}
          className="h-2 min-w-[6rem] flex-1 accent-purple-400 sm:min-w-[8rem]"
          style={{ accentColor: "var(--accent)" }}
        />

        <button
          type="button"
          aria-label="Pas înainte spre Live"
          disabled={!canStepForward}
          onClick={handlePlus}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg font-semibold leading-none transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
          }}
        >
          +
        </button>

        <span
          className="shrink-0 text-[11px] whitespace-nowrap sm:text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          {sliderValue >= 0 && snapshots[sliderValue]
            ? snapshots[sliderValue].label
            : "Live"}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={saveFromReplay}
          disabled={!replaying}
          title={
            replaying
              ? "Folosește această versiune ca document live (colaborativ)"
              : "Disponibil doar în modul replay"
          }
          className="rounded-md px-3 py-1.5 text-[11px] font-semibold transition-opacity sm:text-xs"
          style={{
            background: replaying ? "var(--blue)" : "var(--bg-tertiary)",
            color: replaying ? "var(--bg-primary)" : "var(--text-secondary)",
            opacity: replaying ? 1 : 0.55,
            padding: "0.5rem 1rem",
          }}
        >
          Save
        </button>

        <button
          type="button"
          onClick={() => exitReplay()}
          disabled={!replaying}
          title={
            replaying
              ? "Revino la documentul live dinainte de replay"
              : "Ești deja pe Live"
          }
          className="rounded-md px-3 py-1.5 text-[11px] font-semibold transition-opacity sm:text-xs"
          style={{
            background: replaying ? "var(--green)" : "var(--bg-tertiary)",
            color: replaying ? "var(--bg-primary)" : "var(--text-secondary)",
            opacity: replaying ? 1 : 0.55,
            padding: "0.5rem 1rem",
            marginRight: "10px",
          }}
        >
          Back to Live
        </button>
      </div>
    </div>
  );
}
