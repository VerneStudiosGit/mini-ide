import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface TerminalProps {
  token: string;
}

export interface TerminalHandle {
  sendCommand: (cmd: string) => void;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal({ token }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState(false);

  useImperativeHandle(ref, () => ({
    sendCommand: (cmd: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data: cmd + "\n" }));
      }
    },
  }));

  const connect = useCallback(() => {
    const term = termRef.current;
    if (!term) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      term.clear();
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (e) => {
      term.write(e.data);
    };

    ws.onclose = () => {
      setConnected(false);
      term.write("\r\n\x1b[91m[Conexión cerrada]\x1b[0m\r\n");
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#0a0a0b",
        foreground: "#f5f5f5",
        cursor: "#a1a1aa",
        selectionBackground: "#2a2a2f",
        black: "#0a0a0b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#71717a",
        magenta: "#a78bfa",
        cyan: "#a1a1aa",
        white: "#fafafa",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    // Initial connection
    connect();

    return () => {
      observer.disconnect();
      wsRef.current?.close();
      term.dispose();
    };
  }, [connect]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/60 border-b border-blue-800 shrink-0">
        {/* Claude button */}
        <button
          onClick={() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({ type: "input", data: "claude --dangerously-skip-permissions\n" })
              );
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-[#d97706] hover:bg-[#b45309] text-white transition-colors"
          title="Ejecutar Claude Code"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-3H8.5L13 7.5v3H15.5L11 17.5z" />
          </svg>
          Claude
        </button>

        <div className="flex-1" />

        {/* Connection status */}
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />

        {/* Reconnect button */}
        <button
          onClick={connect}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors"
          title="Reconectar terminal"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reconectar
        </button>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1 min-h-0 p-1" />
    </div>
  );
});
