export function isAllowedCorsOrigin(input, opts) {
  if (!input) return true;
  if (input.startsWith("http://localhost:")) return true;
  if (input.startsWith("http://127.0.0.1:")) return true;
  if (input.startsWith("vcc://renderer")) return true;
  return opts?.cors?.includes(input) ?? false;
}