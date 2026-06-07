;(function () {
  // Bootstrap 5.3 color modes only. Set data-bs-theme on <html> before first
  // paint to avoid a flash of the wrong color mode. No token CSS is injected.
  // Mirrors the ThemeProvider contract: key "closedcode-color-scheme" holding
  // "system" | "light" | "dark"; "system" resolves via prefers-color-scheme.
  var scheme = "system"
  try {
    var stored = localStorage.getItem("closedcode-color-scheme") || localStorage.getItem("opencode-color-scheme")
    if (stored === "light" || stored === "dark" || stored === "system") scheme = stored
  } catch (e) {}
  var prefersDark =
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
  var mode = scheme === "system" ? (prefersDark ? "dark" : "light") : scheme
  document.documentElement.setAttribute("data-bs-theme", mode)
})()
