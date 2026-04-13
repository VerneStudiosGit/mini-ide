import { useEffect, useState } from "react";

export interface BrowserSummary {
  homeUrl: string;
}

interface BrowserSettingsProps {
  token: string;
  summary: BrowserSummary;
  onChange: (summary: BrowserSummary) => void;
}

export function BrowserSettings({ token, summary, onChange }: BrowserSettingsProps) {
  const [homeUrlInput, setHomeUrlInput] = useState(summary.homeUrl);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHomeUrlInput(summary.homeUrl);
  }, [summary.homeUrl]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/preferences/browser-home-url", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ homeUrl: homeUrlInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo guardar la configuracion.");
      }

      const nextHomeUrl = data.preferences?.browserHomeUrl;
      if (typeof nextHomeUrl !== "string" || !nextHomeUrl.trim()) {
        throw new Error("La respuesta no devolvio la URL del navegador.");
      }

      onChange({ homeUrl: nextHomeUrl });
      setHomeUrlInput(nextHomeUrl);
      setMessage("URL inicial guardada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuracion.");
      setHomeUrlInput(summary.homeUrl);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-4 ide-root">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border ide-border ide-panel p-4">
          <div className="mb-5">
            <h2 className="text-base font-semibold ide-text">Navegador</h2>
            <p className="text-sm ide-muted">
              Define la URL que se abre por defecto al entrar al navegador integrado.
            </p>
          </div>

          <div className="rounded-xl border ide-border ide-panel-soft p-4">
            <label className="block text-xs mb-1.5 ide-muted">URL inicial</label>
            <input
              type="text"
              value={homeUrlInput}
              onChange={(e) => {
                setHomeUrlInput(e.target.value);
                setMessage(null);
                setError(null);
              }}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="localhost:5173 o https://ejemplo.com"
              className="w-full px-3 py-2 rounded border ide-border ide-panel ide-text text-sm font-mono"
            />
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
              onClick={saveSettings}
              disabled={saving}
              className="px-3 py-2 rounded text-sm font-medium ide-accent text-white transition-colors disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
