// Hand-written vanilla port of the compiled SolidJS output for the line
// comment components. Static skeletons are template literals; dynamic text,
// attributes and branches are wired with solid-js createRenderEffect /
// createMemo. The export API (props, children getters, context use) is
// unchanged.
import { useFilteredList } from "../hooks/index.js";
import { getDirectory, getFilename } from "core/util/path";
import { createComponent, createMemo, createRenderEffect, createSignal, mergeProps, onMount, splitProps } from "../../../lib/reactivity.js";
import { Button } from "./button.js";
import { FileIcon } from "./file-icon.js";
import { Icon } from "./icon.js";
import { installLineCommentStyles } from "./line-comment-styles.js";
import { useI18n } from "../context/i18n.js";
installLineCommentStyles();

// --- Vanilla helpers replacing the compiled solid-js/web runtime calls ---

/** @file Vanilla port of the compiled SolidJS line-comment components (anchor, comment, add, editor) with reactive DOM-binding helpers and a delegated-event system. */
// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
/**
 * Build a detached element from a compact HTML string and return its first child.
 *
 * @param {string} html - The HTML markup to parse.
 * @returns {Element} The first element parsed from the markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Resolve a possibly-reactive value the way solid-js/web's insert() does:
// call accessors until a concrete value remains. Callers run this inside a
// render effect, so the reads stay tracked.
/**
 * Resolve a possibly-reactive value by invoking accessor functions until a
 * concrete (non-function) value remains.
 *
 * @param {*} value - The value or accessor chain to resolve.
 * @returns {*} The resolved concrete value.
 */
function resolveValue(value) {
  while (typeof value === "function") value = value();
  return value;
}

// Normalize an insert() value (node, string/number, array, accessor) into an
// array of DOM nodes.
/**
 * Normalize an insert()-style value (Node, string/number, array, accessor, or
 * nullish/boolean) into a flat array of DOM nodes; primitives become text nodes.
 *
 * @param {*} value - The value to flatten into nodes.
 * @returns {Array} An array of DOM nodes (empty for nullish/boolean values).
 */
function flattenNodes(value) {
  value = resolveValue(value);
  if (value == null || typeof value === "boolean") return [];
  if (Array.isArray(value)) {
    const nodes = [];
    for (const entry of value) nodes.push(...flattenNodes(entry));
    return nodes;
  }
  return [value instanceof Node ? value : document.createTextNode(String(value))];
}

// insert(el, accessor) replacement: render the value as the sole content of
// `el` and keep it live.
/**
 * Reactively render an accessor's value as the sole content of an element,
 * replacing its children whenever the value changes.
 *
 * @param {Element} el - The element whose children are bound.
 * @param {Function} get - Accessor returning the content value.
 * @returns {void}
 */
function bindContent(el, get) {
  createRenderEffect(() => {
    el.replaceChildren(...flattenNodes(get()));
  });
}

// setAttribute() replacement: null/undefined removes the attribute.
/**
 * Reactively bind an attribute to an accessor's value (change-guarded); a
 * nullish value removes the attribute.
 *
 * @param {Element} el - The target element.
 * @param {string} name - The attribute name.
 * @param {Function} get - Accessor returning the attribute value.
 * @returns {void}
 */
function bindAttr(el, name, get) {
  let prev;
  createRenderEffect(() => {
    const value = get();
    if (value === prev) return;
    prev = value;
    if (value == null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  });
}

// classList(el, { [name]: !!name }) replacement for a single dynamic
// (possibly multi-token) class string.
/**
 * Reactively bind a single (possibly multi-token) class string to an element,
 * adding/removing only the tokens that changed between updates.
 *
 * @param {Element} el - The target element.
 * @param {Function} getName - Accessor returning the space-separated class string.
 * @returns {void}
 */
function bindClass(el, getName) {
  let prev = [];
  createRenderEffect(() => {
    const name = getName();
    const next = name ? String(name).trim().split(/\s+/).filter(Boolean) : [];
    for (const cls of prev) {
      if (!next.includes(cls)) el.classList.remove(cls);
    }
    for (const cls of next) {
      if (!prev.includes(cls)) el.classList.add(cls);
    }
    prev = next;
  });
}

// style(el, value, prev) replacement for the object/undefined form.
/**
 * Reactively bind an element's inline styles to an accessor returning a style
 * property map, setting changed properties and removing ones no longer present.
 *
 * @param {Element} el - The target element.
 * @param {Function} get - Accessor returning a style property map (or falsy for none).
 * @returns {void}
 */
function bindStyle(el, get) {
  let prev = {};
  createRenderEffect(() => {
    const next = get() || {};
    for (const name of Object.keys(prev)) {
      if (!(name in next)) el.style.removeProperty(name);
    }
    for (const name of Object.keys(next)) {
      if (next[name] !== prev[name]) el.style.setProperty(name, String(next[name]));
    }
    prev = { ...next };
  });
}

// The compiled output delegated the mention-row click/mousedown handlers
// through solid-js/web delegateEvents(): the handler lives on the element and
// a document-level bubble listener walks up from event.target, so an
// ancestor's stopPropagation() suppresses it (the editor popover does exactly
// that for mousedown). Reproduce that wiring with module-local symbol keys so
// it cannot double-fire with any remaining compiled delegation in the app.
const delegatedKeys = {
  click: Symbol("line-comment-click"),
  mousedown: Symbol("line-comment-mousedown")
};
if (typeof document !== "undefined") {
  for (const type of ["click", "mousedown"]) {
    const key = delegatedKeys[type];
    document.addEventListener(type, event => {
      let node = event.target;
      while (node) {
        const handler = node[key];
        if (handler && !node.disabled) {
          handler.call(node, event);
          if (event.cancelBubble) return;
        }
        node = node.parentNode || node.host;
      }
    });
  }
}

const glyphPaths = {
  comment: '<path d="M16.25 3.75H3.75V16.25L6.875 14.4643H16.25V3.75Z" stroke="currentColor" stroke-linecap="square"></path>',
  plus: '<path d="M10 5.41699V10.0003M10 10.0003V14.5837M10 10.0003H5.4165M10 10.0003H14.5832" stroke="currentColor" stroke-linecap="square"></path>'
};
/**
 * Render a small inline SVG glyph (comment or plus) whose path swaps reactively
 * based on the icon name.
 *
 * @param {Object} props - Component props.
 * @param {string} props.icon - Glyph name; "comment" renders the comment path, otherwise the plus path.
 * @returns {SVGSVGElement} The constructed SVG glyph element.
 */
function InlineGlyph(props) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-slot", "line-comment-icon");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  // Show(when: icon === "comment") equivalent: swap the path only when the
  // condition flips.
  const isComment = createMemo(() => props.icon === "comment");
  createRenderEffect(() => {
    svg.innerHTML = isComment() ? glyphPaths.comment : glyphPaths.plus;
  });
  return svg;
}
/**
 * Render the base line-comment anchor: a positioned container with a trigger
 * button and an open-gated popover, or an inline body popover. Position, variant,
 * open/inline data attributes, class, and style are bound reactively, and handler
 * props (onClick, onMouseEnter, onPopoverFocusOut) are wired into the rebuilt
 * branch on change.
 *
 * @param {Object} props - Component props.
 * @param {boolean} props.inline - Whether to render inline (relative) instead of absolutely positioned.
 * @param {number} props.top - Absolute top offset in px; when undefined and not inline the anchor is hidden.
 * @param {string} props.variant - Visual variant (data-variant); defaults to "default".
 * @param {string} props.icon - Trigger glyph name ("comment" or "plus"); defaults to "comment".
 * @param {boolean} props.hideButton - When inline, render the popover body directly without the trigger button.
 * @param {boolean} props.open - Whether the open-gated popover is shown.
 * @param {*} props.id - Comment id reflected as data-comment-id.
 * @param {string} props.class - Class name(s) applied to the root.
 * @param {string} props.popoverClass - Class name(s) applied to the popover.
 * @param {string} props.buttonLabel - aria-label for the trigger button.
 * @param {*} props.children - Popover content.
 * @param {Function} props.onClick - Click handler for the button/inline body.
 * @param {Function} props.onMouseEnter - Mouse-enter handler for the button/inline body.
 * @param {Function} props.onPopoverFocusOut - Focus-out handler for the popover.
 * @returns {HTMLDivElement} The anchor root element.
 */
export const LineCommentAnchor = props => {
  const hidden = () => !props.inline && props.top === undefined;
  const variant = () => props.variant ?? "default";
  const icon = () => props.icon ?? "comment";
  const inlineBody = () => props.inline && props.hideButton;
  const root = document.createElement("div");
  root.setAttribute("data-component", "line-comment");
  root.setAttribute("data-prevent-autofocus", "");

  // Shared popover/inline-body builder. Handler props are deliberately read
  // here, inside the rebuilding effect: the compiled Show evaluated its
  // branch (and these reads) inside its memo, so a handler identity change
  // rebuilds the branch with the new handler attached. Keep that contract.
  /**
   * Build the popover (or inline body) element, wiring focus-out and, when
   * inline, mouse-enter/click handlers, plus mousedown stopPropagation, and
   * binding its content and class reactively.
   *
   * @param {boolean} inline - Whether to build the inline body variant.
   * @returns {HTMLDivElement} The constructed popover element.
   */
  const buildPopover = inline => {
    const pop = document.createElement("div");
    pop.setAttribute("data-slot", "line-comment-popover");
    if (inline) pop.setAttribute("data-inline-body", "");
    const onFocusOut = props.onPopoverFocusOut;
    if (onFocusOut) pop.addEventListener("focusout", onFocusOut);
    if (inline) {
      const onMouseEnter = props.onMouseEnter;
      if (onMouseEnter) pop.addEventListener("mouseenter", onMouseEnter);
      const onClick = props.onClick;
      if (onClick) pop.addEventListener("click", onClick);
    }
    pop.addEventListener("mousedown", e => e.stopPropagation());
    bindContent(pop, () => props.children);
    bindClass(pop, () => props.popoverClass ?? "");
    return pop;
  };

  // Show(when: inlineBody) equivalent: rebuild on truthiness flips (and on
  // tracked handler-prop changes, see buildPopover above).
  const inlineCond = createMemo(() => !!inlineBody());
  createRenderEffect(() => {
    if (inlineCond()) {
      root.replaceChildren(buildPopover(true));
      return;
    }
    // Fallback branch: trigger button plus open-gated popover.
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-slot", "line-comment-button");
    const onMouseEnter = props.onMouseEnter;
    if (onMouseEnter) button.addEventListener("mouseenter", onMouseEnter);
    const onClick = props.onClick;
    if (onClick) button.addEventListener("click", onClick);
    button.addEventListener("mouseup", e => e.stopPropagation());
    button.addEventListener("mousedown", e => e.stopPropagation());
    // Show(when: inline) equivalent for the button glyph. The icon name is
    // read here in the effect body: createComponent() untracks the component
    // call and the vanilla Icon reads its props only once, so a getter prop
    // would freeze the glyph. Tracking the read here rebuilds it on change.
    const inlineIcon = createMemo(() => !!props.inline);
    createRenderEffect(() => {
      const name = icon();
      const node = inlineIcon()
        ? createComponent(InlineGlyph, { icon: name })
        : createComponent(Icon, {
            name: name === "plus" ? "plus-small" : "comment",
            size: "small"
          });
      button.replaceChildren(...flattenNodes(node));
    });
    bindAttr(button, "aria-label", () => props.buttonLabel);
    root.replaceChildren(button);
    // Show(when: open) equivalent for the popover.
    const openCond = createMemo(() => !!props.open);
    let popover;
    createRenderEffect(() => {
      if (popover) {
        popover.remove();
        popover = undefined;
      }
      if (!openCond()) return;
      popover = buildPopover(false);
      root.appendChild(popover);
    });
  });

  bindAttr(root, "data-variant", variant);
  bindAttr(root, "data-comment-id", () => props.id);
  bindAttr(root, "data-open", () => (props.open ? "" : undefined));
  bindAttr(root, "data-inline", () => (props.inline ? "" : undefined));
  bindClass(root, () => props.class ?? "");
  bindStyle(root, () => props.inline ? undefined : {
    top: `${props.top ?? 0}px`,
    opacity: hidden() ? 0 : 1,
    "pointer-events": hidden() ? "none" : "auto"
  });
  return root;
};
/**
 * Render a read-only line comment built on LineCommentAnchor: shows the comment
 * text, optional action tools, and a localized selection label.
 *
 * @param {Object} props - Component props (forwarded to LineCommentAnchor).
 * @param {*} props.comment - The comment text/content to display.
 * @param {*} props.selection - The selection descriptor rendered in the label.
 * @param {*} props.actions - Optional action UI shown beside the comment text.
 * @param {boolean} props.inline - Whether to render inline (hides the trigger button).
 * @returns {HTMLDivElement} The line-comment anchor element.
 */
export const LineComment = props => {
  const i18n = useI18n();
  const [split, rest] = splitProps(props, ["comment", "selection", "actions"]);
  return createComponent(LineCommentAnchor, mergeProps(rest, {
    variant: "default",
    get hideButton() {
      return props.inline;
    },
    get children() {
      const content = template('<div data-slot="line-comment-content"><div data-slot="line-comment-head"><div data-slot="line-comment-text"></div></div><div data-slot="line-comment-label"></div></div>');
      const head = content.firstChild;
      const text = head.firstChild;
      const label = head.nextSibling;
      bindContent(text, () => split.comment);
      // Show(when: actions) equivalent: the tools wrapper appears/disappears
      // on truthiness flips, its content stays live via bindContent.
      const hasActions = createMemo(() => !!split.actions);
      let tools;
      createRenderEffect(() => {
        if (tools) {
          tools.remove();
          tools = undefined;
        }
        if (!hasActions()) return;
        const el = document.createElement("div");
        el.setAttribute("data-slot", "line-comment-tools");
        bindContent(el, () => split.actions);
        head.appendChild(el);
        tools = el;
      });
      // The label is fully dynamic (prefix / selection / suffix), so one
      // effect renders all three; i18n.t keeps it live on locale change.
      createRenderEffect(() => {
        label.replaceChildren(
          ...flattenNodes(i18n.t("ui.lineComment.label.prefix")),
          ...flattenNodes(split.selection),
          ...flattenNodes(i18n.t("ui.lineComment.label.suffix"))
        );
      });
      return content;
    }
  }));
};
/**
 * Render the "add comment" affordance: a plus-variant LineCommentAnchor that is
 * always closed, used as the trigger to start a new comment.
 *
 * @param {Object} props - Component props (forwarded to LineCommentAnchor).
 * @param {string} props.label - aria-label for the button; defaults to a localized submit label.
 * @returns {HTMLDivElement} The line-comment anchor element.
 */
export const LineCommentAdd = props => {
  const [split, rest] = splitProps(props, ["label"]);
  const i18n = useI18n();
  return createComponent(LineCommentAnchor, mergeProps(rest, {
    open: false,
    variant: "add",
    icon: "plus",
    get buttonLabel() {
      return split.label ?? i18n.t("ui.lineComment.submit");
    }
  }));
};
/**
 * Render the line-comment editor: an editor-variant LineCommentAnchor with a
 * textarea, a localized selection label, optional file-mention autocomplete, and
 * cancel/submit actions (Button components on desktop, bare buttons inline).
 * Handles keyboard navigation (Enter to submit, Shift+Enter newline, Escape to
 * cancel, Tab/arrows for the mention list) and autofocuses on mount.
 *
 * @param {Object} props - Component props (forwarded to LineCommentAnchor).
 * @param {string} props.value - The current editor text.
 * @param {*} props.selection - The selection descriptor rendered in the label.
 * @param {Function} props.onInput - Called with the new value on input.
 * @param {Function} props.onCancel - Called when the edit is cancelled.
 * @param {Function} props.onSubmit - Called with the trimmed value on submit.
 * @param {string} props.placeholder - Textarea placeholder; defaults to a localized string.
 * @param {number} props.rows - Textarea row count; defaults to 3.
 * @param {boolean} props.autofocus - Whether to focus the textarea on mount; defaults to true.
 * @param {string} props.cancelLabel - Cancel button label; defaults to a localized string.
 * @param {string} props.submitLabel - Submit button label; defaults to a localized string.
 * @param {Object} props.mention - Mention config with an async items(query) source for autocomplete.
 * @param {boolean} props.inline - Whether to render inline (bare action buttons, hidden trigger).
 * @returns {HTMLDivElement} The line-comment anchor element.
 */
export const LineCommentEditor = props => {
  const i18n = useI18n();
  const [split, rest] = splitProps(props, ["value", "selection", "onInput", "onCancel", "onSubmit", "placeholder", "rows", "autofocus", "cancelLabel", "submitLabel", "mention"]);
  const refs = {
    textarea: undefined
  };
  const [open, setOpen] = createSignal(false);
  /**
   * Insert the selected mention into the textarea, replacing the active "@query"
   * token with "@<path> ", closing the mention list and restoring the caret.
   *
   * @param {Object} item - The chosen mention item with a path property.
   * @returns {void}
   */
  function selectMention(item) {
    if (!item) return;
    const textarea = refs.textarea;
    const query = currentMention();
    if (!textarea || !query) return;
    const value = `${textarea.value.slice(0, query.start)}@${item.path} ${textarea.value.slice(query.end)}`;
    const cursor = query.start + item.path.length + 2;
    split.onInput(value);
    closeMention();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }
  const mention = useFilteredList({
    items: async query => {
      if (!split.mention) return [];
      if (!query.trim()) return [];
      const paths = await split.mention.items(query);
      return paths.map(path => ({
        path
      }));
    },
    key: item => item.path,
    filterKeys: ["path"],
    onSelect: selectMention
  });
  const focus = () => refs.textarea?.focus();
  const hold = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const click = fn => e => {
    e.stopPropagation();
    fn();
  };
  const closeMention = () => {
    setOpen(false);
    mention.clear();
  };
  /**
   * Detect an active "@query" mention token at the caret position.
   *
   * @returns {(Object|undefined)} The token { query, start, end } when the caret
   *   follows an "@..." run with no selection, otherwise undefined.
   */
  const currentMention = () => {
    const textarea = refs.textarea;
    if (!textarea) return;
    if (!split.mention) return;
    if (textarea.selectionStart !== textarea.selectionEnd) return;
    const end = textarea.selectionStart;
    const match = textarea.value.slice(0, end).match(/@(\S*)$/);
    if (!match) return;
    return {
      query: match[1] ?? "",
      start: end - match[0].length,
      end
    };
  };
  const syncMention = () => {
    const item = currentMention();
    if (!item) {
      closeMention();
      return;
    }
    setOpen(true);
    mention.onInput(item.query);
  };
  const selectActiveMention = () => {
    const items = mention.flat();
    if (items.length === 0) return;
    const active = mention.active();
    selectMention(items.find(item => item.path === active) ?? items[0]);
  };
  const submit = () => {
    const value = split.value.trim();
    if (!value) return;
    split.onSubmit(value);
  };
  onMount(() => {
    if (split.autofocus === false) return;
    requestAnimationFrame(focus);
  });
  return createComponent(LineCommentAnchor, mergeProps(rest, {
    open: true,
    variant: "editor",
    get hideButton() {
      return props.inline;
    },
    onClick: () => focus(),
    get children() {
      const editor = template('<div data-slot="line-comment-editor"><textarea data-slot="line-comment-textarea"></textarea><div data-slot="line-comment-actions"><div data-slot="line-comment-editor-label"></div></div></div>');
      const textarea = editor.firstChild;
      const actionsEl = textarea.nextSibling;
      const labelEl = actionsEl.firstChild;
      textarea.addEventListener("keydown", e => {
        const event = e;
        if (event.isComposing || event.keyCode === 229) return;
        event.stopPropagation();
        if (open()) {
          if (e.key === "Escape") {
            event.preventDefault();
            closeMention();
            return;
          }
          if (e.key === "Tab") {
            if (mention.flat().length === 0) return;
            event.preventDefault();
            selectActiveMention();
            return;
          }
          const nav = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter";
          const ctrlNav = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (e.key === "n" || e.key === "p");
          if ((nav || ctrlNav) && mention.flat().length > 0) {
            mention.onKeyDown(event);
            event.preventDefault();
            return;
          }
        }
        if (e.key === "Escape") {
          event.preventDefault();
          e.currentTarget.blur();
          split.onCancel();
          return;
        }
        if (e.key !== "Enter") return;
        if (e.shiftKey) return;
        event.preventDefault();
        submit();
      });
      textarea.addEventListener("select", () => syncMention());
      textarea.addEventListener("click", () => syncMention());
      textarea.addEventListener("input", e => {
        const value = e.currentTarget.value;
        split.onInput(value);
        syncMention();
      });
      refs.textarea = textarea;

      /**
       * Build a mention-list row button for one path item: a file icon, the
       * directory portion, and (for files) the filename, wired to select on
       * click and highlight on hover.
       *
       * @param {Object} item - The mention item with a path property.
       * @returns {HTMLButtonElement} The constructed row element.
       */
      const buildMentionRow = item => {
        const directory = item.path.endsWith("/") ? item.path : getDirectory(item.path);
        const name = item.path.endsWith("/") ? "" : getFilename(item.path);
        const row = template('<button type="button" data-slot="line-comment-mention-item"><div data-slot="line-comment-mention-path"><span data-slot="line-comment-mention-dir"></span></div></button>');
        const pathEl = row.firstChild;
        const dirEl = pathEl.firstChild;
        row[delegatedKeys.click] = () => selectMention(item);
        row.addEventListener("mouseenter", () => mention.setActive(item.path));
        row[delegatedKeys.mousedown] = event => event.preventDefault();
        const fileIcon = createComponent(FileIcon, {
          get node() {
            return {
              path: item.path,
              type: "file"
            };
          },
          "class": "shrink-0 size-4"
        });
        for (const node of flattenNodes(fileIcon)) row.insertBefore(node, pathEl);
        dirEl.textContent = directory;
        if (name) {
          const file = template('<span data-slot="line-comment-mention-file"></span>');
          file.textContent = name;
          pathEl.appendChild(file);
        }
        bindAttr(row, "data-active", () => (mention.active() === item.path ? "" : undefined));
        return row;
      };

      // Show(when: open && items) equivalent for the mention list.
      const showMention = createMemo(() => !!open() && mention.flat().length > 0);
      let mentionList;
      createRenderEffect(() => {
        if (mentionList) {
          mentionList.remove();
          mentionList = undefined;
        }
        if (!showMention()) return;
        const list = document.createElement("div");
        list.setAttribute("data-slot", "line-comment-mention-list");
        // <For> equivalent: rebuild the rows when the filtered items change;
        // the per-row active highlight stays live via bindAttr.
        createRenderEffect(() => {
          list.replaceChildren(...mention.flat().slice(0, 10).map(buildMentionRow));
        });
        editor.insertBefore(list, actionsEl);
        mentionList = list;
      });

      // Editor label (prefix / selection / suffix), live on locale change.
      createRenderEffect(() => {
        labelEl.replaceChildren(
          ...flattenNodes(i18n.t("ui.lineComment.editorLabel.prefix")),
          ...flattenNodes(split.selection),
          ...flattenNodes(i18n.t("ui.lineComment.editorLabel.suffix"))
        );
      });

      // Show(when: !inline) equivalent: Button components on desktop,
      // bare action buttons inline.
      const desktopActions = createMemo(() => !props.inline);
      let actionButtons = [];
      createRenderEffect(() => {
        for (const node of actionButtons) node.remove();
        if (desktopActions()) {
          // The vanilla Button reads its props exactly once inside
          // createComponent()'s untrack scope, so getter props freeze there.
          // Keep the labels live by passing accessor children (Button routes
          // function children through insert()), read the handler here in the
          // tracked effect body, and bind the reactive disabled state on the
          // returned element, mirroring the compiled Button's own effect.
          const cancelButton = createComponent(Button, {
            size: "small",
            variant: "ghost",
            onClick: split.onCancel,
            children: () => split.cancelLabel ?? i18n.t("ui.common.cancel")
          });
          const submitButton = createComponent(Button, {
            size: "small",
            variant: "primary",
            onClick: submit,
            children: () => split.submitLabel ?? i18n.t("ui.lineComment.submit")
          });
          createRenderEffect(() => {
            submitButton.disabled = split.value.trim().length === 0;
          });
          actionButtons = [cancelButton, submitButton];
        } else {
          const cancel = template('<button type="button" data-slot="line-comment-action" data-variant="ghost"></button>');
          cancel.addEventListener("click", click(split.onCancel));
          cancel.addEventListener("mousedown", hold);
          createRenderEffect(() => {
            cancel.replaceChildren(...flattenNodes(split.cancelLabel ?? i18n.t("ui.common.cancel")));
          });
          const send = template('<button type="button" data-slot="line-comment-action" data-variant="primary"></button>');
          send.addEventListener("click", click(submit));
          send.addEventListener("mousedown", hold);
          createRenderEffect(() => {
            send.replaceChildren(...flattenNodes(split.submitLabel ?? i18n.t("ui.lineComment.submit")));
          });
          createRenderEffect(() => {
            send.disabled = split.value.trim().length === 0;
          });
          actionButtons = [cancel, send];
        }
        for (const node of actionButtons) actionsEl.appendChild(node);
      });

      bindAttr(textarea, "rows", () => split.rows ?? 3);
      bindAttr(textarea, "placeholder", () => split.placeholder ?? i18n.t("ui.lineComment.placeholder"));
      createRenderEffect(() => {
        textarea.value = split.value;
      });
      return editor;
    }
  }));
};
