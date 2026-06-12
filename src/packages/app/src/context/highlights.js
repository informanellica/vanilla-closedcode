import { createComponent, createEffect, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { createSimpleContext } from "@/lib/context.js";
import { useDialog } from "@/lib/dialog.js";
import { usePlatform } from "@/context/platform.js";
import { useSettings } from "@/context/settings.js";
import { persisted } from "@/utils/persist.js";
import { DialogReleaseNotes } from "@/components/dialog-release-notes.js";
// No hosted changelog feed: release-notes fetching is disabled. Set this to a
// real JSON feed URL to re-enable the "What's New" dialog.
const CHANGELOG_URL = null;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getText(value) {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? text : undefined;
  }
  if (typeof value === "number") return String(value);
  return;
}
function normalizeVersion(value) {
  const text = value?.trim();
  if (!text) return;
  return text.startsWith("v") || text.startsWith("V") ? text.slice(1) : text;
}
function parseMedia(value, alt) {
  if (!isRecord(value)) return;
  const type = getText(value.type)?.toLowerCase();
  const src = getText(value.src) ?? getText(value.url);
  if (!src) return;
  if (type !== "image" && type !== "video") return;
  return {
    type,
    src,
    alt
  };
}
function parseHighlight(value) {
  if (!isRecord(value)) return;
  const title = getText(value.title);
  if (!title) return;
  const description = getText(value.description) ?? getText(value.shortDescription);
  if (!description) return;
  const media = parseMedia(value.media, title);
  return {
    title,
    description,
    media
  };
}
function parseRelease(value) {
  if (!isRecord(value)) return;
  const tag = getText(value.tag) ?? getText(value.tag_name) ?? getText(value.name);
  if (!Array.isArray(value.highlights)) {
    return {
      tag,
      highlights: []
    };
  }
  const highlights = value.highlights.flatMap(group => {
    if (!isRecord(group)) return [];
    const source = getText(group.source);
    if (!source) return [];
    if (!source.toLowerCase().includes("desktop")) return [];
    if (Array.isArray(group.items)) {
      return group.items.map(item => parseHighlight(item)).filter(item => item !== undefined);
    }
    const item = parseHighlight(group);
    if (!item) return [];
    return [item];
  });
  return {
    tag,
    highlights
  };
}
function parseChangelog(value) {
  if (Array.isArray(value)) {
    return value.map(parseRelease).filter(release => release !== undefined);
  }
  if (!isRecord(value)) return;
  if (!Array.isArray(value.releases)) return;
  return value.releases.map(parseRelease).filter(release => release !== undefined);
}
function sliceHighlights(input) {
  const current = normalizeVersion(input.current);
  const previous = normalizeVersion(input.previous);
  const releases = input.releases;
  const start = (() => {
    if (!current) return 0;
    const index = releases.findIndex(release => normalizeVersion(release.tag) === current);
    return index === -1 ? 0 : index;
  })();
  const end = (() => {
    if (!previous) return releases.length;
    const index = releases.findIndex((release, i) => i >= start && normalizeVersion(release.tag) === previous);
    return index === -1 ? releases.length : index;
  })();
  const highlights = releases.slice(start, end).flatMap(release => release.highlights);
  const seen = new Set();
  const unique = highlights.filter(highlight => {
    const key = dedupeKey(highlight);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.slice(0, 5);
}
function dedupeKey(highlight) {
  return [highlight.title, highlight.description, highlight.media?.type ?? "", highlight.media?.src ?? ""].join("\n");
}
function loadReleaseHighlights(value, current, previous) {
  const releases = parseChangelog(value);
  if (!releases?.length) return [];
  return sliceHighlights({
    releases,
    current,
    previous
  });
}
export const {
  use: useHighlights,
  provider: HighlightsProvider
} = createSimpleContext({
  name: "Highlights",
  gate: false,
  init: () => {
    const platform = usePlatform();
    const dialog = useDialog();
    const settings = useSettings();
    const [store, setStore, _, ready] = persisted("highlights.v1", createStore({
      version: undefined
    }));
    const [range, setRange] = createStore({
      from: undefined,
      to: undefined
    });
    const state = {
      started: false
    };
    let timer;
    const clearTimer = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    };
    const markSeen = () => {
      if (!platform.version) return;
      setStore("version", platform.version);
    };
    const start = previous => {
      if (!settings.general.releaseNotes()) {
        markSeen();
        return;
      }
      // No hosted changelog feed: skip the network fetch entirely.
      if (!CHANGELOG_URL) {
        markSeen();
        return;
      }
      const fetcher = platform.fetch ?? fetch;
      const controller = new AbortController();
      onCleanup(() => {
        controller.abort();
        clearTimer();
      });
      fetcher(CHANGELOG_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/json"
        }
      }).then(response => response.ok ? response.json() : undefined).then(json => {
        if (!json) return;
        const highlights = loadReleaseHighlights(json, platform.version, previous);
        if (controller.signal.aborted) return;
        if (highlights.length === 0) {
          markSeen();
          return;
        }
        timer = setTimeout(() => {
          timer = undefined;
          markSeen();
          dialog.show(() => createComponent(DialogReleaseNotes, {
            highlights: highlights
          }));
        }, 500);
      }).catch(() => undefined);
    };
    createEffect(() => {
      if (state.started) return;
      if (!ready()) return;
      if (!settings.ready()) return;
      if (!platform.version) return;
      state.started = true;
      const previous = store.version;
      if (!previous) {
        setStore("version", platform.version);
        return;
      }
      if (previous === platform.version) return;
      setRange({
        from: previous,
        to: platform.version
      });
      start(previous);
    });
    return {
      ready,
      from: () => range.from,
      to: () => range.to,
      get last() {
        return store.version;
      },
      markSeen
    };
  }
});