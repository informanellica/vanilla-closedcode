/** @file FileMedia component: renders image/audio/SVG/binary previews for a file with loading and error states. */
import { createEffect, createMemo, createRenderEffect, createResource, createRoot, createSignal, on, onCleanup, untrack } from "../../../lib/reactivity.js";
import { useI18n } from "../context/i18n.js";
import { dataUrlFromMediaValue, hasMediaValue, isBinaryContent, mediaKindFromPath, normalizeMimeType, svgTextFromValue } from "../pierre/media.js";

// Build the static skeletons that the compiled templates produced. Each helper
// returns a fresh element tree (the compiled templates cloned a fresh node per
// call), so callers never share DOM between branches.
/**
 * Build the empty state/message container skeleton.
 * @returns {HTMLElement} A fresh centered text container element.
 */
function tmplState() {
  const root = document.createElement("div");
  root.className = "d-flex min-h-40 align-items-center justify-content-center px-6 py-4 text-center text-secondary";
  return root;
}
/**
 * Build the image preview skeleton.
 * @returns {Object} An object with root container and the inner img element.
 */
function tmplImage() {
  const root = document.createElement("div");
  root.className = "d-flex justify-content-center bg-body px-6 py-4";
  const img = document.createElement("img");
  img.className = "max-h-[60vh] max-w-full rounded-2 border border-body object-contain";
  root.appendChild(img);
  return { root, img };
}
/**
 * Build the audio preview skeleton.
 * @returns {Object} An object with root container, the audio element, and its source element.
 */
function tmplAudio() {
  const root = document.createElement("div");
  root.className = "d-flex justify-content-center bg-body px-6 py-4";
  const audio = document.createElement("audio");
  audio.className = "w-100 max-w-xl";
  audio.setAttribute("controls", "");
  audio.setAttribute("preload", "metadata");
  const source = document.createElement("source");
  audio.appendChild(source);
  root.appendChild(audio);
  return { root, audio, source };
}
/**
 * Build the SVG branch column wrapper skeleton.
 * @returns {HTMLElement} A fresh column wrapper element.
 */
function tmplSvgWrap() {
  const root = document.createElement("div");
  root.className = "d-flex flex-column gap-4 px-6 py-4";
  return root;
}
/**
 * Build the SVG image preview skeleton.
 * @returns {Object} An object with root container and the inner img element.
 */
function tmplSvgImage() {
  const root = document.createElement("div");
  root.className = "d-flex justify-content-center";
  const img = document.createElement("img");
  img.className = "max-h-[60vh] max-w-full rounded-2 border border-body object-contain";
  root.appendChild(img);
  return { root, img };
}
/**
 * Build the binary-file placeholder skeleton.
 * @returns {Object} An object with root container plus title and desc text elements.
 */
function tmplBinary() {
  const root = document.createElement("div");
  root.className = "d-flex min-h-56 flex-column align-items-center justify-content-center gap-2 px-6 py-10 text-center";
  const title = document.createElement("div");
  title.className = "fw-semibold text-body-emphasis";
  const desc = document.createElement("div");
  desc.className = "fw-normal text-secondary";
  root.appendChild(title);
  root.appendChild(desc);
  return { root, title, desc };
}

/**
 * Set or remove an attribute, removing it when the value is nullish.
 * @param {Element} el - The target element.
 * @param {string} name - The attribute name.
 * @param {*} value - The attribute value; null/undefined removes the attribute.
 * @returns {void}
 */
// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/**
 * Flatten a fallback/child value into an array of DOM nodes.
 * @param {*} value - A Node, array, accessor function, text, or nullish value.
 * @returns {Array} The resolved DOM nodes (empty for nullish/boolean values).
 */
// Resolve a fallback/child value into DOM nodes. props.fallback() may return a
// Node, an array, an accessor, or text; flatten it like the compiled insert().
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

/**
 * Reactively keep the nodes from `read()` mounted just before a marker.
 * Re-resolves inside a render effect; unchanged results leave the DOM untouched.
 * @param {Node} parent - The parent element to insert into.
 * @param {Node} marker - The reference node to insert before (null inserts at the end).
 * @param {Function} read - Accessor returning the value to resolve into nodes.
 * @returns {void}
 */
// Mirror compiled insert(parent, value, marker): keep the resolved nodes placed
// right before the marker, re-resolving inside a render effect so reactive
// accessors stay live. Unchanged results leave the DOM untouched.
function renderBefore(parent, marker, read) {
  let current = [];
  createRenderEffect(() => {
    const nodes = resolveNodes(read());
    let same = nodes.length === current.length;
    for (let i = 0; same && i < nodes.length; i++) same = nodes[i] === current[i];
    if (same) return;
    for (const node of current) {
      if (!nodes.includes(node) && node.parentNode === parent) parent.removeChild(node);
    }
    for (const node of nodes) parent.insertBefore(node, marker);
    current = nodes;
  });
}

/**
 * Pick the effective media value, preferring the current value, then after/before.
 * @param {Object} cfg - The media config (current, after, before fields).
 * @param {string} mode - The media kind (e.g. "image"); reserved for kind-specific selection.
 * @returns {*} The selected media value.
 */
function mediaValue(cfg, mode) {
  if (cfg.current !== undefined) return cfg.current;
  if (mode === "image") return cfg.after ?? cfg.before;
  return cfg.after ?? cfg.before;
}
/**
 * Render a file's media preview, choosing between image, audio, SVG, binary, and fallback branches.
 * Loads remote media via the config's readFile, tracks loading/error/ready status, and reacts to
 * the controlled `props.media` config and i18n changes.
 * @param {Object} props - Props: media (the media config: path, mode, current/before/after, readFile, onLoad, onError, deleted) and fallback (accessor producing the fallback content).
 * @returns {Function} An accessor returning the current branch's DOM node(s) for the caller to insert.
 */
export function FileMedia(props) {
  const i18n = useI18n();
  const cfg = () => props.media;
  const kind = createMemo(() => {
    const media = cfg();
    if (!media || media.mode === "off") return;
    return mediaKindFromPath(media.path);
  });
  const isBinary = createMemo(() => {
    const media = cfg();
    if (!media || media.mode === "off") return false;
    if (kind()) return false;
    return isBinaryContent(media.current);
  });
  const onLoad = () => props.media?.onLoad?.();
  const deleted = createMemo(() => {
    const media = cfg();
    const k = kind();
    if (!media || !k) return false;
    if (media.deleted) return true;
    if (k === "svg") return false;
    if (media.current !== undefined) return false;
    return !hasMediaValue(media.after) && hasMediaValue(media.before);
  });
  const direct = createMemo(() => {
    const media = cfg();
    const k = kind();
    if (!media || k !== "image" && k !== "audio") return;
    return dataUrlFromMediaValue(mediaValue(media, k), k);
  });
  const request = createMemo(() => {
    const media = cfg();
    const k = kind();
    if (!media || k !== "image" && k !== "audio") return;
    if (media.current !== undefined) return;
    if (deleted()) return;
    if (direct()) return;
    if (!media.path || !media.readFile) return;
    return {
      key: `${k}:${media.path}`,
      kind: k,
      path: media.path,
      readFile: media.readFile,
      onError: media.onError
    };
  });
  const [loaded] = createResource(request, async input => {
    return input.readFile(input.path).then(result => {
      const src = dataUrlFromMediaValue(result, input.kind);
      if (!src) {
        input.onError?.({
          kind: input.kind
        });
        return {
          key: input.key,
          error: true
        };
      }
      return {
        key: input.key,
        src,
        mime: input.kind === "audio" ? normalizeMimeType(result?.mimeType) : undefined
      };
    }, () => {
      input.onError?.({
        kind: input.kind
      });
      return {
        key: input.key,
        error: true
      };
    });
  });
  const remote = createMemo(() => {
    const input = request();
    const value = loaded();
    if (!input || !value || value.key !== input.key) return;
    return value;
  });
  const src = createMemo(() => {
    const value = remote();
    return direct() ?? (value && "src" in value ? value.src : undefined);
  });
  const status = createMemo(() => {
    if (direct()) return "ready";
    if (!request()) return "idle";
    if (loaded.loading) return "loading";
    if (remote()?.error) return "error";
    if (src()) return "ready";
    return "idle";
  });
  const audioMime = createMemo(() => {
    const value = remote();
    return value && "mime" in value ? value.mime : undefined;
  });
  const svgSource = createMemo(() => {
    const media = cfg();
    if (!media || kind() !== "svg") return;
    return svgTextFromValue(media.current);
  });
  const svgSrc = createMemo(() => {
    const media = cfg();
    if (!media || kind() !== "svg") return;
    return dataUrlFromMediaValue(media.current, "svg");
  });
  const svgInvalid = createMemo(() => {
    const media = cfg();
    if (!media || kind() !== "svg") return;
    if (svgSource() !== undefined) return;
    if (!hasMediaValue(media.current)) return;
    return [media.path, media.current];
  });
  createEffect(on(svgInvalid, value => {
    if (!value) return;
    cfg()?.onError?.({
      kind: "svg"
    });
  }, {
    defer: true
  }));
  const kindLabel = value => i18n.t(value === "image" ? "ui.fileMedia.kind.image" : "ui.fileMedia.kind.audio");

  /**
   * Build the image or audio element with live src/alt/type bindings.
   * @returns {*} The media root element, or the fallback when the kind is neither image nor audio.
   */
  // <Show when={src()}>{value => media}</Show> child: build the image or audio
  // template once and keep src/alt/type live, like the compiled effect().
  const buildMedia = () => {
    const k = kind();
    if (k !== "image" && k !== "audio") return props.fallback();
    if (k === "image") {
      const { root, img } = tmplImage();
      img.addEventListener("load", onLoad);
      let prevSrc;
      let prevAlt;
      createRenderEffect(() => {
        const nextSrc = src();
        const nextAlt = cfg()?.path;
        if (nextSrc !== prevSrc) setAttr(img, "src", prevSrc = nextSrc);
        if (nextAlt !== prevAlt) setAttr(img, "alt", prevAlt = nextAlt);
      });
      return root;
    }
    const { root, audio, source } = tmplAudio();
    audio.addEventListener("loadedmetadata", onLoad);
    let prevSrc;
    let prevType;
    createRenderEffect(() => {
      const nextSrc = src();
      const nextType = audioMime();
      if (nextSrc !== prevSrc) setAttr(source, "src", prevSrc = nextSrc);
      if (nextType !== prevType) setAttr(source, "type", prevType = nextType);
    });
    return root;
  };

  /**
   * Produce an accessor yielding the media node when a source is ready, else a state/fallback node.
   * @returns {Function} An accessor (memo) resolving to the current image/audio node or a state message node.
   */
  // <Show when={src()} fallback={...}>: yields the media node when src() is
  // truthy, otherwise the state/fallback node. Equal truthiness never rebuilds.
  // Returned as an accessor so the caller resolves it reactively, mirroring the
  // compiled Show child.
  const showMedia = () => {
    const shown = createMemo(() => !!src());
    // Mirror Show: the branch is keyed only on when()'s truthiness, so the
    // child/fallback is rendered once per flip. The state-snapshot reads below
    // (kind/deleted/status) are untracked so a same-truthiness change never
    // re-renders the branch, exactly like the compiled Show fallback getter.
    return createMemo(() => {
      const visible = shown();
      return untrack(() => {
        if (visible) return buildMedia();
        const media = cfg();
        const k = kind();
        if (!media || k !== "image" && k !== "audio") return props.fallback();
        const label = kindLabel(k);
        const stateNode = messageKey => {
          const node = tmplState();
          // The translated text is the only live binding here; the compiled
          // template re-ran insert() on language change.
          createRenderEffect(() => {
            node.textContent = i18n.t(messageKey, { kind: label });
          });
          return node;
        };
        if (deleted()) return stateNode("ui.fileMedia.state.removed");
        if (status() === "loading") return stateNode("ui.fileMedia.state.loading");
        if (status() === "error") return stateNode("ui.fileMedia.state.error");
        return stateNode("ui.fileMedia.state.unavailable");
      });
    });
  };

  /**
   * Build the SVG branch: a fallback region for invalid/text-only SVG plus a live image region.
   * @returns {Node} The column wrapper element, or the fallback when there is no SVG text and no data URL.
   */
  // SVG branch: if there is no inline text and no data URL, fall back; otherwise
  // a column wrapper holding two Shows inserted at the end of the wrapper, like
  // the compiled insert(wrap, Show, null).
  const buildSvg = () => {
    if (svgSource() === undefined && svgSrc() == null) return props.fallback();
    const wrap = tmplSvgWrap();
    // Marker between the two Shows so the fallback region always precedes the
    // image region regardless of which toggles first, mirroring the compiled
    // insert() markers.
    const marker = document.createComment("");
    wrap.appendChild(marker);

    // <Show when={svgSource() !== undefined}>{props.fallback()}</Show>. Key on
    // the boolean so the fallback child is built once per truthiness flip, not
    // rebuilt whenever the source text changes (matching Show semantics).
    const fallbackNode = createMemo(() => {
      if (svgSource() === undefined) return undefined;
      return untrack(() => props.fallback());
    });
    renderBefore(wrap, marker, () => fallbackNode());

    // <Show when={svgSrc()}>{value => svg image}</Show>. Built once per flip;
    // src/alt stay live through the inner render effect.
    const shown = createMemo(() => !!svgSrc());
    const imageNode = createMemo(() => {
      if (!shown()) return undefined;
      return untrack(() => {
        const { root, img } = tmplSvgImage();
        img.addEventListener("load", onLoad);
        let prevSrc;
        let prevAlt;
        createRenderEffect(() => {
          const nextSrc = svgSrc();
          const nextAlt = cfg()?.path;
          if (nextSrc !== prevSrc) setAttr(img, "src", prevSrc = nextSrc);
          if (nextAlt !== prevAlt) setAttr(img, "alt", prevAlt = nextAlt);
        });
        return root;
      });
    });
    renderBefore(wrap, null, () => imageNode());
    return wrap;
  };

  /**
   * Build the binary-file placeholder with a live file-name title and path-aware description.
   * @returns {HTMLElement} The binary placeholder root element.
   */
  // Binary branch: title = file name (last path segment), description = the
  // path-aware translated string. Both stay live via render effects.
  const buildBinary = () => {
    const { root, title, desc } = tmplBinary();
    createRenderEffect(() => {
      title.textContent = cfg()?.path?.split("/").pop() ?? i18n.t("ui.fileMedia.binary.title");
    });
    createRenderEffect(() => {
      const path = cfg()?.path;
      if (!path) {
        desc.textContent = i18n.t("ui.fileMedia.binary.description.default");
        return;
      }
      desc.textContent = i18n.t("ui.fileMedia.binary.description.path", { path });
    });
    return root;
  };

  /**
   * Build the reactive content for a single Switch branch.
   * @param {string} which - The branch to build: "media", "svg", "binary", or "fallback".
   * @returns {Function} An accessor returning the branch's current node(s).
   */
  // Build one branch's reactive content (and the inner Show accessor for the
  // media branch). Returns an accessor over the branch's current node(s).
  const buildBranch = which => {
    if (which === "media") return showMedia();
    if (which === "svg") {
      const node = buildSvg();
      return () => node;
    }
    if (which === "binary") {
      const node = buildBinary();
      return () => node;
    }
    const node = props.fallback();
    return () => node;
  };

  // Hand-rolled <Switch>: pick the first matching branch in a memo so equal
  // branches never rebuild. The matched branch is (re)mounted in its own root,
  // so switching disposes the previous branch's effects, mirroring solid's
  // Switch which tears down the old <Match> owner. A signal exposes the active
  // branch's accessor; the returned memo resolves it for the caller's insert().
  const branch = createMemo(() => {
    if (kind() === "image" || kind() === "audio") return "media";
    if (kind() === "svg") return "svg";
    if (isBinary()) return "binary";
    return "fallback";
  });
  const [active, setActive] = createSignal();
  let disposeBranch;
  createRenderEffect(() => {
    const which = branch();
    untrack(() => {
      if (disposeBranch) disposeBranch();
      createRoot(dispose => {
        disposeBranch = dispose;
        setActive(() => buildBranch(which));
      });
    });
  });
  onCleanup(() => {
    if (disposeBranch) disposeBranch();
  });
  return createMemo(() => {
    const read = active();
    return read ? read() : undefined;
  });
}
