import { useState, useCallback, useEffect } from "react";
import { FsEntry } from "../types";
import { getFileType } from "../utils/fileUtils";
import { ContextMenu } from "./ContextMenu";

interface FileTreeViewProps {
  token: string;
  rootPath: string;
  onOpenFile: (entry: FsEntry) => void;
  onSelectFile: (entry: FsEntry) => void;
  contextMenuItems: (entry: FsEntry) => { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
  onReload: () => void;
}

function SmallFolderIcon({ open }: { open?: boolean }) {
  return open ? (
    <svg className="w-4 h-4 text-sky-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v1H2V6z" />
      <path d="M2 10h20l-2 8a2 2 0 01-2 2H6a2 2 0 01-2-2L2 10z" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-sky-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
    </svg>
  );
}

function SmallFileIcon({ filename }: { filename: string }) {
  const type = getFileType(filename);
  if (type === "image") {
    return (
      <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-sky-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-sky-400 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function FileTreeView({
  token,
  rootPath,
  onOpenFile,
  onSelectFile,
  contextMenuItems,
  onReload,
}: FileTreeViewProps) {
  void onReload; // available for external refresh triggers
  const [dirCache, setDirCache] = useState<Record<string, FsEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FsEntry } | null>(null);

  const authFetch = useCallback(
    (url: string) =>
      fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const loadDir = useCallback(async (dirPath: string) => {
    setLoadingDirs((prev) => new Set(prev).add(dirPath));
    try {
      const res = await authFetch(`/api/fs/list?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      if (!data.error) {
        setDirCache((prev) => ({ ...prev, [dirPath]: data.entries || [] }));
      }
    } catch {
      // ignore
    }
    setLoadingDirs((prev) => {
      const next = new Set(prev);
      next.delete(dirPath);
      return next;
    });
  }, [authFetch]);

  // Load root on mount
  useEffect(() => {
    loadDir(rootPath);
  }, [rootPath, loadDir]);

  const handleToggle = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        // Load if not cached
        if (!dirCache[path]) {
          loadDir(path);
        }
      }
      return next;
    });
  }, [dirCache, loadDir]);

  const handleDoubleClick = useCallback((entry: FsEntry) => {
    if (entry.type === "directory") {
      handleToggle(entry.path);
    } else {
      onOpenFile(entry);
    }
  }, [handleToggle, onOpenFile]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FsEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const renderTree = (entries: FsEntry[], depth: number): React.ReactNode => {
    return entries.map((entry) => {
      const isDir = entry.type === "directory";
      const expanded = expandedDirs.has(entry.path);
      const children = dirCache[entry.path];
      const loading = loadingDirs.has(entry.path);

      return (
        <div key={entry.path}>
          <button
            className="w-full flex items-center gap-1.5 py-1 px-2 text-left text-sm hover:bg-blue-800/50 transition-colors group rounded"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (isDir) {
                handleToggle(entry.path);
              } else {
                onSelectFile(entry);
              }
            }}
            onDoubleClick={() => handleDoubleClick(entry)}
            onContextMenu={(e) => handleContextMenu(e, entry)}
          >
            {isDir ? (
              <>
                <ChevronIcon open={expanded} />
                <SmallFolderIcon open={expanded} />
              </>
            ) : (
              <>
                <span className="w-3 shrink-0" />
                <SmallFileIcon filename={entry.name} />
              </>
            )}
            <span className="truncate text-sky-100 group-hover:text-white text-xs">
              {entry.name}
            </span>
            {loading && (
              <span className="text-[10px] text-sky-500 ml-auto">...</span>
            )}
          </button>

          {isDir && expanded && children && (
            <div>{renderTree(children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const rootEntries = dirCache[rootPath] || [];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto py-2">
        {rootEntries.length === 0 && !loadingDirs.has(rootPath) ? (
          <div className="flex items-center justify-center h-32 text-blue-400 text-sm">
            Directorio vacio
          </div>
        ) : loadingDirs.has(rootPath) ? (
          <div className="flex items-center justify-center h-32 text-sky-400 text-sm">
            Cargando...
          </div>
        ) : (
          renderTree(rootEntries, 0)
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems(contextMenu.entry)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
