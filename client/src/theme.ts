export interface IdeTheme {
  bg: string;
  panel: string;
  panelSoft: string;
  panelHover: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
}

export const DEFAULT_THEME: IdeTheme = {
  bg: "#0a0a0b",
  panel: "#121214",
  panelSoft: "#1a1a1d",
  panelHover: "#242429",
  border: "#34343a",
  text: "#f5f5f5",
  muted: "#b9b9c2",
  accent: "#52525b",
  accentHover: "#3f3f46",
};

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function normalizeTheme(raw: Partial<IdeTheme> | null | undefined): IdeTheme {
  if (!raw) return DEFAULT_THEME;

  return {
    bg: isHexColor(raw.bg || "") ? raw.bg! : DEFAULT_THEME.bg,
    panel: isHexColor(raw.panel || "") ? raw.panel! : DEFAULT_THEME.panel,
    panelSoft: isHexColor(raw.panelSoft || "") ? raw.panelSoft! : DEFAULT_THEME.panelSoft,
    panelHover: isHexColor(raw.panelHover || "") ? raw.panelHover! : DEFAULT_THEME.panelHover,
    border: isHexColor(raw.border || "") ? raw.border! : DEFAULT_THEME.border,
    text: isHexColor(raw.text || "") ? raw.text! : DEFAULT_THEME.text,
    muted: isHexColor(raw.muted || "") ? raw.muted! : DEFAULT_THEME.muted,
    accent: isHexColor(raw.accent || "") ? raw.accent! : DEFAULT_THEME.accent,
    accentHover: isHexColor(raw.accentHover || "") ? raw.accentHover! : DEFAULT_THEME.accentHover,
  };
}

export function applyTheme(theme: IdeTheme): void {
  const root = document.documentElement;
  root.style.setProperty("--ide-bg", theme.bg);
  root.style.setProperty("--ide-panel", theme.panel);
  root.style.setProperty("--ide-panel-soft", theme.panelSoft);
  root.style.setProperty("--ide-panel-hover", theme.panelHover);
  root.style.setProperty("--ide-border", theme.border);
  root.style.setProperty("--ide-text", theme.text);
  root.style.setProperty("--ide-muted", theme.muted);
  root.style.setProperty("--ide-accent", theme.accent);
  root.style.setProperty("--ide-accent-hover", theme.accentHover);
}
