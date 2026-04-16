import { useState, useEffect, useRef, useCallback } from "react";
import { IdeTheme } from "../theme";

interface ThemeCustomizerProps {
  theme: IdeTheme;
  onChange: (theme: IdeTheme) => void;
  onReset: () => void;
  token: string;
  onBrandingChange?: () => void;
}

interface ColorField {
  key: keyof IdeTheme;
  label: string;
}

const COLOR_FIELDS: ColorField[] = [
  { key: "bg", label: "Fondo" },
  { key: "panel", label: "Panel" },
  { key: "panelSoft", label: "Panel suave" },
  { key: "panelHover", label: "Hover panel" },
  { key: "border", label: "Borde" },
  { key: "text", label: "Texto" },
  { key: "muted", label: "Texto secundario" },
  { key: "accent", label: "Acento" },
  { key: "accentHover", label: "Acento hover" },
];

export function ThemeCustomizer({ theme, onChange, onReset, token, onBrandingChange }: ThemeCustomizerProps) {
  const [instanceName, setInstanceName] = useState("mini-ide");
  const [hasIcon, setHasIcon] = useState(false);
  const [iconUrl, setIconUrl] = useState("/icons/icon.svg");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/branding");
      const data = await res.json();
      setInstanceName(data.name || "mini-ide");
      setHasIcon(data.hasIcon);
      setIconUrl(data.hasIcon ? `/api/branding/icon?t=${Date.now()}` : "/icons/icon.svg");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const updateColor = (key: keyof IdeTheme, value: string) => {
    onChange({ ...theme, [key]: value });
  };

  const handleNameChange = (name: string) => {
    setInstanceName(name);
    if (nameTimeoutRef.current) clearTimeout(nameTimeoutRef.current);
    nameTimeoutRef.current = setTimeout(async () => {
      await fetch("/api/branding/name", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      onBrandingChange?.();
    }, 500);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert("La imagen es muy grande (max 1MB)");
      return;
    }

    setSaving(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const data = reader.result as string;
        await fetch("/api/branding/icon", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ data }),
        });
        setHasIcon(true);
        setIconUrl(`/api/branding/icon?t=${Date.now()}`);
        setSaving(false);
        onBrandingChange?.();
      };
      reader.readAsDataURL(file);
    } catch {
      setSaving(false);
    }

    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleIconDelete = async () => {
    setSaving(true);
    try {
      await fetch("/api/branding/icon", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setHasIcon(false);
      setIconUrl("/icons/icon.svg");
      onBrandingChange?.();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  return (
    <div className="h-full overflow-auto p-4 ide-root">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border ide-border ide-panel p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold ide-text">Marca</h2>
              <p className="text-sm ide-muted">Personaliza la identidad y apariencia de este entorno</p>
            </div>
            <button
              onClick={onReset}
              className="px-3 py-1.5 rounded text-xs font-medium border ide-border ide-muted transition-colors"
            >
              Restaurar colores
            </button>
          </div>

          {/* Identity: icon + name */}
          <div className="flex items-start gap-4 mb-5 pb-5 border-b ide-border">
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-xl border ide-border ide-panel-soft flex items-center justify-center overflow-hidden">
                <img
                  src={iconUrl}
                  alt="Icono"
                  className="w-full h-full object-contain"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                onChange={handleIconUpload}
                className="hidden"
              />
              <div className="flex gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                  className="px-2 py-1 text-xs rounded ide-accent text-white transition-colors disabled:opacity-50"
                >
                  {saving ? "..." : "Subir"}
                </button>
                {hasIcon && (
                  <button
                    onClick={handleIconDelete}
                    disabled={saving}
                    className="px-2 py-1 text-xs rounded border ide-border ide-muted transition-colors disabled:opacity-50"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-xs mb-1.5 ide-muted">Nombre</label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => handleNameChange(e.target.value)}
                maxLength={50}
                placeholder="mini-ide"
                className="w-full px-3 py-2 rounded border ide-border ide-panel ide-text text-sm"
              />
              <p className="text-xs ide-muted mt-1.5">Titulo de la ventana y nombre de la PWA al instalar</p>
            </div>
          </div>

          {/* Colors */}
          <div>
            <h3 className="text-sm font-medium ide-text mb-3">Colores</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {COLOR_FIELDS.map((field) => (
                <label key={field.key} className="rounded-lg border ide-border ide-panel-soft p-3">
                  <span className="block text-xs mb-2 ide-muted">{field.label}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme[field.key]}
                      onChange={(e) => updateColor(field.key, e.target.value)}
                      className="h-9 w-12 p-0 border-0 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[field.key]}
                      onChange={(e) => updateColor(field.key, e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border ide-border ide-panel ide-text text-sm font-mono"
                    />
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs ide-muted mt-3">Los colores se guardan en preferencias globales de esta instancia</p>
          </div>
        </div>
      </div>
    </div>
  );
}
