import { useState, useEffect } from "react";
import { wsProvider } from "../lib/yjs";

function readProviderStatus() {
  if (wsProvider.wsconnected) return "connected";
  if (wsProvider.wsconnecting || wsProvider.shouldConnect !== false) {
    return "connecting";
  }
  return "disconnected";
}

export default function ConnectionBanner() {
  const [status, setStatus] = useState(readProviderStatus);
  const [showDisconnected, setShowDisconnected] = useState(false);

  useEffect(() => {
    let disconnectTimer = null;

    const applyStatus = (nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus === "disconnected") {
        clearTimeout(disconnectTimer);
        disconnectTimer = setTimeout(() => {
          setShowDisconnected(true);
          try {
            wsProvider.connect();
          } catch {
            /* ignore */
          }
        }, 1500);
        return;
      }
      clearTimeout(disconnectTimer);
      setShowDisconnected(false);
    };

    const onStatus = ({ status }) => applyStatus(status);
    wsProvider.on("status", onStatus);
    applyStatus(readProviderStatus());

    return () => {
      clearTimeout(disconnectTimer);
      wsProvider.off("status", onStatus);
    };
  }, []);

  if (status === "connected") return null;
  if (status === "disconnected" && !showDisconnected) return null;

  const isConnecting = status === "connecting";

  return (
    <div
      className="fixed left-1/2 top-12 z-50 -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-center gap-2 border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide sm:text-xs"
        style={{
          background: isConnecting ? "var(--yellow)" : "var(--red)",
          borderColor: isConnecting ? "var(--yellow)" : "var(--red)",
          color: "var(--bg-primary)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
        }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-none"
          style={{
            background: "var(--bg-primary)",
            animation: "pulse 1.2s ease-in-out infinite",
            opacity: 0.9,
          }}
        />
        {isConnecting
          ? "Reconnecting to collaboration server…"
          : "Disconnected — changes will not sync"}
      </div>
    </div>
  );
}
