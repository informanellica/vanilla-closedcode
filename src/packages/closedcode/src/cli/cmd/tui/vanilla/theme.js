// 24-bit theme for the vanilla TUI. Colors are HEX strings (terminal-kit
// ScreenBufferHD converts them to RGBA via hexToRgba), giving true-color fidelity
// — the screen + all draws run on ScreenBufferHD. This default is a dark palette
// (Catppuccin Mocha); a later stage loads the user's real theme JSON. Token names
// mirror the live ThemeProvider so renderers reference them by name.
export const defaultTheme = {
  background: "#1e1e2e",
  backgroundElement: "#181825",
  text: "#cdd6f4",
  textMuted: "#7f849c",
  primary: "#89b4fa",
  accent: "#cba6f7",
  error: "#f38ba8",
  warning: "#f9e2af",
  success: "#a6e3a1",
  info: "#89dceb",
  selected: "#89b4fa",
  secondary: "#74c7ec",
  border: "#45475a",
  // markdown / syntax / diff tokens
  markdownHeading: "#89b4fa",
  markdownCode: "#f9e2af",
  markdownLink: "#74c7ec",
  markdownQuote: "#7f849c",
  codeBlock: "#a6e3a1",
  diffAdded: "#a6e3a1",
  diffRemoved: "#f38ba8",
  diffContext: "#7f849c",
  syntaxKeyword: "#cba6f7",
  syntaxString: "#a6e3a1",
  syntaxComment: "#6c7086",
  syntaxNumber: "#fab387",
  syntaxType: "#f9e2af",
  syntaxFunction: "#89b4fa",
  syntaxOperator: "#89dceb",
  syntaxPunctuation: "#bac2de",
};

// Build a terminal-kit (HD) attr from a theme token (+ optional flags). Falls back
// to the text color for an unknown token (never "default" — HD has no default).
export function attr(theme, token, extra = {}) {
  return { color: theme[token] ?? theme.text ?? "#cdd6f4", ...extra };
}
