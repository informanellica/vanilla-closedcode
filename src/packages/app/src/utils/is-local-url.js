/** @file Detects whether a URL points to a local/private network host. */
/**
 * Test whether a host string is a private or loopback IPv4 address.
 * @param {string} host - The host string to test (e.g. "192.168.0.1").
 * @returns {boolean} True if the host is a valid private/loopback IPv4 address.
 */
function isPrivateIPv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some(n => n < 0 || n > 255)) return false;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}
/**
 * Test whether a host string is a loopback or unique-local/link-local IPv6 address.
 * @param {string} host - The host string to test (without surrounding brackets).
 * @returns {boolean} True if the host is a loopback or private IPv6 address.
 */
function isPrivateIPv6(host) {
  const lower = host.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
  return false;
}
/**
 * Determine whether a URL resolves to a local host (localhost, private IPv4/IPv6,
 * or a local-style TLD such as .local/.lan/.internal).
 * @param {string} url - The URL to inspect.
 * @returns {boolean} True if the URL's hostname is considered local; false on parse failure.
 */
export function isLocalURL(url) {
  try {
    let {
      hostname
    } = new URL(url);
    if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
    if (hostname === "localhost") return true;
    if (isPrivateIPv4(hostname)) return true;
    if (hostname.includes(":") && isPrivateIPv6(hostname)) return true;
    if (hostname.endsWith(".local") || hostname.endsWith(".lan") || hostname.endsWith(".internal")) return true;
    return false;
  } catch {
    return false;
  }
}