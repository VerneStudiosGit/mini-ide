import { randomUUID } from "crypto";
import { RawData, WebSocket } from "ws";
import * as pty from "node-pty";

interface TerminalSession {
  id: string;
  name: string;
  token: string;
  ptyProcess: pty.IPty;
  clients: Set<WebSocket>;
  closed: boolean;
}

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

function createSession(token: string, name?: string): TerminalSession {
  const shell = process.env.SHELL || "/bin/bash";
  const dataDir = process.env.DATA_DIR || "/";
  const id = randomUUID();

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

  const session: TerminalSession = {
    id,
    name: name || `Terminal ${id.slice(0, 6)}`,
    token,
    ptyProcess,
    clients: new Set(),
    closed: false,
  };

  ptyProcess.onData((data: string) => {
    broadcast(session, { type: "output", data });
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    session.closed = true;
    broadcast(session, { type: "session_closed", exitCode, signal });
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) client.close();
    }
    session.clients.clear();
    removeSession(session);
  });

  getUserSessions(token).set(session.id, session);
  broadcastSessionsForToken(token);
  return session;
}

function destroySession(session: TerminalSession): void {
  if (session.closed) return;
  session.closed = true;
  try {
    session.ptyProcess.kill();
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
  sendJson(ws, {
    type: "sessions_sync",
    sessions: listSessionsForToken(token),
  });

  ws.on("message", (raw: RawData) => {
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
        session.ptyProcess.write(msg.data || "");
        return;
      }
      if (msg.type === "resize") {
        session.ptyProcess.resize(Math.max(1, msg.cols || 80), Math.max(1, msg.rows || 24));
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
      session.ptyProcess.write(rawText);
    }
  });

  ws.on("close", () => {
    session.clients.delete(ws);
  });

  ws.on("error", () => {
    session.clients.delete(ws);
  });
}
