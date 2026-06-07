const isDrive = value => {
  if (value.length !== 2) return false;
  const code = value.charCodeAt(0);
  return value[1] === ":" && (code >= 65 && code <= 90 || code >= 97 && code <= 122);
};
const trimTrailingSlashes = value => {
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] !== "/") return value.slice(0, i + 1);
  }
  return "";
};
const isWindowsPath = value => value[1] === ":" || value.startsWith("\\\\");
export const pathKey = path => {
  const value = isWindowsPath(path) ? path.replaceAll("\\", "/") : path;
  const trimmed = trimTrailingSlashes(value);
  if (!trimmed && value.startsWith("/")) return "/";
  if (isDrive(trimmed)) return `${trimmed}/`;
  return trimmed;
};