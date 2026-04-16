import { useState, useEffect, useCallback, useRef } from "react";
import { FilePreviewModal } from "./FilePreviewModal";
import { FileTreeView } from "./FileTreeView";
import { ContextMenu } from "./ContextMenu";
import { FsEntry } from "../types";
import { getFileType, formatSize } from "../utils/fileUtils";

type ViewMode = "grid" | "tree";

const INITIAL_DATA_DIR = import.meta.env.VITE_DATA_DIR || "";

function FolderIcon() {
  return (
    <svg className="w-10 h-10 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
    </svg>
  );
}

function FileIcon({ filename }: { filename: string }) {
  const type = getFileType(filename);
  if (type === "image") {
    return (
      <svg className="w-10 h-10 text-purple-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    );
  }
  return (
    <svg className="w-10 h-10 text-sky-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

// Context menu icons
const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);
const RenameIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
  </svg>
);
const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);
const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

interface ContextMenuState {
  x: number;
  y: number;
  entry: FsEntry;
}

interface FileExplorerProps {
  token: string;
  onOpenFile?: (entry: FsEntry) => void;
}

export function FileExplorer({ token, onOpenFile }: FileExplorerProps) {
  const [rootPath, setRootPath] = useState(INITIAL_DATA_DIR);
  const [currentPath, setCurrentPath] = useState(INITIAL_DATA_DIR || "/");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FsEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem("mini-ide-view-mode") as ViewMode) || "grid"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  const authFetch = useCallback(
    (url: string, opts?: RequestInit) =>
      fetch(url, {
        ...opts,
        headers: {
          ...opts?.headers,
          Authorization: `Bearer ${token}`,
        },
      }),
    [token]
  );

  const loadDir = useCallback(async (dirPath?: string) => {
    setLoading(true);
    try {
      const target = dirPath ?? "";
      const query = target ? `?path=${encodeURIComponent(target)}` : "";
      const res = await authFetch(`/api/fs/list${query}`);
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        setLoading(false);
        return;
      }
      setCurrentPath(data.path);
      if (!rootPath || target === rootPath || target === "") {
        setRootPath(data.path);
      }
      setEntries(data.entries || []);
    } catch {
      alert("Error loading directory");
    }
    setLoading(false);
  }, [authFetch, rootPath]);

  useEffect(() => {
    loadDir(INITIAL_DATA_DIR || undefined);
  }, [loadDir]);

  // Close "Nuevo" dropdown on outside click
  useEffect(() => {
    if (!showNewMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNewMenu]);

  const handleToggleView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("mini-ide-view-mode", mode);
  }, []);

  const handleDoubleClick = useCallback(
    (entry: FsEntry) => {
      if (entry.type === "directory") {
        loadDir(entry.path);
      } else {
        const fileType = getFileType(entry.name);
        if (fileType === "text" && onOpenFile) {
          onOpenFile(entry);
        } else {
          setSelectedFile(entry);
        }
      }
    },
    [loadDir, onOpenFile]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FsEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, entry });
    },
    []
  );

  const goUp = () => {
    if (currentPath === rootPath) return;
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    loadDir(parent.startsWith(rootPath) ? parent : rootPath);
  };

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        const reader = new FileReader();
        reader.onload = async () => {
          const result = reader.result as string;
          try {
            await authFetch("/api/fs/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: `${currentPath}/${file.name}`,
                data: result,
              }),
            });
          } catch {
            alert(`Error uploading ${file.name}`);
          }
        };
        reader.readAsDataURL(file);
      }

      setTimeout(() => {
        loadDir(currentPath);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 500);
    },
    [currentPath, loadDir]
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      try {
        const res = await authFetch(`/api/fs/delete?path=${encodeURIComponent(filePath)}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!data.ok) alert(data.error);
        setSelectedFile(null);
        loadDir(currentPath);
      } catch {
        alert("Error deleting file");
      }
    },
    [currentPath, loadDir]
  );

  const handleSaveFile = useCallback(
    async (filePath: string, content: string) => {
      try {
        const res = await authFetch("/api/fs/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, content }),
        });
        const data = await res.json();
        if (!data.ok) alert(data.error);
      } catch {
        alert("Error saving file");
      }
    },
    []
  );

  const handleCopyPath = useCallback((entry: FsEntry) => {
    navigator.clipboard.writeText(entry.path).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = entry.path;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }, []);

  const handleRename = useCallback(
    async (entry: FsEntry) => {
      const newName = prompt("Nuevo nombre:", entry.name);
      if (!newName || newName === entry.name) return;

      const parentPath = entry.path.substring(0, entry.path.lastIndexOf("/"));
      const newPath = `${parentPath}/${newName}`;

      try {
        const res = await authFetch("/api/fs/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPath: entry.path, newPath }),
        });
        const data = await res.json();
        if (!data.ok) alert(data.error);
        loadDir(currentPath);
      } catch {
        alert("Error renaming");
      }
    },
    [currentPath, loadDir]
  );

  const handleDownload = useCallback((entry: FsEntry) => {
    const url = `/api/fs/raw?path=${encodeURIComponent(entry.path)}&token=${encodeURIComponent(token)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleNewFolder = useCallback(async () => {
    const name = prompt("Nombre del directorio:");
    if (!name) return;

    try {
      const res = await authFetch("/api/fs/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `${currentPath}/${name}` }),
      });
      const data = await res.json();
      if (!data.ok) alert(data.error);
      loadDir(currentPath);
    } catch {
      alert("Error creating directory");
    }
  }, [currentPath, loadDir]);

  const handleNewFile = useCallback(async () => {
    const name = prompt("Nombre del archivo:");
    if (!name) return;

    try {
      const res = await authFetch("/api/fs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `${currentPath}/${name}`, content: "" }),
      });
      const data = await res.json();
      if (!data.ok) alert(data.error);
      loadDir(currentPath);
    } catch {
      alert("Error creating file");
    }
  }, [currentPath, loadDir]);

  const getContextMenuItems = useCallback(
    (entry: FsEntry) => [
      {
        label: "Copiar ruta",
        icon: <CopyIcon />,
        onClick: () => handleCopyPath(entry),
      },
      {
        label: "Renombrar",
        icon: <RenameIcon />,
        onClick: () => handleRename(entry),
      },
      ...(entry.type === "file"
        ? [
            {
              label: "Descargar",
              icon: <DownloadIcon />,
              onClick: () => handleDownload(entry),
            },
          ]
        : []),
      {
        label: "Eliminar",
        icon: <DeleteIcon />,
        onClick: () => {
          if (confirm(`¿Eliminar "${entry.name}"?`)) {
            handleDeleteFile(entry.path);
          }
        },
        danger: true,
      },
    ],
    [handleCopyPath, handleRename, handleDownload, handleDeleteFile]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="px-4 py-2 bg-blue-900 border-b border-blue-800 flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold tracking-wide text-sky-300">Archivos</span>
        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center gap-0.5 ide-panel-soft rounded p-0.5 border ide-border">
          <button
            onClick={() => handleToggleView("grid")}
            className={`p-1 rounded transition-colors ${viewMode === "grid" ? "ide-tab-active" : "ide-tab"}`}
            title="Vista de cuadricula"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
          <button
            onClick={() => handleToggleView("tree")}
            className={`p-1 rounded transition-colors ${viewMode === "tree" ? "ide-tab-active" : "ide-tab"}`}
            title="Vista de arbol"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>
        </div>

        {/* Reload button */}
        <button
          onClick={() => loadDir(currentPath)}
          className="p-1.5 rounded hover:bg-blue-800 text-sky-300 transition-colors"
          title="Recargar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* "Nuevo" dropdown button */}
        <div className="relative" ref={newMenuRef}>
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-sky-500 hover:bg-sky-400 text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showNewMenu && (
            <div className="absolute right-0 top-full mt-1 min-w-[180px] py-1 bg-blue-900 border border-blue-700 rounded-lg shadow-xl shadow-black/40 z-50">
              <button
                onClick={() => { setShowNewMenu(false); handleNewFolder(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-sky-200 hover:bg-blue-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                </svg>
                Nuevo directorio
              </button>
              <button
                onClick={() => { setShowNewMenu(false); handleNewFile(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-sky-200 hover:bg-blue-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Nuevo archivo
              </button>
              <div className="border-t border-blue-700 my-1" />
              <button
                onClick={() => { setShowNewMenu(false); fileInputRef.current?.click(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-sky-200 hover:bg-blue-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Subir archivo
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {viewMode === "grid" ? (
        <>
          {/* Breadcrumb navigation */}
          <div className="px-4 py-2 bg-blue-900/50 border-b border-blue-800 flex items-center gap-1 text-sm overflow-x-auto shrink-0">
            <button
              onClick={goUp}
              className="px-2 py-0.5 rounded hover:bg-blue-800 text-sky-300 transition-colors shrink-0"
              title="Subir un nivel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => loadDir(rootPath || undefined)}
              className="px-1 hover:text-sky-300 text-sky-400 transition-colors shrink-0"
            >
              /
            </button>
            {breadcrumbs.map((seg: string, i: number) => {
              const segPath = "/" + breadcrumbs.slice(0, i + 1).join("/");
              return (
                <span key={segPath} className="flex items-center gap-1 shrink-0">
                  <span className="text-blue-600">/</span>
                  <button
                    onClick={() => loadDir(segPath)}
                    className="hover:text-sky-300 text-sky-400 transition-colors"
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-sky-400">
                Cargando...
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-blue-400">
                Directorio vacio
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {entries.map((entry) => (
                  <button
                    key={entry.path}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg bg-blue-900/40 border border-blue-800/50 hover:bg-blue-800/60 hover:border-sky-500/50 transition-all cursor-pointer group"
                  >
                    {entry.type === "directory" ? (
                      <FolderIcon />
                    ) : (
                      <FileIcon filename={entry.name} />
                    )}
                    <span className="text-xs text-center text-white truncate w-full group-hover:text-sky-200">
                      {entry.name}
                    </span>
                    {entry.type === "file" && (
                      <span className="text-[10px] text-blue-400">
                        {formatSize(entry.size)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Tree view */
        <FileTreeView
          token={token}
          rootPath={rootPath}
          onOpenFile={(entry) => {
            const fileType = getFileType(entry.name);
            if (fileType === "text" && onOpenFile) {
              onOpenFile(entry);
            } else {
              setSelectedFile(entry);
            }
          }}
          onSelectFile={() => {}}
          contextMenuItems={getContextMenuItems}
          onReload={() => loadDir(currentPath)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.entry)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* File preview modal */}
      {selectedFile && (
        <FilePreviewModal
          file={selectedFile}
          fileType={getFileType(selectedFile.name)}
          token={token}
          onClose={() => setSelectedFile(null)}
          onDelete={handleDeleteFile}
          onSave={handleSaveFile}
        />
      )}
    </div>
  );
}
