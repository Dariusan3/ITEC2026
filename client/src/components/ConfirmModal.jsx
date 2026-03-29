import { useEffect, useRef } from "react";

/**
 * Confirmation modal — replaces window.confirm.
 * @param {{ open: boolean, title: string, body: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, onConfirm: () => void, onCancel: () => void }} props
 */
export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  const btnRef = useRef(null);

  useEffect(() => {
    if (open) btnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center px-4"
      style={{ background: "rgba(5, 8, 6, 0.65)" }}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="soft-card w-full max-w-sm rounded-none border p-6 shadow-[0_24px_48px_rgba(0,0,0,0.4)]"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">{title}</p>
        <p
          className="mt-2 text-xs leading-relaxed whitespace-pre-line"
          style={{ color: "var(--text-secondary)" }}
        >
          {body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-none border px-4 py-2 text-xs font-semibold uppercase tracking-wide"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
              background: "transparent",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={btnRef}
            type="button"
            onClick={onConfirm}
            className="rounded-none px-4 py-2 text-xs font-semibold uppercase tracking-wide"
            style={{
              background: danger ? "var(--red)" : "var(--accent)",
              color: "var(--bg-primary)",
              border: `1px solid ${danger ? "var(--red)" : "var(--accent)"}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
