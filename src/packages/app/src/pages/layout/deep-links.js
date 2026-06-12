export const deepLinkEvent = "closedcode:deep-link";
const parseUrl = input => {
  if (!input.startsWith("closedcode://")) return;
  if (typeof URL.canParse === "function" && !URL.canParse(input)) return;
  try {
    return new URL(input);
  } catch {
    return;
  }
};
export const parseDeepLink = input => {
  const url = parseUrl(input);
  if (!url) return;
  if (url.hostname !== "open-project") return;
  const directory = url.searchParams.get("directory");
  if (!directory) return;
  return directory;
};
export const parseNewSessionDeepLink = input => {
  const url = parseUrl(input);
  if (!url) return;
  if (url.hostname !== "new-session") return;
  const directory = url.searchParams.get("directory");
  if (!directory) return;
  const prompt = url.searchParams.get("prompt") || undefined;
  if (!prompt) return {
    directory
  };
  return {
    directory,
    prompt
  };
};
export const collectOpenProjectDeepLinks = urls => urls.map(parseDeepLink).filter(directory => !!directory);
export const collectNewSessionDeepLinks = urls => urls.map(parseNewSessionDeepLink).filter(link => !!link);
export const drainPendingDeepLinks = target => {
  const pending = target.__CLOSEDCODE__?.deepLinks ?? [];
  if (pending.length === 0) return [];
  if (target.__CLOSEDCODE__) target.__CLOSEDCODE__.deepLinks = [];
  return pending;
};