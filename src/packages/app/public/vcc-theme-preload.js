/**
 * @file Render-blocking preload script that applies the saved Bootstrap 5.3
 * color mode to the document root before first paint, preventing a flash of the
 * wrong theme. Reads the persisted "closedcode-color-scheme" preference
 * ("system" | "light" | "dark"), resolves "system" via prefers-color-scheme,
 * and sets the resulting mode as data-bs-theme on the <html> element.
 */
;(function () {
  // Bootstrap 5.3 color modes only. Set data-bs-theme on <html> before first
  // paint to avoid a flash of the wrong color mode. No token CSS is injected.
  // Mirrors the ThemeProvider contract: key "closedcode-color-scheme" holding
  // "system" | "light" | "dark"; "system" resolves via prefers-color-scheme.
  var scheme = "system"
  try {
    var stored = localStorage.getItem("closedcode-color-scheme")
    if (stored === "light" || stored === "dark" || stored === "system") scheme = stored
  } catch (e) {}
  var prefersDark =
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
  var mode = scheme === "system" ? (prefersDark ? "dark" : "light") : scheme
  document.documentElement.setAttribute("data-bs-theme", mode)
})()
