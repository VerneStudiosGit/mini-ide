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

interface TermSession {
  id: number;
  name: string;
  term: XTerm;
  fitAddon: FitAddon;
  ws: WebSocket | null;
  connected: boolean;
  containerEl: HTMLDivElement;
  observer: ResizeObserver;
}

const TERM_THEME = {
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
};

let nextId = 1;

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal({ token }, ref) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<TermSession[]>([]);
  const [sessions, setSessions] = useState<{ id: number; name: string; connected: boolean }[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const connectSession = useCallback((session: TermSession) => {
    if (session.ws) {
      session.ws.close();
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal?token=${encodeURIComponent(token)}`);
    session.ws = ws;

    ws.onopen = () => {
      session.connected = true;
      session.term.clear();
      ws.send(JSON.stringify({ type: "resize", cols: session.term.cols, rows: session.term.rows }));
      updateSessionState();
    };

    ws.onmessage = (e) => {
      session.term.write(e.data);
    };

    ws.onclose = () => {
      session.connected = false;
      session.term.write("\r\n\x1b[91m[Conexion cerrada]\x1b[0m\r\n");
      updateSessionState();
    };

    ws.onerror = () => {
      session.connected = false;
      updateSessionState();
    };
  }, [token]);

  const updateSessionState = useCallback(() => {
    setSessions(
      sessionsRef.current.map((s) => ({ id: s.id, name: s.name, connected: s.connected }))
    );
  }, []);

  const createSession = useCallback((name?: string) => {
    const id = nextId++;
    const containerEl = document.createElement("div");
    containerEl.style.cssText = "width:100%;height:100%;display:none;padding:4px;";

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: TERM_THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (wrapperRef.current) {
      wrapperRef.current.appendChild(containerEl);
    }

    term.open(containerEl);
    fitAddon.fit();

    const observer = new ResizeObserver(() => {
      if (containerEl.style.display !== "none") {
        fitAddon.fit();
      }
    });
    observer.observe(containerEl);

    term.onData((data) => {
      const s = sessionsRef.current.find((s) => s.id === id);
      if (s?.ws?.readyState === WebSocket.OPEN) {
        s.ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    term.onResize(({ cols, rows }) => {
      const s = sessionsRef.current.find((s) => s.id === id);
      if (s?.ws?.readyState === WebSocket.OPEN) {
        s.ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const session: TermSession = {
      id,
      name: name || `Terminal ${id}`,
      term,
      fitAddon,
      ws: null,
      connected: false,
      containerEl,
      observer,
    };

    sessionsRef.current.push(session);
    connectSession(session);
    updateSessionState();
    setActiveId(id);

    return session;
  }, [connectSession, updateSessionState]);

  const closeSession = useCallback((id: number) => {
    const idx = sessionsRef.current.findIndex((s) => s.id === id);
    if (idx === -1) return;

    // Don't close the last terminal
    if (sessionsRef.current.length <= 1) return;

    const session = sessionsRef.current[idx];
    session.ws?.close();
    session.observer.disconnect();
    session.term.dispose();
    session.containerEl.remove();

    sessionsRef.current.splice(idx, 1);
    updateSessionState();

    // Switch to adjacent tab
    setActiveId((current) => {
      if (current === id) {
        const newIdx = Math.min(idx, sessionsRef.current.length - 1);
        return sessionsRef.current[newIdx]?.id ?? null;
      }
      return current;
    });
  }, [updateSessionState]);

  const sendToActive = useCallback((data: string) => {
    const session = sessionsRef.current.find((s) => s.id === activeId);
    if (session?.ws?.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: "input", data }));
    }
  }, [activeId]);

  useImperativeHandle(ref, () => ({
    sendCommand: (cmd: string) => {
      sendToActive(cmd + "\n");
    },
  }));

  // Show/hide terminal containers based on active tab
  useEffect(() => {
    for (const session of sessionsRef.current) {
      if (session.id === activeId) {
        session.containerEl.style.display = "block";
        // Fit after becoming visible
        requestAnimationFrame(() => {
          session.fitAddon.fit();
          session.term.focus();
        });
      } else {
        session.containerEl.style.display = "none";
      }
    }
  }, [activeId]);

  // Create first terminal on mount
  useEffect(() => {
    createSession();

    return () => {
      for (const session of sessionsRef.current) {
        session.ws?.close();
        session.observer.disconnect();
        session.term.dispose();
        session.containerEl.remove();
      }
      sessionsRef.current = [];
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Terminal tabs + toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-blue-900/60 border-b border-blue-800 shrink-0 overflow-x-auto">
        {/* Terminal tabs */}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer transition-colors shrink-0 ${
              s.id === activeId
                ? "bg-blue-800 text-white"
                : "text-blue-300 hover:bg-blue-800/50 hover:text-white"
            }`}
            onClick={() => setActiveId(s.id)}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.connected ? "bg-green-400" : "bg-red-400"}`} />
            <span className="truncate max-w-[100px]">{s.name}</span>
            {sessions.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(s.id);
                }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded hover:bg-blue-700 text-blue-400 hover:text-white transition-colors text-[10px]"
                title="Cerrar terminal"
              >
                x
              </button>
            )}
          </div>
        ))}

        {/* New terminal button */}
        <button
          onClick={() => createSession()}
          className="p-1 rounded hover:bg-blue-800/50 text-blue-400 hover:text-white transition-colors shrink-0"
          title="Nueva terminal"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>

        <div className="w-px h-4 bg-blue-700 mx-1 shrink-0" />

        {/* Claude button */}
        <button
          onClick={() => sendToActive("claude --dangerously-skip-permissions\n")}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded bg-[#d97706] hover:bg-[#b45309] text-white transition-colors shrink-0"
          title="Ejecutar Claude Code"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-3H8.5L13 7.5v3H15.5L11 17.5z" />
          </svg>
          Claude
        </button>

        {/* Codex button */}
        <button
          onClick={() => sendToActive("codex --full-auto\n")}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded bg-[#10a37f] hover:bg-[#0d8c6d] text-white transition-colors shrink-0"
          title="Ejecutar OpenAI Codex"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.5.5a6.046 6.046 0 00-5.77 4.17 6.046 6.046 0 00-4.05 2.928 6.065 6.065 0 00.745 7.097 5.98 5.98 0 00.516 4.911 6.046 6.046 0 006.51 2.9 6.065 6.065 0 004.55 1.995 6.046 6.046 0 005.77-4.17 6.046 6.046 0 004.05-2.929 6.065 6.065 0 00-.745-7.097zM12.5 21.654a4.476 4.476 0 01-2.876-1.042l.143-.082 4.779-2.758a.795.795 0 00.395-.678v-6.737l2.02 1.166a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.5 4.496zM3.654 17.65a4.474 4.474 0 01-.535-3.014l.143.085 4.779 2.758a.78.78 0 00.79 0l5.83-3.366v2.332a.08.08 0 01-.033.063L9.83 19.318a4.504 4.504 0 01-6.176-1.668zM2.34 8.264a4.474 4.474 0 012.341-1.97V11.9a.775.775 0 00.395.677l5.83 3.366-2.02 1.166a.08.08 0 01-.065.007l-4.797-2.77A4.504 4.504 0 012.34 8.264zm16.596 3.858l-5.83-3.366 2.02-1.165a.08.08 0 01.065-.008l4.797 2.77a4.504 4.504 0 01-.695 8.107V12.8a.79.79 0 00-.396-.678zm2.01-3.023l-.143-.085-4.779-2.758a.78.78 0 00-.79 0l-5.83 3.366V7.29a.08.08 0 01.033-.063l4.797-2.77a4.504 4.504 0 016.713 4.64zm-12.64 4.135l-2.02-1.166a.071.071 0 01-.038-.052V6.433a4.504 4.504 0 017.376-3.453l-.143.082-4.779 2.758a.795.795 0 00-.395.677v6.737zm1.097-2.365l2.596-1.5 2.596 1.5v2.999l-2.596 1.5-2.596-1.5z" />
          </svg>
          Codex
        </button>

        <div className="flex-1" />

        {/* Reconnect active terminal */}
        <button
          onClick={() => {
            const session = sessionsRef.current.find((s) => s.id === activeId);
            if (session) connectSession(session);
          }}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors shrink-0"
          title="Reconectar terminal activa"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reconectar
        </button>
      </div>

      {/* Terminal containers — all mounted, visibility toggled via display */}
      <div ref={wrapperRef} className="flex-1 min-h-0 relative" />
    </div>
  );
});
