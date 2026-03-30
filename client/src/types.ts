export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}
