/** @file Applies a color scheme by setting the Bootstrap `data-bs-theme` attribute on the document root. */
// Bootstrap 5.3 color modes only. The custom design-token CSS injection
// (<style id="closedcode-theme">) has been removed; colors are driven entirely by
// the `data-bs-theme` attribute set by ThemeProvider.

/**
 * Set the active color scheme on the document root via the Bootstrap `data-bs-theme` attribute.
 * "auto"/"system" map to "light"; "light"/"dark" are applied directly. No-op outside a DOM.
 * @param {string} scheme - Color scheme to apply ("auto", "system", "light", or "dark").
 * @returns {void}
 */
export function setColorScheme(scheme) {
  // Bootstrap color modes are driven by data-bs-theme on <html>.
  if (typeof document !== "object") return;
  if (scheme === "auto" || scheme === "system") {
    document.documentElement.setAttribute("data-bs-theme", "light");
    return;
  }
  if (scheme === "light" || scheme === "dark") {
    document.documentElement.setAttribute("data-bs-theme", scheme);
  }
}
