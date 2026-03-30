import { useState, useCallback, useEffect } from "react";
import { FileExplorer } from "./components/FileExplorer";
import { Terminal } from "./components/Terminal";
import { CodeEditor } from "./components/CodeEditor";
import { EditorTabs } from "./components/EditorTabs";
import { LoginScreen } from "./components/LoginScreen";
import { PreviewWindow } from "./components/PreviewWindow";
import { ThemeCustomizer } from "./components/ThemeCustomizer";
import { applyTheme, DEFAULT_THEME, IdeTheme, loadTheme, saveTheme } from "./theme";
import { FsEntry } from "./types";

type RightTab = "terminal" | "theme" | "editor";
type MobileTab = "files" | "terminal" | "theme" | "editor";

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("auth_token") || "");
  const [dividerX, setDividerX] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [showPreview, setShowPreview] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("terminal");
  const [mobileTab, setMobileTab] = useState<MobileTab>("files");
  const [theme, setTheme] = useState<IdeTheme>(() => loadTheme());
  const [openFile, setOpenFile] = useState<FsEntry | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  // Apply branding (icon + title) to DOM
  const applyBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/branding");
      const data = await res.json();

      // Update document title
      document.title = data.name || "mini-ide";

      // Update meta apple-mobile-web-app-title
      const metaAppTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (metaAppTitle) metaAppTitle.setAttribute("content", data.name || "mini-ide");

      // Update favicon and apple-touch-icon
      const iconHref = data.hasIcon ? `/api/branding/icon?t=${Date.now()}` : "/icons/icon.svg";
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) favicon.setAttribute("href", iconHref);
      const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
      if (appleTouchIcon) appleTouchIcon.setAttribute("href", iconHref);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    applyBranding();
  }, [applyBranding]);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleOpenFile = useCallback((entry: FsEntry) => {
    setOpenFile(entry);
    setEditorDirty(false);
    setRightTab("editor");
    if (isMobile) setMobileTab("editor");
  }, [isMobile]);

  const handleCloseEditor = useCallback(() => {
    if (editorDirty && !confirm("Tienes cambios sin guardar. ¿Cerrar de todos modos?")) return;
    setOpenFile(null);
    setEditorDirty(false);
    setRightTab("terminal");
  }, [editorDirty]);

  const handleSaveFile = useCallback(async (filePath: string, content: string) => {
    const res = await fetch("/api/fs/write", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = await res.json();
    if (!data.ok) alert(data.error);
  }, [token]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const onMove = (ev: MouseEvent) => {
        const pct = (ev.clientX / window.innerWidth) * 100;
        setDividerX(Math.max(20, Math.min(80, pct)));
      };
      const onUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    []
  );

  if (!token) {
    return <LoginScreen onLogin={setToken} />;
  }

  return (
    <div className={`ide-root h-full flex flex-col md:flex-row ${isDragging ? "select-none cursor-col-resize" : ""}`}>
      <div className="md:hidden px-3 py-2 border-b ide-border ide-panel-soft flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setMobileTab("files")}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            mobileTab === "files" ? "ide-tab-active" : "ide-tab"
          }`}
        >
          Archivos
        </button>
        {openFile && (
          <button
            onClick={() => {
              setRightTab("editor");
              setMobileTab("editor");
            }}
            className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
              mobileTab === "editor" ? "ide-tab-active" : "ide-tab"
            }`}
          >
            Editor
            {editorDirty && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
          </button>
        )}
        <button
          onClick={() => {
            setRightTab("terminal");
            setMobileTab("terminal");
          }}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            mobileTab === "terminal" ? "ide-tab-active" : "ide-tab"
          }`}
        >
          Terminal
        </button>
        <button
          onClick={() => {
            setRightTab("theme");
            setMobileTab("theme");
          }}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            mobileTab === "theme" ? "ide-tab-active" : "ide-tab"
          }`}
        >
          Marca
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowPreview(true)}
          className="px-2.5 py-1 text-xs font-medium rounded ide-accent text-white transition-colors"
        >
          Navegador
        </button>
      </div>

      <div
        className={`${mobileTab === "files" ? "flex" : "hidden"} md:flex h-full overflow-hidden flex-col ide-panel`}
        style={!isMobile ? { width: `${dividerX}%` } : undefined}
      >
        <FileExplorer token={token} onOpenFile={handleOpenFile} />
      </div>

      <div className="hidden md:block w-1.5 cursor-col-resize ide-divider shrink-0" onMouseDown={handleDragStart} />

      <div
        className={`${mobileTab === "files" ? "hidden" : "flex"} md:flex h-full overflow-hidden flex-col ide-panel`}
        style={!isMobile ? { width: `${100 - dividerX}%` } : undefined}
      >
        <div className="hidden md:flex px-4 py-2 border-b ide-border ide-panel-soft items-center gap-2">
          <div className="flex items-center gap-1">
            {openFile && (
              <button
                onClick={() => setRightTab("editor")}
                className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                  rightTab === "editor" ? "ide-tab-active" : "ide-tab"
                }`}
              >
                Editor
                {editorDirty && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
              </button>
            )}
            <button
              onClick={() => setRightTab("terminal")}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                rightTab === "terminal" ? "ide-tab-active" : "ide-tab"
              }`}
            >
              Terminal
            </button>
            <button
              onClick={() => setRightTab("theme")}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                rightTab === "theme" ? "ide-tab-active" : "ide-tab"
              }`}
            >
              Marca
            </button>
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded ide-accent text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Navegador
          </button>
        </div>

        <div className="flex-1 min-h-0">
          <div className={rightTab === "editor" ? "h-full flex flex-col" : "hidden"}>
            <EditorTabs file={openFile} dirty={editorDirty} onClose={handleCloseEditor} />
            <div className="flex-1 min-h-0">
              <CodeEditor
                file={openFile}
                token={token}
                onSave={handleSaveFile}
                onDirtyChange={setEditorDirty}
                visible={rightTab === "editor"}
              />
            </div>
          </div>
          <div className={rightTab === "terminal" ? "h-full" : "hidden"}>
            <Terminal token={token} />
          </div>
          <div className={rightTab === "theme" ? "h-full" : "hidden"}>
            <ThemeCustomizer
              theme={theme}
              onChange={setTheme}
              onReset={() => setTheme(DEFAULT_THEME)}
              token={token}
              onBrandingChange={applyBranding}
            />
          </div>
        </div>
      </div>

      {showPreview && <PreviewWindow onClose={() => setShowPreview(false)} />}
    </div>
  );
}
