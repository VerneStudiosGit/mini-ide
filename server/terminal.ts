import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { RawData, WebSocket } from "ws";
import * as pty from "node-pty";
import { getDataDir } from "./dataDir";

interface ShellExitInfo {
  exitCode: number | null;
  signal: number | null;
}

interface ShellProcess {
  mode: "pty" | "fallback";
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (info: ShellExitInfo) => void) => void;
}

interface TerminalSession {
  id: string;
  name: string;
  token: string;
  shellProcess: ShellProcess;
  clients: Set<WebSocket>;
  closed: boolean;
  scrollback: Buffer[];
  scrollbackBytes: number;
}

const SCROLLBACK_LIMIT = 256 * 1024; // 256 KB per session
const IS_RAILWAY =
  Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) ||
  Boolean(process.env.RAILWAY_SERVICE_NAME);
const ALLOW_TERMINAL_FALLBACK =
  process.env.TERMINAL_FALLBACK_MODE === "1" || !IS_RAILWAY;

interface SpawnTerminalOptions {
  token: string;
  sessionId?: string;
  name?: string;
}

const sessionsByToken = new Map<string, Map<string, TerminalSession>>();

function getUserSessions(token: string): Map<string, TerminalSession> {
  let userSessions = sessionsByToken.get(token);
  if (!userSessions) {
    userSessions = new Map<string, TerminalSession>();
    sessionsByToken.set(token, userSessions);
  }
  return userSessions;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function broadcast(session: TerminalSession, payload: unknown): void {
  for (const client of session.clients) {
    sendJson(client, payload);
  }
}

function removeSession(session: TerminalSession): void {
  const userSessions = sessionsByToken.get(session.token);
  userSessions?.delete(session.id);
  broadcastSessionsForToken(session.token);
  if (userSessions && userSessions.size === 0) {
    sessionsByToken.delete(session.token);
  }
}

function listSessionsForToken(token: string): Array<{ id: string; name: string }> {
  const sessions = sessionsByToken.get(token);
  if (!sessions) return [];
  return Array.from(sessions.values()).map((session) => ({
    id: session.id,
    name: session.name,
  }));
}

function broadcastSessionsForToken(token: string): void {
  const userSessions = sessionsByToken.get(token);
  if (!userSessions) return;

  const uniqueClients = new Set<WebSocket>();
  for (const session of userSessions.values()) {
    for (const client of session.clients) {
      uniqueClients.add(client);
    }
  }

  const payload = {
    type: "sessions_sync",
    sessions: listSessionsForToken(token),
  };
  for (const client of uniqueClients) {
    sendJson(client, payload);
  }
}

function createPtyProcess(shell: string, dataDir: string): ShellProcess {
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: dataDir,
    env: {
      ...(process.env as Record<string, string>),
      HOME: process.env.HOME || `/home/${process.env.USER || "mini-ide"}`,
    },
  });

  return {
    mode: "pty",
    write: (data) => ptyProcess.write(data),
    resize: (cols, rows) => ptyProcess.resize(cols, rows),
    kill: () => ptyProcess.kill(),
    onData: (callback) => ptyProcess.onData(callback),
    onExit: (callback) =>
      ptyProcess.onExit(({ exitCode, signal }) => {
        callback({ exitCode, signal: signal ?? null });
      }),
  };
}

function createFallbackProcess(shell: string, dataDir: string): ShellProcess {
  const child = spawn(shell, [], {
    cwd: dataDir,
    env: {
      ...(process.env as Record<string, string>),
      TERM: "xterm-256color",
      HOME: process.env.HOME || `/home/${process.env.USER || "mini-ide"}`,
    },
    stdio: "pipe",
  });

  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(info: ShellExitInfo) => void>();

  child.stdout?.on("data", (chunk: Buffer | string) => {
    const data = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    for (const listener of dataListeners) listener(data);
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    const data = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    for (const listener of dataListeners) listener(data);
  });
  child.on("close", (exitCode, signal) => {
    const numericSignal = typeof signal === "string" ? null : signal;
    for (const listener of exitListeners) listener({ exitCode, signal: numericSignal });
  });

  return {
    mode: "fallback",
    write: (data) => {
      child.stdin?.write(data);
    },
    resize: () => {
      // No-op: stdio pipes don't expose terminal resizing.
    },
    kill: () => {
      child.kill();
    },
    onData: (callback) => {
      dataListeners.add(callback);
    },
    onExit: (callback) => {
      exitListeners.add(callback);
    },
  };
}

function createShellProcess(shell: string, dataDir: string): ShellProcess {
  try {
    return createPtyProcess(shell, dataDir);
  } catch (err) {
    if (!ALLOW_TERMINAL_FALLBACK) {
      console.error(`[terminal] pty.spawn failed (shell=${shell}, cwd=${dataDir}):`, err);
      throw err;
    }
    console.warn(`[terminal] node-pty unavailable, falling back to child_process (shell=${shell}, cwd=${dataDir})`);
    return createFallbackProcess(shell, dataDir);
  }
}

function createSession(token: string, name?: string): TerminalSession {
  const shell = process.env.SHELL || "/bin/bash";
  const dataDir = getDataDir();
  const id = randomUUID();

  const shellProcess = createShellProcess(shell, dataDir);

  const session: TerminalSession = {
    id,
    name: name || `Terminal ${id.slice(0, 6)}`,
    token,
    shellProcess,
    clients: new Set(),
    closed: false,
    scrollback: [],
    scrollbackBytes: 0,
  };

  if (shellProcess.mode === "fallback" && session.scrollback.length === 0) {
    const banner = Buffer.from(
      `[Terminal fallback mode]\r\nPTY no disponible en este entorno. Ejecutando shell por pipes.\r\nCWD: ${dataDir}\r\n\r\n`,
      "utf-8"
    );
    session.scrollback.push(banner);
    session.scrollbackBytes += banner.length;
  }

  shellProcess.onData((data: string) => {
    const buf = Buffer.from(data, "utf-8");
    // Keep a rolling scrollback so reconnects/attaches can replay
    // the last ~256KB of output (shell prompt, in-progress TUI frame, etc.).
    session.scrollback.push(buf);
    session.scrollbackBytes += buf.length;
    while (session.scrollbackBytes > SCROLLBACK_LIMIT && session.scrollback.length > 1) {
      const dropped = session.scrollback.shift()!;
      session.scrollbackBytes -= dropped.length;
    }
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(buf, { binary: true, compress: false });
      }
    }
  });

  shellProcess.onExit(({ exitCode, signal }) => {
    session.closed = true;
    broadcast(session, { type: "session_closed", exitCode, signal });
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) client.close();
    }
    session.clients.clear();
    removeSession(session);
  });

  getUserSessions(token).set(session.id, session);
  return session;
}

function destroySession(session: TerminalSession): void {
  if (session.closed) return;
  session.closed = true;
  try {
    session.shellProcess.kill();
  } catch {
    // ignore
  }
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      sendJson(client, { type: "session_closed", exitCode: null, signal: null });
      client.close();
    }
  }
  session.clients.clear();
  removeSession(session);
}

export function listTerminalSessions(token: string): Array<{ id: string; name: string }> {
  return listSessionsForToken(token);
}

export function closeTerminalSession(token: string, sessionId: string): boolean {
  const sessions = sessionsByToken.get(token);
  if (!sessions) return false;
  const session = sessions.get(sessionId);
  if (!session) return false;
  destroySession(session);
  return true;
}

export function spawnTerminal(ws: WebSocket, options: SpawnTerminalOptions): void {
  const { token, sessionId, name } = options;
  const userSessions = getUserSessions(token);
  const existingSession = sessionId ? userSessions.get(sessionId) : undefined;
  const session = existingSession || createSession(token, name);
  const reconnected = Boolean(existingSession);

  if (name && session.name !== name) {
    session.name = name;
    broadcastSessionsForToken(token);
  }

  session.clients.add(ws);
  sendJson(ws, {
    type: "session_meta",
    sessionId: session.id,
    name: session.name,
    reconnected,
  });
  // Replay scrollback so a newly-attached client doesn't see a black
  // screen when reconnecting to an existing pty. Strip terminal queries
  // (Device Attributes, Device Status Report) so xterm.js doesn't
  // re-answer them on replay — those answers would land in the shell
  // as stray input like "1;2c".
  if (session.scrollback.length > 0 && ws.readyState === WebSocket.OPEN) {
    const replay = Buffer.concat(session.scrollback, session.scrollbackBytes)
      .toString("utf-8")
      // CSI ... c  → Device Attributes query (primary/secondary/tertiary)
      .replace(/\x1b\[[\?>=]?[0-9;]*c/g, "")
      // CSI ... n  → Device Status Report query
      .replace(/\x1b\[[0-9;]*n/g, "");
    ws.send(Buffer.from(replay, "utf-8"), { binary: true, compress: false });
  }
  // Broadcast AFTER session_meta so the new client has assigned its
  // serverSessionId before any other client's reconcile runs.
  if (!existingSession) {
    broadcastSessionsForToken(token);
  } else {
    sendJson(ws, {
      type: "sessions_sync",
      sessions: listSessionsForToken(token),
    });
  }

  ws.on("message", (raw: RawData, isBinary: boolean) => {
    // Hot path: binary frames are raw pty input. Skip JSON entirely.
    if (isBinary) {
      const buf = Buffer.isBuffer(raw)
        ? raw
        : Array.isArray(raw)
        ? Buffer.concat(raw)
        : Buffer.from(raw as ArrayBuffer);
      session.shellProcess.write(buf.toString("utf-8"));
      return;
    }
    const rawText =
      typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
        ? raw.toString()
        : Array.isArray(raw)
        ? Buffer.concat(raw).toString()
        : Buffer.from(raw).toString();
    try {
      const msg = JSON.parse(rawText);
      if (msg.type === "input") {
        session.shellProcess.write(msg.data || "");
        return;
      }
      if (msg.type === "resize") {
        session.shellProcess.resize(Math.max(1, msg.cols || 80), Math.max(1, msg.rows || 24));
        return;
      }
      if (msg.type === "close_session") {
        destroySession(session);
        return;
      }
      if (msg.type === "rename_session") {
        const nextName = String(msg.name || "").trim();
        if (nextName) {
          session.name = nextName;
          broadcastSessionsForToken(token);
        }
        return;
      }
    } catch {
      session.shellProcess.write(rawText);
    }
  });

  const dropClient = () => {
    session.clients.delete(ws);
  };
  ws.on("close", dropClient);
  ws.on("error", dropClient);
}
