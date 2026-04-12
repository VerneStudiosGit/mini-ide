import { useEffect, useMemo, useState } from "react";

export interface VoiceNoteSummary {
  enabled: boolean;
  hasApiKey: boolean;
}

interface VoiceNoteSettingsProps {
  token: string;
  summary: VoiceNoteSummary;
  onChange: (summary: VoiceNoteSummary) => void;
}

export function VoiceNoteSettings({ token, summary, onChange }: VoiceNoteSettingsProps) {
  const [enabled, setEnabled] = useState(summary.enabled);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(summary.enabled);
  }, [summary.enabled]);

  const hasPendingApiKey = useMemo(() => apiKeyInput.trim().length > 0, [apiKeyInput]);

  const saveSettings = async (nextEnabled: boolean, nextApiKey?: string) => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/preferences/voice-note", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: nextEnabled,
          ...(nextApiKey !== undefined ? { apiKey: nextApiKey } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo guardar la configuracion.");
      }

      const nextSummary = data.preferences?.voiceNote as VoiceNoteSummary | undefined;
      if (!nextSummary) {
        throw new Error("La respuesta no devolvio el estado de Voice Note.");
      }

      onChange(nextSummary);
      setEnabled(nextSummary.enabled);
      setApiKeyInput("");
      setMessage(
        nextApiKey === ""
          ? "API key eliminada."
          : nextApiKey !== undefined
          ? "API key guardada."
          : "Configuracion actualizada."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuracion.");
      setEnabled(summary.enabled);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-4 ide-root">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border ide-border ide-panel p-4">
          <div className="mb-5">
            <h2 className="text-base font-semibold ide-text">Voice Note</h2>
            <p className="text-sm ide-muted">
              Graba una nota de voz, la transcribimos con Whisper y pegamos el texto en la terminal activa.
            </p>
          </div>

          <div className="rounded-xl border ide-border ide-panel-soft p-4 mb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium ide-text">Activar Voice Note</div>
                <div className="text-xs ide-muted">
                  Muestra el boton flotante de grabacion en la esquina inferior derecha del terminal.
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => {
                  const nextEnabled = !enabled;
                  setEnabled(nextEnabled);
                  setMessage(null);
                  setError(null);
                }}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  enabled ? "bg-emerald-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-xl border ide-border ide-panel-soft p-4">
            <label className="block text-xs mb-1.5 ide-muted">OpenAI API key</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setMessage(null);
                setError(null);
              }}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={summary.hasApiKey ? "API key guardada. Escribe una nueva para reemplazarla." : "sk-..."}
              className="w-full px-3 py-2 rounded border ide-border ide-panel ide-text text-sm"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <div className="ide-muted">
                {summary.hasApiKey ? "La key se guarda cifrada en el directorio de datos configurado." : "Necesaria para usar Whisper."}
              </div>
              {summary.hasApiKey && (
                <span className="px-2 py-1 rounded-full border ide-border ide-text">Guardada</span>
              )}
            </div>
          </div>

          {(message || error) && (
            <div
              className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"
              }`}
            >
              {error || message}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => saveSettings(enabled, hasPendingApiKey ? apiKeyInput.trim() : undefined)}
              disabled={saving}
              className="px-3 py-2 rounded text-sm font-medium ide-accent text-white transition-colors disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>

            {summary.hasApiKey && (
              <button
                onClick={() => saveSettings(false, "")}
                disabled={saving}
                className="px-3 py-2 rounded text-sm border ide-border ide-text transition-colors disabled:opacity-60"
              >
                Eliminar key
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
