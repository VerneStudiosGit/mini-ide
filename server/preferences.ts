import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Router } from "express";
import { requireAuth } from "./auth";
import { getDataDir } from "./dataDir";

export const preferencesRouter = Router();

const DATA_DIR = getDataDir();
const PREFERENCES_DIR = path.join(DATA_DIR, ".mini-ide");
const PREFERENCES_PATH = path.join(PREFERENCES_DIR, "preferences.json");
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const DEFAULT_BROWSER_HOME_URL = "https://example.com/";

interface VoiceNoteSettings {
  enabled: boolean;
  encryptedApiKey: string | null;
}

interface ThemeSettings {
  bg: string;
  panel: string;
  panelSoft: string;
  panelHover: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
}

interface StartupSettings {
  enabled: boolean;
  aptUpdate: boolean;
  aptUpgrade: boolean;
  aptPackages: string[];
  commands: string;
}

interface PreferencesConfig {
  voiceNote: VoiceNoteSettings;
  browserHomeUrl: string;
  theme: ThemeSettings;
  startup: StartupSettings;
}

interface PublicPreferences {
  voiceNote: {
    enabled: boolean;
    hasApiKey: boolean;
  };
  browserHomeUrl: string;
  theme: ThemeSettings;
  startup: StartupSettings;
}

const DEFAULT_THEME: ThemeSettings = {
  bg: "#0a0a0b",
  panel: "#121214",
  panelSoft: "#1a1a1d",
  panelHover: "#242429",
  border: "#34343a",
  text: "#f5f5f5",
  muted: "#b9b9c2",
  accent: "#52525b",
  accentHover: "#3f3f46",
};

const DEFAULT_PREFERENCES: PreferencesConfig = {
  voiceNote: {
    enabled: false,
    encryptedApiKey: null,
  },
  browserHomeUrl: DEFAULT_BROWSER_HOME_URL,
  theme: DEFAULT_THEME,
  startup: {
    enabled: false,
    aptUpdate: true,
    aptUpgrade: false,
    aptPackages: [],
    commands: "",
  },
};

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function normalizeTheme(raw: Partial<ThemeSettings> | null | undefined): ThemeSettings {
  return {
    bg: isHexColor(raw?.bg) ? raw.bg : DEFAULT_THEME.bg,
    panel: isHexColor(raw?.panel) ? raw.panel : DEFAULT_THEME.panel,
    panelSoft: isHexColor(raw?.panelSoft) ? raw.panelSoft : DEFAULT_THEME.panelSoft,
    panelHover: isHexColor(raw?.panelHover) ? raw.panelHover : DEFAULT_THEME.panelHover,
    border: isHexColor(raw?.border) ? raw.border : DEFAULT_THEME.border,
    text: isHexColor(raw?.text) ? raw.text : DEFAULT_THEME.text,
    muted: isHexColor(raw?.muted) ? raw.muted : DEFAULT_THEME.muted,
    accent: isHexColor(raw?.accent) ? raw.accent : DEFAULT_THEME.accent,
    accentHover: isHexColor(raw?.accentHover) ? raw.accentHover : DEFAULT_THEME.accentHover,
  };
}

function isValidAptPackageName(value: string): boolean {
  return /^[a-z0-9][a-z0-9+.-]*$/i.test(value);
}

function normalizeStartup(raw: Partial<StartupSettings> | null | undefined): StartupSettings {
  const aptPackages = Array.isArray(raw?.aptPackages)
    ? raw.aptPackages
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && isValidAptPackageName(item))
    : [];

  return {
    enabled: Boolean(raw?.enabled),
    aptUpdate: raw?.aptUpdate === undefined ? DEFAULT_PREFERENCES.startup.aptUpdate : Boolean(raw.aptUpdate),
    aptUpgrade: Boolean(raw?.aptUpgrade),
    aptPackages: Array.from(new Set(aptPackages)).slice(0, 120),
    commands: typeof raw?.commands === "string" ? raw.commands.slice(0, 12000) : "",
  };
}

function getEncryptionKey(): Buffer {
  const basis =
    process.env.PREFERENCES_ENCRYPTION_SECRET ||
    `${process.env.AUTH_USERNAME || "admin"}:${process.env.AUTH_PASSWORD || "admin"}:${DATA_DIR}`;
  return crypto.createHash("sha256").update(basis).digest();
}

function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptSecret(payload: string | null): string | null {
  if (!payload) return null;
  const [version, ivBase64, tagBase64, encryptedBase64] = payload.split(":");
  if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivBase64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf-8");
  } catch {
    return null;
  }
}

async function ensureDir() {
  await fs.mkdir(PREFERENCES_DIR, { recursive: true });
}

async function loadPreferences(): Promise<PreferencesConfig> {
  try {
    const raw = await fs.readFile(PREFERENCES_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PreferencesConfig>;
    return {
      voiceNote: {
        enabled: Boolean(parsed.voiceNote?.enabled),
        encryptedApiKey: parsed.voiceNote?.encryptedApiKey || null,
      },
      browserHomeUrl:
        typeof parsed.browserHomeUrl === "string" && parsed.browserHomeUrl.trim()
          ? parsed.browserHomeUrl
          : DEFAULT_PREFERENCES.browserHomeUrl,
      theme: normalizeTheme(parsed.theme),
      startup: normalizeStartup(parsed.startup),
    };
  } catch {
    return {
      voiceNote: {
        enabled: DEFAULT_PREFERENCES.voiceNote.enabled,
        encryptedApiKey: DEFAULT_PREFERENCES.voiceNote.encryptedApiKey,
      },
      browserHomeUrl: DEFAULT_PREFERENCES.browserHomeUrl,
      theme: DEFAULT_THEME,
      startup: DEFAULT_PREFERENCES.startup,
    };
  }
}

async function savePreferences(config: PreferencesConfig) {
  await ensureDir();
  await fs.writeFile(PREFERENCES_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function toPublicPreferences(config: PreferencesConfig): PublicPreferences {
  return {
    voiceNote: {
      enabled: config.voiceNote.enabled,
      hasApiKey: Boolean(config.voiceNote.encryptedApiKey),
    },
    browserHomeUrl: config.browserHomeUrl,
    theme: config.theme,
    startup: config.startup,
  };
}

function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

preferencesRouter.get("/", requireAuth, async (_req, res) => {
  try {
    const preferences = await loadPreferences();
    res.json(toPublicPreferences(preferences));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

preferencesRouter.put("/voice-note", requireAuth, async (req, res) => {
  try {
    const { enabled, apiKey } = req.body as {
      enabled?: unknown;
      apiKey?: unknown;
    };

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    if (apiKey !== undefined && typeof apiKey !== "string") {
      return res.status(400).json({ error: "apiKey must be a string when provided" });
    }

    const preferences = await loadPreferences();
    const nextApiKey = typeof apiKey === "string" ? apiKey.trim() : null;

    if (typeof apiKey === "string") {
      preferences.voiceNote.encryptedApiKey = nextApiKey ? encryptSecret(nextApiKey) : null;
    }

    if (enabled && !preferences.voiceNote.encryptedApiKey) {
      return res.status(400).json({ error: "Debes guardar un OpenAI API key antes de activar Voice Note." });
    }

    preferences.voiceNote.enabled = enabled;
    await savePreferences(preferences);
    res.json({ ok: true, preferences: toPublicPreferences(preferences) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

preferencesRouter.put("/browser-home-url", requireAuth, async (req, res) => {
  try {
    const { homeUrl } = req.body as {
      homeUrl?: unknown;
    };

    if (typeof homeUrl !== "string") {
      return res.status(400).json({ error: "homeUrl must be a string" });
    }

    const nextHomeUrl = homeUrl.trim() || DEFAULT_BROWSER_HOME_URL;

    const preferences = await loadPreferences();
    preferences.browserHomeUrl = nextHomeUrl;
    await savePreferences(preferences);
    res.json({ ok: true, preferences: toPublicPreferences(preferences) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

preferencesRouter.put("/theme", requireAuth, async (req, res) => {
  try {
    const { theme } = req.body as {
      theme?: unknown;
    };

    if (typeof theme !== "object" || theme === null) {
      return res.status(400).json({ error: "theme must be an object" });
    }

    const preferences = await loadPreferences();
    preferences.theme = normalizeTheme(theme as Partial<ThemeSettings>);
    await savePreferences(preferences);
    res.json({ ok: true, preferences: toPublicPreferences(preferences) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

preferencesRouter.put("/startup", requireAuth, async (req, res) => {
  try {
    const { startup } = req.body as {
      startup?: unknown;
    };

    if (typeof startup !== "object" || startup === null) {
      return res.status(400).json({ error: "startup must be an object" });
    }

    const normalized = normalizeStartup(startup as Partial<StartupSettings>);
    if (normalized.aptPackages.length === 0 && normalized.commands.trim() === "" && normalized.enabled) {
      return res.status(400).json({
        error: "Activa Startup solo cuando tengas paquetes apt o comandos configurados.",
      });
    }

    const preferences = await loadPreferences();
    preferences.startup = normalized;
    await savePreferences(preferences);
    res.json({ ok: true, preferences: toPublicPreferences(preferences) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

preferencesRouter.post("/voice-note/transcribe", requireAuth, async (req, res) => {
  try {
    const { audioBase64, mimeType, fileName } = req.body as {
      audioBase64?: unknown;
      mimeType?: unknown;
      fileName?: unknown;
    };

    if (typeof audioBase64 !== "string" || !audioBase64.trim()) {
      return res.status(400).json({ error: "audioBase64 is required" });
    }

    if (typeof mimeType !== "string" || !mimeType.trim()) {
      return res.status(400).json({ error: "mimeType is required" });
    }

    const preferences = await loadPreferences();
    if (!preferences.voiceNote.enabled) {
      return res.status(400).json({ error: "Voice Note no esta activado." });
    }

    const apiKey = decryptSecret(preferences.voiceNote.encryptedApiKey);
    if (!apiKey) {
      return res.status(400).json({ error: "No hay un OpenAI API key valido guardado." });
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (!audioBuffer.length) {
      return res.status(400).json({ error: "El audio esta vacio." });
    }
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: "La nota de voz es demasiado grande." });
    }

    const resolvedFileName =
      typeof fileName === "string" && fileName.trim()
        ? fileName.trim()
        : `voice-note.${getExtensionFromMimeType(mimeType)}`;

    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([audioBuffer], { type: mimeType }), resolvedFileName);

    const upstream = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message =
        (payload as { error?: { message?: string } } | null)?.error?.message ||
        "No se pudo transcribir la nota de voz.";
      return res.status(502).json({ error: message });
    }

    const text = typeof (payload as { text?: unknown } | null)?.text === "string"
      ? ((payload as { text: string }).text || "").trim()
      : "";

    if (!text) {
      return res.status(502).json({ error: "La transcripcion llego vacia." });
    }

    res.json({ ok: true, text });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
