import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { getDataDir } from "./dataDir";

export const filesystemRouter = Router();

// List directory contents
filesystemRouter.get("/list", async (req, res) => {
  try {
    const dirPath = (req.query.path as string) || getDataDir();
    const resolved = path.resolve(dirPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(resolved, entry.name);
        let size = 0;
        let modified = "";
        try {
          const stat = await fs.stat(fullPath);
          size = stat.size;
          modified = stat.mtime.toISOString();
        } catch {
          // skip stat errors
        }
        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? "directory" : "file",
          size,
          modified,
        };
      })
    );

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: resolved, entries: items });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Read file contents (text)
filesystemRouter.get("/read", async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: "path is required" });
    const resolved = path.resolve(filePath);
    const stat = await fs.stat(resolved);

    if (stat.size > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 5MB)" });
    }

    const content = await fs.readFile(resolved, "utf-8");
    res.json({ path: resolved, content, size: stat.size });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Serve raw file (for images and binary preview)
filesystemRouter.get("/raw", async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: "path is required" });
    const resolved = path.resolve(filePath);
    res.sendFile(resolved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Write file contents
filesystemRouter.post("/write", async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: "path is required" });
    const resolved = path.resolve(filePath);
    await fs.writeFile(resolved, content, "utf-8");
    res.json({ ok: true, path: resolved });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Upload file (base64 encoded)
filesystemRouter.post("/upload", async (req, res) => {
  try {
    const { path: filePath, data } = req.body;
    if (!filePath || !data)
      return res.status(400).json({ error: "path and data are required" });
    const resolved = path.resolve(filePath);
    const base64Data = data.replace(/^data:.*?;base64,/, "");
    await fs.writeFile(resolved, Buffer.from(base64Data, "base64"));
    res.json({ ok: true, path: resolved });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Create directory
filesystemRouter.post("/mkdir", async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: "path is required" });
    const resolved = path.resolve(dirPath);
    await fs.mkdir(resolved, { recursive: true });
    res.json({ ok: true, path: resolved });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete file or directory
filesystemRouter.delete("/delete", async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: "path is required" });
    const resolved = path.resolve(filePath);
    const stat = await fs.stat(resolved);

    if (stat.isDirectory()) {
      await fs.rm(resolved, { recursive: true });
    } else {
      await fs.unlink(resolved);
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Rename / move
filesystemRouter.post("/rename", async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath)
      return res.status(400).json({ error: "oldPath and newPath are required" });
    await fs.rename(path.resolve(oldPath), path.resolve(newPath));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
