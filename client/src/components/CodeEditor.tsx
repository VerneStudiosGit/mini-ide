import { useEffect, useRef, useState, useCallback } from "react";
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
}

export function CodeEditor({ file, token, onSave, onDirtyChange }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedContentRef = useRef("");
  const filePathRef = useRef<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!file || !viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    await onSave(file.path, content);
    savedContentRef.current = content;
    onDirtyChange?.(false);
  }, [file, onSave, onDirtyChange]);

  // Create editor view once
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
              onDirtyChange?.(dirty);
            }
          }),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Mount once

  // Add Ctrl+S keymap (needs latest handleSave ref)
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (!viewRef.current) return;
    // We can't easily add/remove keymaps dynamically in CM6,
    // so we handle Ctrl+S at the DOM level
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    const el = containerRef.current;
    if (el) {
      el.addEventListener("keydown", handler);
      return () => el.removeEventListener("keydown", handler);
    }
  }, []);

  // Load file content when file changes
  useEffect(() => {
    if (!file || !viewRef.current) {
      if (viewRef.current) {
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" },
        });
      }
      filePathRef.current = null;
      return;
    }

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
        onDirtyChange?.(false);

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
              viewRef.current.dispatch({
                effects: langCompartment.current.reconfigure(langExt),
              });
            } catch {
              // Language not available, continue without
            }
          } else {
            viewRef.current.dispatch({
              effects: langCompartment.current.reconfigure([]),
            });
          }
        }

        setLoading(false);
      })
      .catch(() => {
        setError("Error al cargar el archivo");
        setLoading(false);
      });
  }, [file, token, onDirtyChange]);

  // Re-measure when becoming visible
  useEffect(() => {
    if (file && viewRef.current) {
      requestAnimationFrame(() => {
        viewRef.current?.requestMeasure();
      });
    }
  }, [file]);

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-blue-400">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm">Selecciona un archivo para editar</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <span className="text-sky-400 text-sm">Cargando...</span>
        </div>
      )}
      <div ref={containerRef} className="h-full" />
    </div>
  );
}
