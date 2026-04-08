import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { spawnTerminal, listTerminalSessions, closeTerminalSession } from "./terminal";
import { filesystemRouter } from "./filesystem";
import { authRouter, requireAuth, isValidToken, getTokenFromAuthSources } from "./auth";
import { brandingRouter, generateManifest } from "./branding";
import { previewHttpProxy, proxyPreviewWebSocket } from "./previewProxy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Auth routes (public)
app.use("/api/auth", authRouter);

// Protected API routes
app.use("/api/fs", requireAuth, filesystemRouter);
app.get("/api/terminal/sessions", requireAuth, (req, res) => {
  const token = getTokenFromAuthSources(
    req.headers.authorization,
    req.headers.cookie,
    (req.query.token as string) || ""
  );
  if (!isValidToken(token)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  res.json({ ok: true, sessions: listTerminalSessions(token) });
});
app.delete("/api/terminal/sessions/:sessionId", requireAuth, (req, res) => {
  const token = getTokenFromAuthSources(
    req.headers.authorization,
    req.headers.cookie,
    (req.query.token as string) || ""
  );
  if (!isValidToken(token)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  const closed = closeTerminalSession(token, req.params.sessionId);
  res.json({ ok: true, closed });
});

// Branding routes (public reads, auth-protected writes)
app.use("/api/branding", brandingRouter);

// Internal preview proxy for local ports
app.use("/_preview/:port", requireAuth, previewHttpProxy);

// Serve client static files in production
const clientDist = path.join(__dirname, "../client/dist");

// Dynamic manifest (must come before static middleware)
app.get("/manifest.json", async (_req, res) => {
  try {
    const manifest = await generateManifest();
    res.json(manifest);
  } catch {
    res.sendFile(path.join(clientDist, "manifest.json"));
  }
});
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// WebSocket server for terminal — check token from query param
const wss = new WebSocketServer({
  server,
  path: "/ws/terminal",
  perMessageDeflate: false,
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token") || "";

  if (!isValidToken(token)) {
    ws.close(1008, "No autorizado");
    return;
  }

  try {
    spawnTerminal(ws, {
      token,
      sessionId: url.searchParams.get("sessionId") || undefined,
      name: url.searchParams.get("name") || undefined,
    });
  } catch (err) {
    console.error("[ws] spawnTerminal failed:", err);
    try {
      ws.close(1011, "terminal spawn failed");
    } catch {}
  }
});

server.on("upgrade", (req, socket, head) => {
  const isPreviewPath = (req.url || "").startsWith("/_preview/");
  if (!isPreviewPath) return;

  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = getTokenFromAuthSources(
    req.headers.authorization,
    req.headers.cookie,
    url.searchParams.get("token") || ""
  );
  if (!isValidToken(token)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const handled = proxyPreviewWebSocket(req, socket, head);
  if (!handled) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Editor server running on http://localhost:${PORT}`);
});
