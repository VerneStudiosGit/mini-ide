import { FsEntry } from "../types";

interface EditorTabsProps {
  file: FsEntry | null;
  dirty: boolean;
  onClose: () => void;
}

export function EditorTabs({ file, dirty, onClose }: EditorTabsProps) {
  if (!file) return null;

  return (
    <div className="flex items-center px-2 py-1 bg-blue-900/50 border-b border-blue-800 shrink-0">
      <div className="flex items-center gap-2 px-2 py-1 rounded bg-blue-800/60 text-xs">
        <span className="text-sky-200 truncate max-w-[200px]">
          {file.name}
        </span>
        {dirty && (
          <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" title="Cambios sin guardar" />
        )}
        <button
          onClick={onClose}
          className="ml-1 w-4 h-4 flex items-center justify-center rounded hover:bg-blue-700 text-sky-400 hover:text-white transition-colors text-[10px]"
          title="Cerrar"
        >
          x
        </button>
      </div>
      <div className="flex-1" />
      {dirty && (
        <span className="text-[10px] text-sky-500 mr-2">Ctrl+S para guardar</span>
      )}
    </div>
  );
}
