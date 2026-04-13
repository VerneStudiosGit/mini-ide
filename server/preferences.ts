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

interface PreferencesConfig {
  voiceNote: VoiceNoteSettings;
  browserHomeUrl: string;
}

interface PublicPreferences {
  voiceNote: {
    enabled: boolean;
    hasApiKey: boolean;
  };
  browserHomeUrl: string;
}

const DEFAULT_PREFERENCES: PreferencesConfig = {
  voiceNote: {
    enabled: false,
    encryptedApiKey: null,
  },
  browserHomeUrl: DEFAULT_BROWSER_HOME_URL,
};

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
    };
  } catch {
    return {
      voiceNote: {
        enabled: DEFAULT_PREFERENCES.voiceNote.enabled,
        encryptedApiKey: DEFAULT_PREFERENCES.voiceNote.encryptedApiKey,
      },
      browserHomeUrl: DEFAULT_PREFERENCES.browserHomeUrl,
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
