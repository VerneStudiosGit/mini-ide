import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { requireAuth } from "./auth";
import { getDataDir } from "./dataDir";

export const brandingRouter = Router();

const DATA_DIR = getDataDir();
const BRANDING_DIR = path.join(DATA_DIR, ".mini-ide");
const ICON_PATH = path.join(BRANDING_DIR, "icon.png");
const CONFIG_PATH = path.join(BRANDING_DIR, "branding.json");

interface BrandingConfig {
  name: string;
}

async function ensureDir() {
  await fs.mkdir(BRANDING_DIR, { recursive: true });
}

async function loadConfig(): Promise<BrandingConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { name: "mini-ide" };
  }
}

async function saveConfig(config: BrandingConfig) {
  await ensureDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

async function hasCustomIcon(): Promise<boolean> {
  try {
    await fs.access(ICON_PATH);
    return true;
  } catch {
    return false;
  }
}

// GET /api/branding — public info
brandingRouter.get("/", async (_req, res) => {
  try {
    const config = await loadConfig();
    const iconExists = await hasCustomIcon();
    res.json({ name: config.name, hasIcon: iconExists });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/branding/icon — serve custom icon or redirect to default
brandingRouter.get("/icon", async (_req, res) => {
  try {
    const iconExists = await hasCustomIcon();
    if (iconExists) {
      res.sendFile(ICON_PATH);
    } else {
      res.redirect("/icons/icon.svg");
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/branding/icon — upload icon (base64)
brandingRouter.post("/icon", requireAuth, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "data is required" });

    const base64Data = data.replace(/^data:.*?;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 1024 * 1024) {
      return res.status(413).json({ error: "Icon too large (max 1MB)" });
    }

    await ensureDir();
    await fs.writeFile(ICON_PATH, buffer);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/branding/icon — remove custom icon
brandingRouter.delete("/icon", requireAuth, async (_req, res) => {
  try {
    await fs.unlink(ICON_PATH);
    res.json({ ok: true });
  } catch (err: any) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// PUT /api/branding/name — set instance name
brandingRouter.put("/name", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }
    const config = await loadConfig();
    config.name = name.slice(0, 50);
    await saveConfig(config);
    res.json({ ok: true, name: config.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate dynamic manifest
export async function generateManifest(): Promise<object> {
  const config = await loadConfig();
  const iconExists = await hasCustomIcon();

  const icons = iconExists
    ? [
        {
          src: "/api/branding/icon",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ]
    : [
        {
          src: "/icons/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ];

  return {
    name: config.name,
    short_name: config.name,
    description: "Editor web con terminal integrado",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons,
  };
}
