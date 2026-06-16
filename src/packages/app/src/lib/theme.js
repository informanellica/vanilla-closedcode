/**
 * @file App-level theme entry: re-exports the single vendored theme
 * implementation so the ThemeProvider and every consumer share one context.
 */
// Theme infra. To avoid a split-brain context (two separate Theme context
// instances — one here, one under @/vendor/ui), this module re-exports the
// single vendored theme implementation. The app's ThemeProvider (mounted in
// app.js) and every consumer — app-level (@/lib/theme) and vendored
// (@/vendor/ui/theme) alike — therefore share ONE context object.
export * from "@/vendor/ui/theme/index.js";
