import { Request, Response } from "express";
import http, { IncomingHttpHeaders } from "http";
import net from "net";
import { URL } from "url";

const PREVIEW_PREFIX = "/_preview";
const LOOPBACK_HOST = "127.0.0.1";

const allowedPorts = new Set<number>(
  (process.env.PREVIEW_ALLOWED_PORTS || "")
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535)
);

function isAllowedPort(port: number): boolean {
  if (allowedPorts.size === 0) return true;
  return allowedPorts.has(port);
}

export function parsePreviewPort(rawPort: string): number | null {
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  if (!isAllowedPort(port)) return null;
  return port;
}

function getForwardPath(url: string, port: number): string {
  const prefix = `${PREVIEW_PREFIX}/${port}`;
  const forwardPath = url.startsWith(prefix) ? url.slice(prefix.length) : url;
  if (!forwardPath) return "/";
  if (forwardPath.startsWith("?")) return `/${forwardPath}`;
  return forwardPath;
}

function rewriteLocationHeader(location: string, port: number): string {
  try {
    if (location.startsWith("/")) {
      return `${PREVIEW_PREFIX}/${port}${location}`;
    }

    const parsed = new URL(location);
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const samePort = Number(parsed.port || 80) === port;

    if (isLocalhost && samePort) {
      const search = parsed.search || "";
      const hash = parsed.hash || "";
      return `${PREVIEW_PREFIX}/${port}${parsed.pathname}${search}${hash}`;
    }

    return location;
  } catch {
    return location;
  }
}

function toNodeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const nextHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    nextHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return nextHeaders;
}

function sanitizeProxyResponseHeaders(
  headers: http.IncomingHttpHeaders,
  port: number,
  rewroteBody: boolean
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    const normalized = key.toLowerCase();
    if (normalized === "x-frame-options") continue;
    if (normalized === "content-security-policy") continue;
    if (normalized === "content-length" && rewroteBody) continue;

    if (normalized === "location") {
      const locationValue = Array.isArray(value) ? value[0] : value;
      sanitized[key] = rewriteLocationHeader(locationValue, port);
      continue;
    }

    sanitized[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return sanitized;
}

function rewriteHtmlBody(rawHtml: string, port: number): string {
  const baseTag = `<base href="${PREVIEW_PREFIX}/${port}/">`;
  const withBase = rawHtml.replace(/<head(\s[^>]*)?>/i, (fullTag) => `${fullTag}${baseTag}`);

  return withBase
    .replace(/(src|href|action)=("|')\//g, `$1=$2${PREVIEW_PREFIX}/${port}/`)
    .replace(/fetch\(\s*("|')\//g, `fetch($1${PREVIEW_PREFIX}/${port}/`)
    .replace(/location\.href\s*=\s*("|')\//g, `location.href=$1${PREVIEW_PREFIX}/${port}/`);
}

function rewriteJavaScriptBody(rawJs: string, port: number): string {
  const prefix = `${PREVIEW_PREFIX}/${port}/`;
  return rawJs
    .replace(/(\bimport\s+(?:[^"'`]*?\s+from\s+)?["'])\//g, `$1${prefix}`)
    .replace(/(\bexport\s+[^"'`]*?\s+from\s+["'])\//g, `$1${prefix}`)
    .replace(/(\bimport\(\s*["'])\//g, `$1${prefix}`)
    .replace(/(\bfetch\(\s*["'])\//g, `$1${prefix}`)
    .replace(/(\bnew\s+URL\(\s*["'])\//g, `$1${prefix}`)
    .replace(/(\bnew\s+WebSocket\(\s*["'])\//g, `$1${prefix}`)
    .replace(/(\bnew\s+EventSource\(\s*["'])\//g, `$1${prefix}`);
}

function rewriteCssBody(rawCss: string, port: number): string {
  const prefix = `${PREVIEW_PREFIX}/${port}/`;
  return rawCss
    .replace(/(url\(\s*["']?)\//g, `$1${prefix}`)
    .replace(/(@import\s+["'])\//g, `$1${prefix}`);
}

export function previewHttpProxy(req: Request, res: Response): void {
  const rawPort = Array.isArray(req.params.port) ? req.params.port[0] : req.params.port;
  const port = parsePreviewPort(rawPort || "");
  if (!port) {
    res.status(400).json({ error: "Puerto invalido o no permitido" });
    return;
  }

  const forwardPath = getForwardPath(req.originalUrl, port);
  const proxyHeaders = toNodeHeaders(req.headers);
  proxyHeaders.host = `localhost:${port}`;
  proxyHeaders["x-forwarded-host"] = req.headers.host || "";
  proxyHeaders["x-forwarded-proto"] = req.protocol;
  proxyHeaders["x-forwarded-for"] = req.ip || "";
  proxyHeaders["accept-encoding"] = "identity";

  const proxyReq = http.request(
    {
      host: LOOPBACK_HOST,
      port,
      method: req.method,
      path: forwardPath,
      headers: proxyHeaders,
      timeout: 15000,
    },
    (proxyRes) => {
      const contentType = proxyRes.headers["content-type"] || "";
      const isHtml = typeof contentType === "string" && contentType.includes("text/html");
      const isJavaScript =
        typeof contentType === "string" &&
        (contentType.includes("javascript") || contentType.includes("ecmascript"));
      const isCss = typeof contentType === "string" && contentType.includes("text/css");

      if (isHtml) {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        proxyRes.on("end", () => {
          const html = Buffer.concat(chunks).toString("utf8");
          const rewritten = rewriteHtmlBody(html, port);
          const responseHeaders = sanitizeProxyResponseHeaders(proxyRes.headers, port, true);
          res.writeHead(proxyRes.statusCode || 200, responseHeaders);
          res.end(rewritten);
        });
        return;
      }

      if (isJavaScript || isCss) {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        proxyRes.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const rewritten = isJavaScript ? rewriteJavaScriptBody(raw, port) : rewriteCssBody(raw, port);
          const responseHeaders = sanitizeProxyResponseHeaders(proxyRes.headers, port, true);
          res.writeHead(proxyRes.statusCode || 200, responseHeaders);
          res.end(rewritten);
        });
        return;
      }

      const responseHeaders = sanitizeProxyResponseHeaders(proxyRes.headers, port, false);
      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: `Timeout conectando al puerto ${port}` });
    }
  });

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.status(502).json({ error: `No se pudo conectar al puerto ${port}` });
    }
  });

  req.pipe(proxyReq);
}

function buildUpstreamRequestHeaders(headers: IncomingHttpHeaders, port: number): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const normalized = key.toLowerCase();
    if (normalized === "host") {
      lines.push(`Host: localhost:${port}`);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`${key}: ${item}`);
      continue;
    }
    lines.push(`${key}: ${value}`);
  }
  return lines.join("\r\n");
}

function closeSocket(socket: net.Socket): void {
  if (!socket.destroyed) socket.destroy();
}

export function proxyPreviewWebSocket(
  req: http.IncomingMessage,
  clientSocket: net.Socket,
  head: Buffer
): boolean {
  const reqUrl = req.url || "/";
  const parsed = new URL(reqUrl, `http://${req.headers.host || "localhost"}`);
  const match = parsed.pathname.match(/^\/_preview\/(\d+)(?:\/|$)/);
  if (!match) return false;

  const port = parsePreviewPort(match[1]);
  if (!port) {
    clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    closeSocket(clientSocket);
    return true;
  }

  const forwardPath = getForwardPath(reqUrl, port);
  const upstream = net.connect(port, LOOPBACK_HOST, () => {
    const headerLines = buildUpstreamRequestHeaders(req.headers, port);
    upstream.write(`GET ${forwardPath} HTTP/1.1\r\n${headerLines}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });

  upstream.on("error", () => {
    if (!clientSocket.destroyed) {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    }
    closeSocket(clientSocket);
  });

  clientSocket.on("error", () => closeSocket(upstream));
  clientSocket.on("close", () => closeSocket(upstream));
  upstream.on("close", () => closeSocket(clientSocket));

  return true;
}
