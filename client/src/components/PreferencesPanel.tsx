import { useState } from "react";
import { IdeTheme } from "../theme";
import { ThemeCustomizer } from "./ThemeCustomizer";
import { VoiceNoteSettings, VoiceNoteSummary } from "./VoiceNoteSettings";

type PreferencesSection = "brand" | "voice-note";

interface PreferencesPanelProps {
  theme: IdeTheme;
  onThemeChange: (theme: IdeTheme) => void;
  onThemeReset: () => void;
  token: string;
  onBrandingChange?: () => void;
  voiceNoteSummary: VoiceNoteSummary;
  onVoiceNoteChange: (summary: VoiceNoteSummary) => void;
}

export function PreferencesPanel({
  theme,
  onThemeChange,
  onThemeReset,
  token,
  onBrandingChange,
  voiceNoteSummary,
  onVoiceNoteChange,
}: PreferencesPanelProps) {
  const [section, setSection] = useState<PreferencesSection>("brand");

  return (
    <div className="h-full flex flex-col md:flex-row ide-root">
      <aside className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r ide-border ide-panel-soft p-3">
        <div className="text-[11px] uppercase tracking-[0.22em] ide-muted mb-3">Preferences</div>
        <div className="space-y-1">
          {[
            { id: "brand", label: "Marca", detail: "Nombre, icono y colores" },
            { id: "voice-note", label: "Voice Note", detail: "Grabacion y Whisper" },
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
        ) : (
          <VoiceNoteSettings token={token} summary={voiceNoteSummary} onChange={onVoiceNoteChange} />
        )}
      </div>
    </div>
  );
}
