import { useState } from "react";
import { IdeTheme } from "../theme";
import { ThemeCustomizer } from "./ThemeCustomizer";
import { BrowserSettings, BrowserSummary } from "./BrowserSettings";
import { VoiceNoteSettings, VoiceNoteSummary } from "./VoiceNoteSettings";
import { StartupSettings, StartupSummary } from "./StartupSettings";

type PreferencesSection = "brand" | "browser" | "voice-note" | "startup";

interface PreferencesPanelProps {
  theme: IdeTheme;
  onThemeChange: (theme: IdeTheme) => void;
  onThemeReset: () => void;
  token: string;
  onBrandingChange?: () => void;
  browserSummary: BrowserSummary;
  onBrowserChange: (summary: BrowserSummary) => void;
  voiceNoteSummary: VoiceNoteSummary;
  onVoiceNoteChange: (summary: VoiceNoteSummary) => void;
  startupSummary: StartupSummary;
  onStartupChange: (summary: StartupSummary) => void;
}

export function PreferencesPanel({
  theme,
  onThemeChange,
  onThemeReset,
  token,
  onBrandingChange,
  browserSummary,
  onBrowserChange,
  voiceNoteSummary,
  onVoiceNoteChange,
  startupSummary,
  onStartupChange,
}: PreferencesPanelProps) {
  const [section, setSection] = useState<PreferencesSection>("brand");

  return (
    <div className="h-full flex flex-col md:flex-row ide-root">
      <aside className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r ide-border ide-panel-soft p-3">
        <div className="text-[11px] uppercase tracking-[0.22em] ide-muted mb-3">Preferences</div>
        <div className="space-y-1">
          {[
            { id: "brand", label: "Marca", detail: "Nombre, icono y colores" },
            { id: "browser", label: "Navegador", detail: "URL inicial por defecto" },
            { id: "voice-note", label: "Voice Note", detail: "Grabacion y Whisper" },
            { id: "startup", label: "Startup", detail: "Comandos al iniciar contenedor" },
          ].map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id as PreferencesSection)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "ide-panel border-white/10 text-white"
                    : "border-transparent ide-tab hover:border-white/10"
                }`}
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs ide-muted mt-1">{item.detail}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {section === "brand" ? (
          <ThemeCustomizer
            theme={theme}
            onChange={onThemeChange}
            onReset={onThemeReset}
            token={token}
            onBrandingChange={onBrandingChange}
          />
        ) : section === "browser" ? (
          <BrowserSettings token={token} summary={browserSummary} onChange={onBrowserChange} />
        ) : section === "voice-note" ? (
          <VoiceNoteSettings token={token} summary={voiceNoteSummary} onChange={onVoiceNoteChange} />
        ) : (
          <StartupSettings token={token} summary={startupSummary} onChange={onStartupChange} />
        )}
      </div>
    </div>
  );
}
