import { resolveThemeVariant, themeToCss } from "./resolve.js";
let activeTheme = null;
const THEME_STYLE_ID = "closedcode-theme";
function ensureLoaderStyleElement() {
  const existing = document.getElementById(THEME_STYLE_ID);
  if (existing) {
    return existing;
  }
  const element = document.createElement("style");
  element.id = THEME_STYLE_ID;
  document.head.appendChild(element);
  return element;
}
export function applyTheme(theme, themeId) {
  activeTheme = theme;
  const lightTokens = resolveThemeVariant(theme.light, false);
  const darkTokens = resolveThemeVariant(theme.dark, true);
  const targetThemeId = themeId ?? theme.id;
  const css = buildThemeCss(lightTokens, darkTokens, targetThemeId);
  const themeStyleElement = ensureLoaderStyleElement();
  themeStyleElement.textContent = css;
  document.documentElement.setAttribute("data-theme", targetThemeId);
}
function buildThemeCss(light, dark, themeId) {
  const isDefaultTheme = themeId === "oc-2";
  const lightCss = themeToCss(light);
  const darkCss = themeToCss(dark);
  if (isDefaultTheme) {
    return `
:root {
  color-scheme: light;
  --text-mix-blend-mode: multiply;

  ${lightCss}

  @media (prefers-color-scheme: dark) {
    color-scheme: dark;
    --text-mix-blend-mode: plus-lighter;

    ${darkCss}
  }
}
`;
  }
  return `
html[data-theme="${themeId}"] {
  color-scheme: light;
  --text-mix-blend-mode: multiply;

  ${lightCss}

  @media (prefers-color-scheme: dark) {
    color-scheme: dark;
    --text-mix-blend-mode: plus-lighter;

    ${darkCss}
  }
}
`;
}
export async function loadThemeFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load theme from ${url}: ${response.statusText}`);
  }
  return response.json();
}
export function getActiveTheme() {
  const activeId = document.documentElement.getAttribute("data-theme");
  if (!activeId) {
    return null;
  }
  if (activeTheme?.id === activeId) {
    return activeTheme;
  }
  return null;
}
export function removeTheme() {
  activeTheme = null;
  const existingElement = document.getElementById(THEME_STYLE_ID);
  if (existingElement) {
    existingElement.remove();
  }
  document.documentElement.removeAttribute("data-theme");
}
export function setColorScheme(scheme) {
  if (scheme === "auto") {
    document.documentElement.style.removeProperty("color-scheme");
  } else {
    document.documentElement.style.setProperty("color-scheme", scheme);
  }
}