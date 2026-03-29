import { useRef, useEffect } from "react";
import { TERM_WS_URL } from "../lib/config";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export default function Terminal() {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#0a0f0b",
        foreground: "#e6f3e8",
        cursor: "#8ff7a7",
        selectionBackground: "#233227",
        black: "#233227",
        red: "#ff8f8f",
        green: "#8ff7a7",
        yellow: "#d7f58d",
        blue: "#6fe3a3",
        magenta: "#7edfb3",
        cyan: "#74f0c2",
        white: "#e6f3e8",
      },
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const ws = new WebSocket(TERM_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "term:resize",
          cols: term.cols,
          rows: term.rows,
        }),
      );
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "term:output") {
          term.write(msg.data);
        } else if (msg.type === "term:exit") {
          term.writeln("\r\n[Session ended]");
        }
      } catch (error) {
        console.error("Failed to parse terminal message:", error);
      }
    };

    // Send keystrokes to server
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "term:input", data }));
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "term:resize",
            cols: term.cols,
            rows: term.rows,
          }),
        );
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full min-h-0 w-full min-w-0" />
  );
}
