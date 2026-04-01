import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";

export const authRouter = Router();

const AUTH_USERNAME = process.env.AUTH_USERNAME || "admin";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "admin";
const AUTH_COOKIE_NAME = "mini_ide_token";

// Simple token: hash of username+password so it's consistent across restarts
const VALID_TOKEN = crypto
  .createHash("sha256")
  .update(`${AUTH_USERNAME}:${AUTH_PASSWORD}`)
  .digest("hex");

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    res.cookie(AUTH_COOKIE_NAME, VALID_TOKEN, {
      sameSite: "lax",
      httpOnly: false,
      secure: false,
      path: "/",
    });
    res.json({ ok: true, token: VALID_TOKEN });
  } else {
    res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
  }
});

function getCookieToken(cookieHeader: string | undefined): string {
  if (!cookieHeader) return "";
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.trim().split("=");
    if (rawName === AUTH_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return "";
}

export function getTokenFromAuthSources(
  authorizationHeader: string | undefined,
  cookieHeader: string | undefined,
  tokenFromQuery = ""
): string {
  const bearerToken = authorizationHeader?.replace("Bearer ", "") || "";
  const cookieToken = getCookieToken(cookieHeader);
  return bearerToken || tokenFromQuery || cookieToken;
}

// Middleware to protect routes
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromAuthSources(
    req.headers.authorization,
    req.headers.cookie,
    (req.query.token as string) || ""
  );
  if (token === VALID_TOKEN) {
    next();
  } else {
    res.status(401).json({ error: "No autorizado" });
  }
}

// Validate token for WebSocket connections
export function isValidToken(token: string): boolean {
  return token === VALID_TOKEN;
}
