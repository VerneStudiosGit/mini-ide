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

        {/* Codex button */}
        <button
          onClick={() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({ type: "input", data: "codex --full-auto\n" })
              );
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-[#10a37f] hover:bg-[#0d8c6d] text-white transition-colors"
          title="Ejecutar OpenAI Codex"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.5.5a6.046 6.046 0 00-5.77 4.17 6.046 6.046 0 00-4.05 2.928 6.065 6.065 0 00.745 7.097 5.98 5.98 0 00.516 4.911 6.046 6.046 0 006.51 2.9 6.065 6.065 0 004.55 1.995 6.046 6.046 0 005.77-4.17 6.046 6.046 0 004.05-2.929 6.065 6.065 0 00-.745-7.097zM12.5 21.654a4.476 4.476 0 01-2.876-1.042l.143-.082 4.779-2.758a.795.795 0 00.395-.678v-6.737l2.02 1.166a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.5 4.496zM3.654 17.65a4.474 4.474 0 01-.535-3.014l.143.085 4.779 2.758a.78.78 0 00.79 0l5.83-3.366v2.332a.08.08 0 01-.033.063L9.83 19.318a4.504 4.504 0 01-6.176-1.668zM2.34 8.264a4.474 4.474 0 012.341-1.97V11.9a.775.775 0 00.395.677l5.83 3.366-2.02 1.166a.08.08 0 01-.065.007l-4.797-2.77A4.504 4.504 0 012.34 8.264zm16.596 3.858l-5.83-3.366 2.02-1.165a.08.08 0 01.065-.008l4.797 2.77a4.504 4.504 0 01-.695 8.107V12.8a.79.79 0 00-.396-.678zm2.01-3.023l-.143-.085-4.779-2.758a.78.78 0 00-.79 0l-5.83 3.366V7.29a.08.08 0 01.033-.063l4.797-2.77a4.504 4.504 0 016.713 4.64zm-12.64 4.135l-2.02-1.166a.071.071 0 01-.038-.052V6.433a4.504 4.504 0 017.376-3.453l-.143.082-4.779 2.758a.795.795 0 00-.395.677v6.737zm1.097-2.365l2.596-1.5 2.596 1.5v2.999l-2.596 1.5-2.596-1.5z" />
          </svg>
          Codex
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
