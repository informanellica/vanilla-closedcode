/** @file PromptDragOverlay component: full-bleed drop-zone overlay shown over the prompt input while dragging files or @mentions. */
import { createComponent, createMemo, createRenderEffect, untrack } from "../../lib/reactivity.js";
import { Icon } from "@/bs/icon.js";

/**
 * Maps a drag kind to the icon name shown in the overlay.
 * @type {Object}
 */
const kindToIcon = {
  image: "photo",
  "@mention": "link"
};

/**
 * Overlay shown over the prompt input during a drag operation, displaying an icon and label appropriate to the dragged content.
 * @param {Object} props - Component props: `type` (drag kind: "image", "@mention", or null when hidden) and `label` (localized prompt text).
 * @returns {HTMLElement} A `display: contents` container that mounts/unmounts the overlay as `type` toggles.
 */
export const PromptDragOverlay = props => {
  // Pass-through wrapper: the original Show inserted the overlay element
  // directly into the parent, so this must not introduce a layout box of its
  // own (the overlay's absolute inset-0 keeps resolving against the same
  // positioned ancestor).
  const container = document.createElement("div");
  container.style.display = "contents";

  // Build a fresh overlay per show, mirroring Show's non-keyed semantics:
  // children are recreated only on each null -> non-null transition of
  // props.type, and the icon name is fixed at build time.
  const build = () => {
    const overlay = document.createElement("div");
    overlay.className = "absolute inset-0 z-10 d-flex align-items-center justify-content-center bg-body-tertiary pointer-events-none";

    const inner = document.createElement("div");
    inner.className = "d-flex flex-column align-items-center gap-2 text-secondary";

    const labelEl = document.createElement("span");
    labelEl.className = "fw-normal";

    inner.appendChild(createComponent(Icon, {
      get name() {
        return props.type ? kindToIcon[props.type] : kindToIcon.image;
      },
      class: "size-8"
    }));
    inner.appendChild(labelEl);
    overlay.appendChild(inner);

    // The label stays reactive while shown (live language switching). This
    // nested effect is owned by the outer visibility effect, so it is
    // disposed whenever the overlay is hidden or rebuilt.
    createRenderEffect(() => {
      labelEl.textContent = props.label ?? "";
    });

    return overlay;
  };

  const visible = createMemo(() => props.type !== null);
  createRenderEffect(() => {
    if (visible()) container.replaceChildren(untrack(build));
    else container.replaceChildren();
  });

  return container;
};
