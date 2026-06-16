/** @file Highlights context: parses an optional release changelog feed and surfaces new "What's New" highlights between the user's last-seen and current app version. */
import { createComponent, createEffect, onCleanup } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { createSimpleContext } from "@/lib/context.js";
import { useDialog } from "@/lib/dialog.js";
import { usePlatform } from "@/context/platform.js";
import { useSettings } from "@/context/settings.js";
import { persisted } from "@/utils/persist.js";
import { DialogReleaseNotes } from "@/components/dialog-release-notes.js";
// No hosted changelog feed: release-notes fetching is disabled. Set this to a
// real JSON feed URL to re-enable the "What's New" dialog.
const CHANGELOG_URL = null;
/**
 * Test whether a value is a plain object record (not null and not an array).
 * @param {*} value - Candidate value.
 * @returns {boolean} True when the value is a non-array object.
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * Coerce a value to a trimmed non-empty string, accepting numbers.
 * @param {*} value - Candidate value.
 * @returns {string} The trimmed string (or stringified number), or undefined when empty/unsupported.
 */
function getText(value) {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? text : undefined;
  }
  if (typeof value === "number") return String(value);
  return;
}
/**
 * Normalize a version string by trimming and dropping a leading "v"/"V" prefix.
 * @param {string} value - Raw version or tag string.
 * @returns {string} The bare version, or undefined when empty.
 */
function normalizeVersion(value) {
  const text = value?.trim();
  if (!text) return;
  return text.startsWith("v") || text.startsWith("V") ? text.slice(1) : text;
}
/**
 * Parse a media descriptor into a normalized {type, src, alt}, accepting only image/video types with a source.
 * @param {*} value - Raw media record with `type` and `src`/`url`.
 * @param {string} alt - Alt text to attach (typically the highlight title).
 * @returns {Object} Normalized media {type, src, alt}, or undefined when invalid.
 */
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
/**
 * Parse a single highlight entry, requiring a title and a description (or shortDescription) and parsing optional media.
 * @param {*} value - Raw highlight record.
 * @returns {Object} Normalized highlight {title, description, media}, or undefined when title/description are missing.
 */
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
/**
 * Parse one release entry, keeping only highlight groups sourced from "desktop" and flattening their items.
 * @param {*} value - Raw release record with `tag`/`tag_name`/`name` and a `highlights` array of groups.
 * @returns {Object} Normalized release {tag, highlights}, or undefined when the value is not a record.
 */
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
/**
 * Parse a changelog feed (either a bare array of releases or an object with a `releases` array) into normalized releases.
 * @param {*} value - Raw changelog payload.
 * @returns {Array} Normalized releases, or undefined when the shape is unrecognised.
 */
function parseChangelog(value) {
  if (Array.isArray(value)) {
    return value.map(parseRelease).filter(release => release !== undefined);
  }
  if (!isRecord(value)) return;
  if (!Array.isArray(value.releases)) return;
  return value.releases.map(parseRelease).filter(release => release !== undefined);
}
/**
 * Collect highlights for releases between the current and previously-seen versions, deduped and capped at five.
 * The slice runs from the current version's release down to (but excluding) the previous version's release.
 * @param {Object} input - Slice inputs: {releases: Array, current: string, previous: string}.
 * @returns {Array} Up to five unique highlights spanning the version range.
 */
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
/**
 * Build a stable dedupe key for a highlight from its title, description, and media type/src.
 * @param {Object} highlight - Normalized highlight {title, description, media}.
 * @returns {string} Newline-joined dedupe key.
 */
function dedupeKey(highlight) {
  return [highlight.title, highlight.description, highlight.media?.type ?? "", highlight.media?.src ?? ""].join("\n");
}
/**
 * Parse a raw changelog and extract the highlights to show between two versions.
 * @param {*} value - Raw changelog payload.
 * @param {string} current - Current app version.
 * @param {string} previous - Previously-seen app version.
 * @returns {Array} Highlights to display, empty when the changelog yields none.
 */
function loadReleaseHighlights(value, current, previous) {
  const releases = parseChangelog(value);
  if (!releases?.length) return [];
  return sliceHighlights({
    releases,
    current,
    previous
  });
}
/**
 * Highlights context exposing the "What's New" version range and last-seen tracking.
 * `useHighlights` reads the context; `HighlightsProvider` installs it.
 * The context value provides: {ready, from(), to(), last (last-seen version), markSeen()}.
 * The `init` factory wires platform/dialog/settings, persists the last-seen version, and on a version
 * change (when release notes are enabled and a changelog URL is configured) fetches and shows new highlights.
 */
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
    // Cancel any pending dialog timer.
    const clearTimer = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    };
    // Persist the current platform version as the last-seen version.
    const markSeen = () => {
      if (!platform.version) return;
      setStore("version", platform.version);
    };
    /**
     * Begin the highlights flow for an upgrade: short-circuit when notes are disabled or no feed is configured,
     * otherwise fetch the changelog and, if there are highlights, mark seen and open the release-notes dialog.
     * @param {string} previous - The previously-seen app version.
     */
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