import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { syntaxHighlighting } from "@codemirror/language";

function getCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

export function createIdeTheme(): Extension {
  const bg = getCssVar("--ide-panel", "#121214");
  const bgSoft = getCssVar("--ide-panel-soft", "#1a1a1d");
  const bgHover = getCssVar("--ide-panel-hover", "#242429");
  const border = getCssVar("--ide-border", "#34343a");
  const text = getCssVar("--ide-text", "#f5f5f5");
  const muted = getCssVar("--ide-muted", "#b9b9c2");

  const theme = EditorView.theme({
    "&": {
      backgroundColor: bg,
      color: text,
      height: "100%",
    },
    ".cm-content": {
      caretColor: text,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontSize: "13px",
      lineHeight: "1.6",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: text,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: bgHover + " !important",
    },
    ".cm-activeLine": {
      backgroundColor: bgSoft,
    },
    ".cm-gutters": {
      backgroundColor: bg,
      color: muted,
      border: "none",
      borderRight: `1px solid ${border}`,
    },
    ".cm-activeLineGutter": {
      backgroundColor: bgSoft,
    },
    ".cm-foldPlaceholder": {
      backgroundColor: bgHover,
      border: `1px solid ${border}`,
      color: muted,
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-matchingBracket": {
      backgroundColor: bgHover,
      outline: `1px solid ${muted}`,
    },
  }, { dark: true });

  return [theme, syntaxHighlighting(oneDarkHighlightStyle)];
}

export function getLanguageExtension(filename: string): (() => Promise<Extension>) | null {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const langMap: Record<string, () => Promise<Extension>> = {
    js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
    jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
    ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
    tsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true })),
    json: () => import("@codemirror/lang-json").then((m) => m.json()),
    html: () => import("@codemirror/lang-html").then((m) => m.html()),
    css: () => import("@codemirror/lang-css").then((m) => m.css()),
    py: () => import("@codemirror/lang-python").then((m) => m.python()),
    md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
    markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  };

  return langMap[ext] || null;
}
