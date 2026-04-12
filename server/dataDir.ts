import "./env";
import path from "path";

export function getDataDir(): string {
  if (process.env.DATA_DIR?.trim()) {
    return path.resolve(process.env.DATA_DIR);
  }

  return process.cwd();
}
