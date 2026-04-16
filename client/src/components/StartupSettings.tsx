import { useEffect, useState } from "react";

export interface StartupSummary {
  enabled: boolean;
  aptUpdate: boolean;
  aptUpgrade: boolean;
  aptPackages: string[];
  commands: string;
}

interface StartupSettingsProps {
  token: string;
  summary: StartupSummary;
  onChange: (summary: StartupSummary) => void;
}

function parsePackagesInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,\s]+/g)
        .map((part) => part.trim())
        .filter(Boolean)
    )
  );
}

export function StartupSettings({ token, summary, onChange }: StartupSettingsProps) {
  const [enabled, setEnabled] = useState(summary.enabled);
  const [aptUpdate, setAptUpdate] = useState(summary.aptUpdate);
  const [aptUpgrade, setAptUpgrade] = useState(summary.aptUpgrade);
  const [packagesInput, setPackagesInput] = useState(summary.aptPackages.join("\n"));
  const [commands, setCommands] = useState(summary.commands);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(summary.enabled);
    setAptUpdate(summary.aptUpdate);
    setAptUpgrade(summary.aptUpgrade);
    setPackagesInput(summary.aptPackages.join("\n"));
    setCommands(summary.commands);
  }, [summary]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const aptPackages = parsePackagesInput(packagesInput);
      const res = await fetch("/api/preferences/startup", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startup: {
            enabled,
            aptUpdate,
            aptUpgrade,
            aptPackages,
            commands,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo guardar la configuracion de inicio.");
      }

      const nextStartup = data.preferences?.startup as StartupSummary | undefined;
      if (!nextStartup) {
        throw new Error("La respuesta no devolvio la configuracion de inicio.");
      }

      onChange(nextStartup);
      setMessage("Configuracion de inicio guardada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuracion de inicio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-4 ide-root">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border ide-border ide-panel p-4">
          <div className="mb-5">
            <h2 className="text-base font-semibold ide-text">Startup</h2>
            <p className="text-sm ide-muted">
              Ejecuta acciones al iniciar el contenedor para reinstalar dependencias de sistema.
            </p>
          </div>

          <div className="rounded-xl border ide-border ide-panel-soft p-4 mb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium ide-text">Activar startup automatico</div>
                <div className="text-xs ide-muted">
                  Se ejecuta en cada reinicio/deploy antes de levantar el servidor.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => {
                  setEnabled((v) => !v);
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

          <div className="rounded-xl border ide-border ide-panel-soft p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm ide-text">
                <input
                  type="checkbox"
                  checked={aptUpdate}
                  onChange={(e) => setAptUpdate(e.target.checked)}
                />
                Ejecutar `apt-get update`
              </label>
              <label className="flex items-center gap-2 text-sm ide-text">
                <input
                  type="checkbox"
                  checked={aptUpgrade}
                  onChange={(e) => setAptUpgrade(e.target.checked)}
                />
                Ejecutar `apt-get upgrade -y`
              </label>
            </div>
          </div>

          <div className="rounded-xl border ide-border ide-panel-soft p-4 mb-4">
            <label className="block text-xs mb-1.5 ide-muted">Paquetes apt (uno por linea)</label>
            <textarea
              value={packagesInput}
              onChange={(e) => setPackagesInput(e.target.value)}
              className="w-full min-h-24 px-3 py-2 rounded border ide-border ide-panel ide-text text-sm font-mono resize-y"
              placeholder={"bubblewrap\njq\nripgrep"}
            />
          </div>

          <div className="rounded-xl border ide-border ide-panel-soft p-4">
            <label className="block text-xs mb-1.5 ide-muted">Comandos extra (bash)</label>
            <textarea
              value={commands}
              onChange={(e) => setCommands(e.target.value)}
              className="w-full min-h-32 px-3 py-2 rounded border ide-border ide-panel ide-text text-sm font-mono resize-y"
              placeholder={"# Ejemplo\nnpm i -g pnpm\n"}
            />
            <p className="text-xs ide-muted mt-2">
              Estos comandos corren con permisos de root. Usalos solo para tareas de confianza.
            </p>
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
