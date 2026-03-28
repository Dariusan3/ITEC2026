import { useState, useEffect, useCallback, useRef } from "react";
import * as Y from "yjs";
import { getYText, ydoc, roomId } from "../lib/yjs";
import { ArchiveIcon } from "./ui/Icons";

const timeButtonClass =
  "liquid-surface inline-flex items-center justify-center rounded-2xl border text-[11px] font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-35 sm:text-xs";

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
      const res = await fetch(`/api/snapshots?${q}`);
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
        const res = await fetch(`/api/snapshots/${snapshot.timestamp}?${sq}`);
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
    "panel-shell flex min-h-[4.25rem] w-full items-center border-b px-3 py-3 sm:px-4";
  const barStyle = {
    borderColor: "var(--border)",
  };

  if (snapshots.length === 0) {
    return (
      <div
        className={barShellClass}
        style={barStyle}
      >
        <div
          className="soft-card flex w-full items-center gap-3 px-4 py-3"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{
              background: "color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))",
              color: "var(--accent)",
            }}
          >
            <ArchiveIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
              No snapshots yet
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              Automatic snapshots appear here every 10 seconds while the room is active.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${barShellClass} flex-wrap gap-3`} style={barStyle}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-4">
        <div
          className="soft-card flex items-center gap-3 rounded-2xl px-3 py-2"
          style={{
            background: replaying
              ? "color-mix(in srgb, var(--yellow) 10%, var(--bg-tertiary))"
              : "var(--bg-tertiary)",
            boxShadow: replaying
              ? "inset 0 0 0 1px color-mix(in srgb, var(--yellow) 20%, var(--border)), 0 12px 24px rgba(0,0,0,0.16)"
              : undefined,
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{
              background: replaying
                ? "color-mix(in srgb, var(--yellow) 18%, var(--bg-secondary))"
                : "color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))",
              color: replaying ? "var(--yellow)" : "var(--accent)",
            }}
          >
            <ArchiveIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <span
              className="block whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] sm:text-xs"
              style={{
                color: replaying ? "var(--yellow)" : "var(--accent)",
              }}
            >
              {replaying ? "Replay Mode" : "Time Travel"}
            </span>
            <span
              className="block text-[10px] uppercase tracking-[0.16em]"
              style={{ color: "var(--text-secondary)" }}
            >
              {sliderValue >= 0 && snapshots[sliderValue]
                ? snapshots[sliderValue].label
                : "Live workspace"}
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label="Pas înapoi în istoric"
          disabled={!canStepBack}
          onClick={handleMinus}
          className={`${timeButtonClass} h-10 w-10 shrink-0 text-lg leading-none`}
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
          className="timeline-slider h-2 min-w-[8rem] flex-1 sm:min-w-[12rem]"
          style={{
            background: `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${((sliderValue === -1 ? liveIndex : sliderValue) / Math.max(liveIndex || 1, 1)) * 100}%, color-mix(in srgb, var(--bg-primary) 65%, var(--border)) ${((sliderValue === -1 ? liveIndex : sliderValue) / Math.max(liveIndex || 1, 1)) * 100}%, color-mix(in srgb, var(--bg-primary) 65%, var(--border)) 100%)`,
          }}
        />

        <button
          type="button"
          aria-label="Pas înainte spre Live"
          disabled={!canStepForward}
          onClick={handlePlus}
          className={`${timeButtonClass} h-10 w-10 shrink-0 text-lg leading-none`}
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
          }}
        >
          +
        </button>

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
          className={`${timeButtonClass} px-4 py-2`}
          style={{
            background: replaying ? "var(--blue)" : "var(--bg-tertiary)",
            color: replaying ? "var(--bg-primary)" : "var(--text-secondary)",
            opacity: replaying ? 1 : 0.55,
            borderColor: replaying
              ? "color-mix(in srgb, var(--blue) 45%, var(--border))"
              : "var(--border)",
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
          className={`${timeButtonClass} px-4 py-2`}
          style={{
            background: replaying ? "var(--green)" : "var(--bg-tertiary)",
            color: replaying ? "var(--bg-primary)" : "var(--text-secondary)",
            opacity: replaying ? 1 : 0.55,
            borderColor: replaying
              ? "color-mix(in srgb, var(--green) 45%, var(--border))"
              : "var(--border)",
          }}
        >
          Back to Live
        </button>
      </div>
    </div>
  );
}
