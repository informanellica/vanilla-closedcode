// Minimal palette for the vanilla TUI app shell (Stage T3). The live app's
// ThemeProvider resolves 24-bit hex colors from the user's theme; this is a
// stand-in mapping of the theme TOKENS the shell uses to terminal-kit attr
// colors, so the shell renders standalone (and under node tests) before the real
// theme is wired in at a later T3 stage. Keys mirror context/theme.js token names.
export const defaultTheme = {
  background: "default",
  text: "white",
  textMuted: "gray",
  primary: "brightCyan",
  accent: "brightMagenta",
  error: "brightRed",
  warning: "brightYellow",
  success: "brightGreen",
  info: "brightBlue",
  selected: "brightCyan",
  secondary: "brightBlue",
  border: "gray",
  backgroundElement: "default",
  // markdown / syntax / diff tokens (the live ThemeProvider resolves these to
  // 24-bit hex; here they map to terminal-kit named colors as a stand-in)
  markdownHeading: "brightCyan",
  markdownCode: "brightYellow",
  markdownLink: "brightBlue",
  markdownQuote: "gray",
  codeBlock: "brightGreen",
  diffAdded: "brightGreen",
  diffRemoved: "brightRed",
  diffContext: "gray",
  // syntax-highlight tokens (vanilla/syntax.js); stand-ins until the real theme
  syntaxKeyword: "brightMagenta",
  syntaxString: "brightGreen",
  syntaxComment: "gray",
  syntaxNumber: "brightYellow",
  syntaxType: "brightCyan",
  syntaxFunction: "brightBlue",
  syntaxOperator: "white",
  syntaxPunctuation: "gray",
};

// Build a terminal-kit attr from a theme token (+ optional bg token / flags).
export function attr(theme, token, extra = {}) {
  return { color: theme[token] ?? "default", ...extra };
}
