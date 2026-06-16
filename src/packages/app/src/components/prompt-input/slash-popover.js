/** @file Prompt-input autocomplete popover: renders the "@" mention list (agents and files) and the "/" slash-command list above the editor, with keyboard/hover highlighting. */
import { createComponent, createMemo, createRenderEffect, untrack } from "../../lib/reactivity.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { Icon } from "@/bs/icon.js";
import { getDirectory, getFilename } from "core/util/path";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
/**
 * Parse a single-element HTML string into a detached DOM node.
 * @param {string} html - Compact markup with a single root element.
 * @returns {Element} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/**
 * Autocomplete popover component for the prompt editor. Shows either the "@" mention list (agents and
 * file/directory entries) or the "/" slash-command list depending on `props.popover`, rebuilding its body
 * when the mode changes and existing only while a mode is active.
 * @param {Object} props - Component props.
 * @param {string} props.popover - Active mode: "at", "slash", or falsy when closed.
 * @param {Array} props.atFlat - Flattened "@" candidate items (agents and files).
 * @param {Array} props.slashFlat - Flattened "/" command candidates.
 * @param {*} props.atActive - Key of the highlighted "@" row.
 * @param {*} props.slashActive - Id of the highlighted "/" row.
 * @param {Function} props.atKey - Returns the unique key for an "@" item.
 * @param {Function} props.setAtActive - Sets the highlighted "@" row by key.
 * @param {Function} props.setSlashActive - Sets the highlighted "/" row by command id.
 * @param {Function} props.onAtSelect - Called with the chosen "@" item.
 * @param {Function} props.onSlashSelect - Called with the chosen "/" command.
 * @param {Function} props.commandKeybind - Returns the keybind label for a command id, if any.
 * @param {Function} props.setSlashPopoverRef - Receives the popover root element when opened in slash mode.
 * @param {Function} props.t - Translate function for localized labels.
 * @returns {Function} A memo accessor that yields the popover root element while open, else undefined.
 */
export const PromptPopover = props => {
  // Localized empty-state line; the label stays live across locale switches.
  /**
   * Build a localized empty-state line whose text tracks the current locale.
   * @param {string} labelKey - The translation key for the empty-state message.
   * @returns {Element} The empty-state element.
   */
  const buildEmpty = labelKey => {
    const el = template(`<div class="text-secondary px-2 py-1"></div>`);
    createRenderEffect(() => {
      el.textContent = props.t(labelKey);
    });
    return el;
  };

  // "@" popover row for an agent entry.
  /**
   * Build an "@" popover row for an agent mention.
   * @param {Object} item - The agent item (with `name`).
   * @returns {Element} The agent row button element.
   */
  const buildAgentRow = item => {
    const key = props.atKey(item);
    const row = template(`<button class="w-100 d-flex align-items-center gap-x-2 rounded-2 px-2 py-0.5"><span class="fw-normal text-body-emphasis whitespace-nowrap">@</span></button>`);
    const label = row.firstChild;
    row.addEventListener("mouseenter", () => props.setAtActive(key));
    row.addEventListener("click", () => props.onAtSelect(item));
    row.insertBefore(createComponent(Icon, {
      name: "brain",
      size: "small",
      class: "text-secondary shrink-0"
    }), label);
    const name = document.createTextNode("");
    label.appendChild(name);
    createRenderEffect(() => {
      name.data = item.name ?? "";
    });
    createRenderEffect(() => {
      row.classList.toggle("bg-primary-subtle", props.atActive === key);
    });
    return row;
  };

  // "@" popover row for a file/directory entry.
  /**
   * Build an "@" popover row for a file or directory entry, splitting the path into directory and filename.
   * @param {Object} item - The file/directory item (with `path`).
   * @returns {Element} The file row button element.
   */
  const buildFileRow = item => {
    const key = props.atKey(item);
    const isDirectory = item.path.endsWith("/");
    const directory = isDirectory ? item.path : getDirectory(item.path);
    const filename = isDirectory ? "" : getFilename(item.path);
    const row = template(`<button class="w-100 d-flex align-items-center gap-x-2 rounded-2 px-2 py-0.5"><div class="d-flex align-items-center fw-normal min-w-0"><span class="text-secondary whitespace-nowrap truncate min-w-0"></span></div></button>`);
    const inner = row.firstChild;
    const directoryEl = inner.firstChild;
    row.addEventListener("mouseenter", () => props.setAtActive(key));
    row.addEventListener("click", () => props.onAtSelect(item));
    row.insertBefore(createComponent(FileIcon, {
      get node() {
        return {
          path: item.path,
          type: "file"
        };
      },
      class: "shrink-0 size-4"
    }), inner);
    directoryEl.textContent = directory ?? "";
    // Show(!isDirectory): fixed per item, so build statically.
    if (!isDirectory) {
      const filenameEl = template(`<span class="text-body-emphasis whitespace-nowrap"></span>`);
      filenameEl.textContent = filename ?? "";
      inner.appendChild(filenameEl);
    }
    createRenderEffect(() => {
      row.classList.toggle("bg-primary-subtle", props.atActive === key);
    });
    return row;
  };

  /**
   * Build the appropriate "@" row for an item, dispatching on its type.
   * @param {Object} item - The "@" candidate item.
   * @returns {Element} The agent or file row element.
   */
  const buildAtRow = item => item.type === "agent" ? buildAgentRow(item) : buildFileRow(item);

  // "/" popover row for a command entry.
  /**
   * Build a "/" popover row for a slash command, including its trigger, optional description, optional
   * source badge, and optional keybind label.
   * @param {Object} cmd - The command item (with id, trigger, description, type, source).
   * @returns {Element} The command row button element.
   */
  const buildSlashRow = cmd => {
    const row = template(`<button class="w-100 d-flex align-items-center justify-content-between gap-4 rounded-2 px-2 py-1"><div class="d-flex align-items-center gap-2 min-w-0"><span class="fw-normal text-body-emphasis whitespace-nowrap">/</span></div><div class="d-flex align-items-center gap-2 shrink-0"></div></button>`);
    const left = row.firstChild;
    const triggerEl = left.firstChild;
    const right = left.nextSibling;
    row.addEventListener("mouseenter", () => props.setSlashActive(cmd.id));
    row.addEventListener("click", () => props.onSlashSelect(cmd));
    const triggerText = document.createTextNode("");
    triggerEl.appendChild(triggerText);
    createRenderEffect(() => {
      triggerText.data = cmd.trigger ?? "";
    });

    // Show(cmd.description): mount/unmount on truthiness flips only; the
    // description text itself stays live while mounted.
    const hasDescription = createMemo(() => !!cmd.description);
    let descriptionEl = null;
    createRenderEffect(() => {
      if (!hasDescription()) {
        if (descriptionEl) {
          descriptionEl.remove();
          descriptionEl = null;
        }
        return;
      }
      const el = template(`<span class="fw-normal text-secondary truncate"></span>`);
      createRenderEffect(() => {
        el.textContent = cmd.description ?? "";
      });
      left.appendChild(el);
      descriptionEl = el;
    });

    // Right side: Show(custom badge) + Show(keybind). The regions rebuild on
    // their truthiness flips; labels stay live (locale / keybind changes).
    const hasBadge = createMemo(() => cmd.type === "custom" && cmd.source !== "command");
    const hasKeybind = createMemo(() => !!props.commandKeybind(cmd.id));
    createRenderEffect(() => {
      const nodes = [];
      if (hasBadge()) {
        const badge = template(`<span class="small fw-normal text-body-secondary px-1.5 py-0.5 bg-body-tertiary rounded-2"></span>`);
        createRenderEffect(() => {
          badge.textContent = cmd.source === "skill" ? props.t("prompt.slash.badge.skill") : cmd.source === "mcp" ? props.t("prompt.slash.badge.mcp") : props.t("prompt.slash.badge.custom");
        });
        nodes.push(badge);
      }
      if (hasKeybind()) {
        const keybind = template(`<span class="small fw-normal text-body-secondary"></span>`);
        createRenderEffect(() => {
          keybind.textContent = props.commandKeybind(cmd.id) ?? "";
        });
        nodes.push(keybind);
      }
      right.replaceChildren(...nodes);
    });

    // data-slash-id (change-guarded like the compiled effect) + active-row
    // highlight.
    let prevId;
    createRenderEffect(() => {
      const id = cmd.id;
      if (id !== prevId) {
        prevId = id;
        if (id == null) row.removeAttribute("data-slash-id");
        else row.setAttribute("data-slash-id", id);
      }
      row.classList.toggle("bg-primary-subtle", props.slashActive === cmd.id);
    });
    return row;
  };

  // Popover frame; built once per open (see the Show memo below), exactly like
  // the compiled output.
  /**
   * Build the popover frame and reactively populate its body for the active mode ("at" or "slash"),
   * swapping between the empty state and the row list as candidates change.
   * @returns {Element} The popover root element.
   */
  const buildRoot = () => {
    const root = template(`<div class="absolute inset-x-0 -top-2 -translate-y-full origin-bottom-left max-h-80 min-h-10 overflow-auto no-scrollbar d-flex flex-column p-2 rounded-[12px] bg-body-tertiary shadow-[var(--shadow-lg-border-base)]"></div>`);
    // Keep focus in the editor while interacting with the popover.
    root.addEventListener("mousedown", e => e.preventDefault());
    // use:ref ran once per mount (untracked): report the element only when the
    // popover opened in slash mode, exactly like the compiled ref.
    if (untrack(() => props.popover) === "slash") props.setSlashPopoverRef(root);

    // Switch/Match on the popover mode: the body rebuilds when the mode
    // changes while open ("at" <-> "slash").
    const mode = createMemo(() => props.popover === "at" ? "at" : props.popover === "slash" ? "slash" : undefined);
    createRenderEffect(() => {
      const current = mode();
      if (current === "at") {
        // Show(atFlat.length > 0) + For: the empty state swaps only on
        // truthiness flips; rows rebuild whenever the list changes. Row
        // construction is untracked (For mapped items outside tracking).
        const hasItems = createMemo(() => props.atFlat.length > 0);
        createRenderEffect(() => {
          if (!hasItems()) {
            root.replaceChildren(untrack(() => buildEmpty("prompt.popover.emptyResults")));
            return;
          }
          const items = props.atFlat.slice(0, 10);
          root.replaceChildren(...untrack(() => items.map(item => buildAtRow(item))));
        });
        return;
      }
      if (current === "slash") {
        const hasItems = createMemo(() => props.slashFlat.length > 0);
        createRenderEffect(() => {
          if (!hasItems()) {
            root.replaceChildren(untrack(() => buildEmpty("prompt.popover.emptyCommands")));
            return;
          }
          const cmds = props.slashFlat;
          root.replaceChildren(...untrack(() => cmds.map(cmd => buildSlashRow(cmd))));
        });
        return;
      }
      root.replaceChildren();
    });
    return root;
  };

  // Show(props.popover), non-keyed: the popover exists only while a mode is
  // active and is rebuilt per open. The returned accessor is resolved by the
  // parent's insert(), matching the original Show return value.
  const open = createMemo(() => !!props.popover);
  return createMemo(() => open() ? buildRoot() : undefined);
};
