import "./env";
import fs from "fs";
import os from "os";
import path from "path";

function ensureWritableDir(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    const stateDir = path.join(dirPath, ".mini-ide");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.accessSync(stateDir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function getDataDir(): string {
  const explicit = process.env.DATA_DIR?.trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (ensureWritableDir(resolved)) return resolved;
    console.warn(`[dataDir] DATA_DIR is not writable: ${resolved}. Falling back.`);
  }

  const home = process.env.HOME?.trim();
  if (home) {
    const homeFallback = path.resolve(home, ".mini-ide-data");
    if (ensureWritableDir(homeFallback)) return homeFallback;
  }

  const tmpFallback = path.resolve(os.tmpdir(), "mini-ide-data");
  if (ensureWritableDir(tmpFallback)) return tmpFallback;

  const cwd = process.cwd();
  if (ensureWritableDir(cwd)) return cwd;
  return cwd;
}
