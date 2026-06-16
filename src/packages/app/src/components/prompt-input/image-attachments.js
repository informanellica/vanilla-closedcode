/** @file Prompt-input attachment thumbnail strip: renders a wrap of image/file thumbnails with remove buttons, reconciling rows reactively. */
import { createComponent, createMemo, createRenderEffect, mapArray } from "../../lib/reactivity.js";
import { Icon } from "@/bs/icon.js";
import { Tooltip } from "@/bs/tooltip.js";

const fallbackClass = "size-16 rounded-2 bg-body-tertiary d-flex align-items-center justify-content-center border";
const imageClass = "size-16 rounded-2 object-cover border transition-colors";
const removeClass = "absolute -top-1.5 -right-1.5 size-5 rounded-circle bg-body-tertiary border d-flex align-items-center justify-content-center opacity-0 group-hover:opacity-100 transition-opacity";
const nameClass = "absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-md";

// Build a single root element from static markup. Markup is kept on one line
// per call site so no whitespace text nodes appear (the compiled templates had
// none, and the thumbnail is an inline <img> where stray text would reflow).
/**
 * Parse a single-element HTML string into a detached DOM node.
 * @param {string} html - Static markup with a single root element.
 * @returns {Element} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Same null handling as the compiled setAttribute helper.
/**
 * Set or remove an attribute, removing it when the value is null/undefined.
 * @param {Element} el - The target element.
 * @param {string} name - The attribute name.
 * @param {*} value - The attribute value, or null/undefined to remove it.
 * @returns {void}
 */
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

// Minimal keyed child sync: nodes already in place are left untouched (a
// list update that keeps the same rows must not detach thumbnails), stale
// nodes are removed, the rest are moved/inserted in order.
/**
 * Reconcile a parent's children to exactly the given node list, removing stale nodes and inserting/moving
 * the rest in order without detaching nodes that stay in place.
 * @param {Node} parent - The container whose children are synced.
 * @param {Array} nodes - The desired ordered list of child nodes.
 * @returns {void}
 */
function reconcileChildren(parent, nodes) {
  const keep = new Set(nodes);
  let child = parent.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (!keep.has(child)) child.remove();
    child = next;
  }
  let ref = parent.firstChild;
  for (const node of nodes) {
    if (node === ref) {
      ref = ref.nextSibling;
      continue;
    }
    parent.insertBefore(node, ref);
  }
}

/**
 * Component rendering the prompt-input attachment strip: a flex-wrap of thumbnails (image preview or
 * folder fallback) with hover-revealed remove buttons and filename tooltips. The container mounts only
 * while at least one attachment is present.
 * @param {Object} props - Component props.
 * @param {Array} props.attachments - The current attachments (each with id, mime, dataUrl, filename).
 * @param {Function} props.onOpen - Called with an attachment when its thumbnail is clicked.
 * @param {Function} props.onRemove - Called with an attachment id when its remove button is clicked.
 * @param {string} props.removeLabel - Accessible label for the remove buttons.
 * @returns {Function} An accessor that yields the container element when attachments exist, else null.
 */
export const PromptImageAttachments = props => {
  /**
   * Build an image thumbnail element bound to an attachment's data URL and filename.
   * @param {Object} attachment - The attachment to preview.
   * @returns {HTMLImageElement} The thumbnail image element.
   */
  const buildThumb = attachment => {
    const img = document.createElement("img");
    img.className = imageClass;
    img.addEventListener("click", () => props.onOpen(attachment));
    createRenderEffect(() => setAttr(img, "src", attachment.dataUrl));
    createRenderEffect(() => setAttr(img, "alt", attachment.filename));
    return img;
  };
  /**
   * Build the folder-icon fallback shown for non-image attachments.
   * @returns {Element} The fallback placeholder element.
   */
  const buildFallback = () => {
    const box = template(`<div class="${fallbackClass}"></div>`);
    box.appendChild(createComponent(Icon, {
      name: "folder",
      class: "size-6 text-secondary"
    }));
    return box;
  };

  /**
   * Build one attachment row (tooltip-wrapped) containing its thumbnail/fallback, filename label, and remove button.
   * @param {Object} attachment - The attachment to render.
   * @returns {*} The tooltip-wrapped row node for the attachment.
   */
  const buildRow = attachment => {
    const row = template(
      `<div class="relative group">` +
      `<button type="button" data-slot="remove" class="${removeClass}"></button>` +
      `<div class="${nameClass}"><span data-slot="name" class="small fw-normal text-white truncate block"></span></div>` +
      `</div>`
    );
    const removeBtn = row.querySelector('[data-slot="remove"]');
    const nameEl = row.querySelector('[data-slot="name"]');

    // Show equivalent for image vs. folder fallback: the memo keeps Show's
    // truthiness semantics, so the thumbnail is only rebuilt when the kind
    // flips, not on every mime change.
    const isImage = createMemo(() => attachment.mime.startsWith("image/"));
    let thumb = null;
    createRenderEffect(() => {
      const next = isImage() ? buildThumb(attachment) : buildFallback();
      if (thumb) thumb.replaceWith(next);
      else row.insertBefore(next, row.firstChild);
      thumb = next;
    });

    removeBtn.addEventListener("click", () => props.onRemove(attachment.id));
    removeBtn.appendChild(createComponent(Icon, {
      name: "close",
      class: "size-3 text-secondary"
    }));
    createRenderEffect(() => setAttr(removeBtn, "aria-label", props.removeLabel));
    createRenderEffect(() => {
      nameEl.textContent = attachment.filename;
    });

    return createComponent(Tooltip, {
      get value() {
        return attachment.filename;
      },
      placement: "top",
      contentClass: "break-all",
      children: row
    });
  };

  const container = template(`<div class="d-flex flex-wrap gap-2 px-3 pt-3"></div>`);
  // For equivalent: mapArray keys rows by attachment reference and gives each
  // its own root, so prompt updates that keep the same attachment objects
  // (e.g. typing, which re-emits the filtered array) never rebuild rows.
  const rows = mapArray(() => props.attachments, buildRow);
  createRenderEffect(() => reconcileChildren(container, rows()));

  // Show equivalent at the root: the parent inserts function children into a
  // live region, so returning an accessor mounts/unmounts the container when
  // the attachment count crosses zero (the memo limits this to truthiness
  // flips, like Show).
  const hasAttachments = createMemo(() => props.attachments.length > 0);
  return () => (hasAttachments() ? container : null);
};
