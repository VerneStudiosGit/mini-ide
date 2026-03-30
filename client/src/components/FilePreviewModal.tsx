import { useState, useEffect, useCallback } from "react";
import { FsEntry } from "../types";

interface Props {
  file: FsEntry;
  fileType: "text" | "image" | "other";
  token: string;
  onClose: () => void;
  onDelete: (path: string) => void;
  onSave: (path: string, content: string) => void;
}

export function FilePreviewModal({ file, fileType, token, onClose, onDelete, onSave }: Props) {
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  useEffect(() => {
    if (fileType === "text") {
      setLoading(true);
      fetch(`/api/fs/read?path=${encodeURIComponent(file.path)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setContent(`Error: ${data.error}`);
          } else {
            setContent(data.content);
            setEditContent(data.content);
          }
          setLoading(false);
        })
        .catch(() => {
          setContent("Error loading file");
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [file.path, fileType]);

  const handleDelete = useCallback(() => {
    onDelete(file.path);
    setShowDeleteConfirm(false);
  }, [file.path, onDelete]);

  const handleSave = useCallback(() => {
    onSave(file.path, editContent);
    setContent(editContent);
    setEditing(false);
    setShowSaveConfirm(false);
  }, [file.path, editContent, onSave]);

  // Ctrl+S to save while editing
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        setShowSaveConfirm(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-blue-950 border border-blue-700 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-blue-800">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">{file.name}</h2>
            <span className="text-xs text-blue-400 truncate max-w-xs">{file.path}</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-blue-800 text-sky-300 transition-colors text-lg"
          >
            x
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-auto p-5 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sky-400">
              Cargando...
            </div>
          ) : fileType === "text" ? (
            editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full min-h-[400px] bg-blue-900/50 text-white p-4 rounded-lg border border-blue-700 focus:border-sky-400 focus:outline-none font-mono text-sm resize-none"
                spellCheck={false}
                style={{ tabSize: 2 }}
                autoFocus
              />
            ) : (
              <pre className="bg-blue-900/30 rounded-lg p-4 text-sm text-sky-100 font-mono whitespace-pre-wrap break-words overflow-auto max-h-[60vh]">
                {content}
              </pre>
            )
          ) : fileType === "image" ? (
            <div className="flex items-center justify-center">
              <img
                src={`/api/fs/raw?path=${encodeURIComponent(file.path)}&token=${encodeURIComponent(token)}`}
                alt={file.name}
                className="max-w-full max-h-[60vh] rounded-lg shadow-lg"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-blue-400 gap-3">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-sm">
                No se puede previsualizar este tipo de archivo
              </p>
              <p className="text-xs text-blue-500">{file.name}</p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-blue-800">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-500 text-white transition-colors"
          >
            Eliminar
          </button>
          <div className="flex gap-2">
            {fileType === "text" && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                Editar
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditContent(content);
                  }}
                  className="px-4 py-1.5 text-sm rounded-lg bg-blue-800 hover:bg-blue-700 text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setShowSaveConfirm(true)}
                  className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                >
                  Guardar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="bg-blue-950 border border-blue-700 rounded-xl shadow-2xl p-6 max-w-sm mx-4">
            <h3 className="text-white font-semibold mb-2">Confirmar eliminacion</h3>
            <p className="text-sm text-blue-300 mb-4">
              Estas seguro de que quieres eliminar <strong className="text-white">{file.name}</strong>?
              Esta accion no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-800 hover:bg-blue-700 text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Si, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save confirmation dialog */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="bg-blue-950 border border-blue-700 rounded-xl shadow-2xl p-6 max-w-sm mx-4">
            <h3 className="text-white font-semibold mb-2">Confirmar cambios</h3>
            <p className="text-sm text-blue-300 mb-4">
              Quieres guardar los cambios en <strong className="text-white">{file.name}</strong>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-800 hover:bg-blue-700 text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                Si, guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
