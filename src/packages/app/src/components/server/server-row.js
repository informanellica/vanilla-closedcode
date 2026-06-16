/** @file Server list row component: renders a connection's name, optional version/badge slot, optional credentials, and a children slot, with truncation-aware tooltips; plus a small server health indicator dot. */
import { Tooltip } from "@/bs/tooltip.js";
import { createResizeObserver } from "../../lib/primitives/resize-observer.js";
import { children, createComponent, createEffect, createMemo, createRenderEffect, createSignal, onMount } from "../../lib/reactivity.js";
import { useLanguage } from "@/context/language.js";
import { serverName } from "@/context/server.js";

/**
 * Row showing a server connection: its (possibly truncated) name, a badge or version slot, optional HTTP
 * credentials, and arbitrary children. Wraps in a tooltip showing the full name/version when the text is
 * truncated or a custom display name is set.
 * @param {Object} props - Component props.
 * @param {Object} props.conn - The connection (with `type`, `http`, `displayName`).
 * @param {Object} props.status - Optional connection status (with `version`).
 * @param {*} props.badge - Optional badge node rendered in place of the version.
 * @param {boolean} props.showCredentials - Whether to show HTTP username/password (for http connections).
 * @param {boolean} props.dimmed - Whether to dim the row.
 * @param {string} props.class - Class applied to the root element.
 * @param {string} props.nameClass - Class applied to the name span.
 * @param {string} props.versionClass - Class applied to the version span.
 * @param {*} props.children - Extra content appended after the column.
 * @returns {*} The tooltip-wrapped row node.
 */
export function ServerRow(props) {
  const language = useLanguage();
  const [truncated, setTruncated] = createSignal(false);
  let nameRef;
  let versionRef;
  const name = createMemo(() => serverName(props.conn));
  /**
   * Measure whether the name and/or version text overflow their containers and update the truncated signal.
   * @returns {void}
   */
  const check = () => {
    const nameTruncated = nameRef ? nameRef.scrollWidth > nameRef.clientWidth : false;
    const versionTruncated = versionRef ? versionRef.scrollWidth > versionRef.clientWidth : false;
    setTruncated(nameTruncated || versionTruncated);
  };
  createEffect(() => {
    name();
    props.conn.http.url;
    props.status?.version;
    queueMicrotask(check);
  });
  onMount(() => {
    if (typeof ResizeObserver !== "function") return;
    createResizeObserver([nameRef, versionRef], check);
    check();
  });

  // Tooltip content: full server name + optional version. Rebuilt on each call
  // (the Tooltip reads `value` lazily when it opens and clones the node), so
  // here we just snapshot the current signal values into a fresh subtree.
  /**
   * Build a fresh tooltip subtree snapshotting the full server name and, when present, its version.
   * @returns {HTMLElement} The tooltip content element.
   */
  const tooltipValue = () => {
    const root = document.createElement("span");
    root.className = "d-flex align-items-center gap-2";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = serverName(props.conn, true);
    root.appendChild(nameSpan);
    // <Show when={props.status?.version}>: only append the version span when set.
    const version = props.status?.version;
    if (version) {
      const versionSpan = document.createElement("span");
      versionSpan.className = "text-white";
      versionSpan.textContent = `v${version}`;
      root.appendChild(versionSpan);
    }
    return root;
  };

  // `children()` memoizes the badge accessor like the compiled output.
  const badge = children(() => props.badge);

  // Static skeleton mirroring _tmpl$3.
  const root = document.createElement("div");
  const column = document.createElement("div");
  column.className = "d-flex flex-column align-items-start min-w-0 w-100";
  const nameRow = document.createElement("div");
  nameRow.className = "d-flex flex-row align-items-center gap-2 min-w-0 w-100";
  const nameSpan = document.createElement("span");
  nameRow.appendChild(nameSpan);
  column.appendChild(nameRow);
  root.appendChild(column);

  // ref to the name span (used for truncation measurement).
  nameRef = nameSpan;

  // Name text (signal-backed).
  createRenderEffect(() => {
    const value = name();
    nameSpan.textContent = value == null ? "" : String(value);
  });

  // Badge / version slot inside nameRow: <Show when={badge()} fallback={
  //   <Show when={status?.version}>version span</Show>}>badge</Show>.
  // When the badge is present it wins; otherwise show the version span when a
  // version exists. versionRef is rebound to whatever version span is mounted.
  const badgeSlot = document.createTextNode("");
  nameRow.appendChild(badgeSlot);
  let prevBadgeKey;
  let versionEl = null;
  // Bumped whenever a fresh version span mounts, so the (separately tracked)
  // version-class effect re-binds its target like the compiled nested effect.
  const [versionEpoch, setVersionEpoch] = createSignal(0);
  createRenderEffect(() => {
    const badgeNode = badge();
    if (badgeNode) {
      // Badge branch: render the badge node, drop any version span.
      if (prevBadgeKey !== "badge") {
        prevBadgeKey = "badge";
        versionEl = null;
        versionRef = undefined;
        setVersionEpoch(e => e + 1);
      }
      replaceSlot(badgeSlot, badgeNode);
      return;
    }
    const version = props.status?.version;
    if (version) {
      if (prevBadgeKey !== "version") {
        prevBadgeKey = "version";
        // _tmpl$4 is `<span>v` → a span whose static text is "v" followed by
        // the live version value.
        versionEl = document.createElement("span");
        versionRef = versionEl;
        versionEl.appendChild(document.createTextNode("v"));
        const versionText = document.createTextNode("");
        versionEl.appendChild(versionText);
        versionEl._text = versionText;
        replaceSlot(badgeSlot, versionEl);
        setVersionEpoch(e => e + 1);
      }
      versionEl._text.textContent = props.status?.version ?? "";
    } else {
      if (prevBadgeKey !== "empty") {
        prevBadgeKey = "empty";
        versionEl = null;
        versionRef = undefined;
        replaceSlot(badgeSlot, null);
        setVersionEpoch(e => e + 1);
      }
    }
  });

  // versionClass for the version span (change-guarded, like the compiled
  // effect). Re-runs when versionClass changes OR a new version span mounts.
  // A new target resets the guard so the fresh span always gets its class.
  let prevVersionClass;
  let prevVersionTarget = null;
  createRenderEffect(() => {
    versionEpoch();
    const target = versionEl;
    const next = `${props.versionClass ?? "text-secondary fw-normal truncate"} min-w-0`;
    if (target !== prevVersionTarget) {
      prevVersionTarget = target;
      prevVersionClass = undefined;
    }
    if (!target) return;
    if (next !== prevVersionClass) {
      prevVersionClass = next;
      target.className = next;
    }
  });

  // Credentials slot inside the column (after nameRow): shown only for http
  // connections when showCredentials is set.
  const credSlot = document.createTextNode("");
  column.appendChild(credSlot);
  let prevCred;
  let credUserText = null;
  let credUserKind;
  let credPasswordEl = null;
  createRenderEffect(() => {
    const show = !!(props.showCredentials && props.conn.type === "http") && props.conn;
    if (!show) {
      if (prevCred !== false) {
        prevCred = false;
        credUserText = null;
        credUserKind = undefined;
        credPasswordEl = null;
        replaceSlot(credSlot, null);
      }
      return;
    }
    if (prevCred !== true) {
      prevCred = true;
      const wrap = document.createElement("div");
      wrap.className = "d-flex flex-row gap-3";
      // First child: username span (or "no username" placeholder).
      const userSlot = document.createElement("span");
      wrap.appendChild(userSlot);
      // Second child: masked password span when a password is present.
      const passSlot = document.createTextNode("");
      wrap.appendChild(passSlot);
      wrap._userSlot = userSlot;
      wrap._passSlot = passSlot;
      credSlot._wrap = wrap;
      credUserText = null;
      credUserKind = undefined;
      credPasswordEl = null;
      replaceSlot(credSlot, wrap);
    }
    const wrap = credSlot._wrap;
    const conn = props.conn;
    // Username: <Show when={username}> name span </Show> else "no username".
    const hasUser = !!conn.http.username;
    if (hasUser) {
      if (credUserKind !== "user") {
        credUserKind = "user";
        const span = document.createElement("span");
        span.className = "text-secondary";
        const text = document.createTextNode("");
        span.appendChild(text);
        credUserText = text;
        wrap._userSlot.replaceChildren(span);
      }
      credUserText.textContent = conn.http.username ?? "";
    } else {
      if (credUserKind !== "empty") {
        credUserKind = "empty";
        const span = document.createElement("span");
        span.className = "text-body-secondary";
        const text = document.createTextNode("");
        span.appendChild(text);
        credUserText = text;
        wrap._userSlot.replaceChildren(span);
      }
      // language.t is live across language switch.
      credUserText.textContent = language.t("server.row.noUsername");
    }
    // Password: masked dots only when a password is present.
    const hasPassword = !!conn.http.password;
    if (hasPassword) {
      if (!credPasswordEl) {
        credPasswordEl = document.createElement("span");
        credPasswordEl.className = "text-secondary";
        credPasswordEl.textContent = "••••••••";
        replaceSlot(wrap._passSlot, credPasswordEl);
      }
    } else if (credPasswordEl) {
      credPasswordEl = null;
      replaceSlot(wrap._passSlot, null);
    }
  });

  // props.children appended after the column (root's last slot).
  const childrenSlot = document.createTextNode("");
  root.appendChild(childrenSlot);
  let prevChildrenNodes = [];
  createRenderEffect(() => {
    let value = props.children;
    while (typeof value === "function") value = value();
    prevChildrenNodes = insertChildren(root, childrenSlot, prevChildrenNodes, value);
  });

  // Root + name span dynamic classes (change-guarded, mirroring the compiled
  // effect with its e/t/a slots).
  let prevClass;
  let prevDimmed;
  let prevNameClass;
  createRenderEffect(() => {
    const nextClass = props.class;
    const nextDimmed = !!props.dimmed;
    const nextNameClass = `${props.nameClass ?? "truncate"} min-w-0`;
    if (nextClass !== prevClass) {
      prevClass = nextClass;
      if (nextClass == null) root.removeAttribute("class");
      else root.className = nextClass;
    }
    if (nextDimmed !== prevDimmed) {
      prevDimmed = nextDimmed;
      root.classList.toggle("opacity-50", nextDimmed);
    }
    if (nextNameClass !== prevNameClass) {
      prevNameClass = nextNameClass;
      nameSpan.className = nextNameClass;
    }
  });

  // inactive: skip the tooltip wrapper when the row is neither truncated nor a
  // custom display name. Read live so Tooltip's early-return branch matches the
  // compiled `!truncated() && !displayName` memo expression.
  return createComponent(Tooltip, {
    class: "flex-1 min-w-0",
    get value() {
      return tooltipValue();
    },
    // Preserve the original object value verbatim (behavior-identical to the
    // compiled output); the bs/ Tooltip consumes contentStyle as-is.
    contentStyle: {
      "max-width": "none",
      "white-space": "nowrap"
    },
    placement: "top-start",
    get inactive() {
      return !truncated() && !props.conn.displayName;
    },
    children: root
  });
}

// Replace the node currently rendered at `slot` with `node` (or nothing).
// `slot` is a marker text node that stays in the DOM; the rendered node is
// tracked on slot._node.
/**
 * Replace the node currently rendered at a marker slot with a new node (or remove it).
 * @param {Node} slot - A marker text node that persists in the DOM; the rendered node is tracked on `slot._node`.
 * @param {Node} node - The node to render, or null/false to render nothing.
 * @returns {void}
 */
function replaceSlot(slot, node) {
  const parent = slot.parentNode;
  if (slot._node && slot._node.parentNode === parent) slot._node.remove();
  slot._node = null;
  if (node == null || node === false) return;
  parent.insertBefore(node, slot);
  slot._node = node;
}

// Insert/replace a (possibly array) children value before `marker`, returning
// the new node list so the next run can clean up exactly what it inserted.
/**
 * Insert a children value (node, array, primitive, or nesting thereof) before a marker, removing the
 * previously inserted nodes first.
 * @param {Node} parent - The container to insert into.
 * @param {Node} marker - The marker node before which children are inserted.
 * @param {Array} prev - The nodes inserted by the previous run, to be removed.
 * @param {*} value - The children value to render.
 * @returns {Array} The list of nodes inserted this run.
 */
function insertChildren(parent, marker, prev, value) {
  for (const node of prev) {
    if (node.parentNode === parent) node.remove();
  }
  const next = [];
  const append = v => {
    if (v == null || v === false || v === true) return;
    if (Array.isArray(v)) {
      v.forEach(append);
      return;
    }
    if (v instanceof Node) {
      parent.insertBefore(v, marker);
      next.push(v);
      return;
    }
    const text = document.createTextNode(String(v));
    parent.insertBefore(text, marker);
    next.push(text);
  };
  append(value);
  return next;
}

/**
 * Small colored dot indicating a server's health: green when healthy, red when unhealthy, grey when unknown.
 * @param {Object} props - Component props.
 * @param {Object} props.health - Optional health info (with `healthy`); undefined renders the unknown state.
 * @returns {HTMLElement} The indicator dot element.
 */
export function ServerHealthIndicator(props) {
  // <div> whose classList toggles a health-colored dot. Mirrors the compiled
  // the compiled classList: base class always on, color depends on health.
  const el = document.createElement("div");
  createRenderEffect(() => {
    const classes = {
      "size-1.5 rounded-circle shrink-0": true,
      "bg-success": props.health?.healthy === true,
      "bg-danger": props.health?.healthy === false,
      "bg-secondary": props.health === undefined
    };
    const tokens = [];
    for (const key of Object.keys(classes)) {
      if (!key || !classes[key]) continue;
      for (const token of key.split(/\s+/)) {
        if (token) tokens.push(token);
      }
    }
    el.className = tokens.join(" ");
  });
  return el;
}
