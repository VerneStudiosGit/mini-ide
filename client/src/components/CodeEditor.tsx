import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { FsEntry } from "../types";
import { createIdeTheme, getLanguageExtension } from "../utils/editorTheme";

interface CodeEditorProps {
  file: FsEntry | null;
  token: string;
  onSave: (path: string, content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  visible?: boolean;
}

export function CodeEditor({ file, token, onSave, onDirtyChange, visible }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedContentRef = useRef("");
  const filePathRef = useRef<string | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const fileRef = useRef(file);
  fileRef.current = file;

  // Create editor view once — always render the container div
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          foldGutter(),
          history(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          langCompartment.current.of([]),
          createIdeTheme(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const current = update.state.doc.toString();
              const dirty = current !== savedContentRef.current;
              onDirtyChangeRef.current?.(dirty);
            }
          }),
          keymap.of([{
            key: "Mod-s",
            run: () => {
              const f = fileRef.current;
              const v = viewRef.current;
              if (!f || !v) return false;
              const content = v.state.doc.toString();
              onSaveRef.current(f.path, content).then(() => {
                savedContentRef.current = content;
                onDirtyChangeRef.current?.(false);
              });
              return true;
            },
          }]),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Load file content when file changes
  useEffect(() => {
    if (!file) {
      if (viewRef.current) {
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" },
        });
      }
      filePathRef.current = null;
      setError(null);
      return;
    }

    if (!viewRef.current) return;

    // Skip if same file
    if (filePathRef.current === file.path) return;
    filePathRef.current = file.path;

    setLoading(true);
    setError(null);

    fetch(`/api/fs/read?path=${encodeURIComponent(file.path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }

        const content = data.content || "";
        savedContentRef.current = content;
        onDirtyChangeRef.current?.(false);

        if (viewRef.current) {
          viewRef.current.dispatch({
            changes: {
              from: 0,
              to: viewRef.current.state.doc.length,
              insert: content,
            },
          });

          // Load language extension
          const langLoader = getLanguageExtension(file.name);
          if (langLoader) {
            try {
              const langExt = await langLoader();
              viewRef.current?.dispatch({
                effects: langCompartment.current.reconfigure(langExt),
              });
            } catch {
              // Language not available
            }
          } else {
            viewRef.current.dispatch({
              effects: langCompartment.current.reconfigure([]),
            });
          }

          // Force measure after content load
          requestAnimationFrame(() => {
            viewRef.current?.requestMeasure();
          });
        }

        setLoading(false);
      })
      .catch(() => {
        setError("Error al cargar el archivo");
        setLoading(false);
      });
  }, [file, token]);

  // Re-measure when becoming visible (tab switch)
  useEffect(() => {
    if (visible && viewRef.current) {
      // Double rAF ensures the browser has actually laid out the element
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          viewRef.current?.requestMeasure();
        });
      });
    }
  }, [visible]);

  return (
    <div className="h-full relative">
      {/* Placeholder when no file */}
      {!file && !error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center text-blue-400 bg-[var(--ide-panel)]">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm">Selecciona un archivo para editar</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center text-red-400 bg-[var(--ide-panel)]">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <span className="text-sky-400 text-sm">Cargando...</span>
        </div>
      )}

      {/* CodeMirror container — ALWAYS rendered so the ref is available on mount */}
      <div ref={containerRef} className="h-full" />
    </div>
  );
}
