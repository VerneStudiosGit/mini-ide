export const TEXT_EXTENSIONS = new Set([
  "txt", "md", "js", "ts", "tsx", "jsx", "json", "css", "html", "xml",
  "yaml", "yml", "toml", "sh", "bash", "py", "rb", "go", "rs", "java",
  "c", "cpp", "h", "hpp", "sql", "env", "gitignore", "dockerfile",
  "makefile", "csv", "log", "cfg", "ini", "conf", "properties", "lock",
  "prisma", "graphql", "tf", "hcl",
]);

export const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
]);

export function getFileType(filename: string): "text" | "image" | "other" {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (!filename.includes(".")) return "text";
  return "other";
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
