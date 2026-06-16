/**
 * @file Imperative confirm/choice dialog (Bootstrap modal) for use outside the
 * reactive UI tree.
 */
// Imperative Bootstrap-modal confirm/choice dialog, for code OUTSIDE the
// reactive UI tree (the file context menu, tab close) where the reactive
// Dialog component isn't convenient. Returns a Promise that resolves to the
// clicked button's id, or null if the dialog is dismissed (backdrop / Escape /
// no button). Uses the global window.bootstrap.Modal (loaded as a classic
// script in index.html); falls back to null if Bootstrap isn't available.
//
// buttons: [{ id, label, variant?: "primary" | "danger" | "secondary" }]
/**
 * Show an imperative Bootstrap-modal confirm/choice dialog and resolve with the
 * id of the button the user clicked (or null when dismissed).
 * @param {Object} options - Dialog options.
 * @param {string} options.title - Optional dialog title.
 * @param {string} options.message - Body message text.
 * @param {Array} options.buttons - Footer buttons, each `{id, label, variant}` where variant is "primary"|"danger"|"secondary".
 * @returns {Promise<string>} Resolves to the clicked button's id, or null if dismissed or Bootstrap is unavailable.
 */
export function confirmModal({ title, message, buttons } = {}) {
  return new Promise(resolve => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const bs = typeof window !== "undefined" ? window.bootstrap : undefined;

    const el = document.createElement("div");
    el.className = "modal fade";
    el.setAttribute("tabindex", "-1");
    el.setAttribute("data-component", "confirm-modal");

    const dialog = document.createElement("div");
    dialog.className = "modal-dialog modal-dialog-centered modal-sm";
    const content = document.createElement("div");
    content.className = "modal-content";

    if (title) {
      const header = document.createElement("div");
      header.className = "modal-header";
      const h = document.createElement("h5");
      h.className = "modal-title fs-6 mb-0";
      h.textContent = title;
      header.appendChild(h);
      content.appendChild(header);
    }

    const body = document.createElement("div");
    body.className = "modal-body small";
    body.style.whiteSpace = "pre-wrap";
    body.style.wordBreak = "break-all";
    body.textContent = message || "";
    content.appendChild(body);

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    content.appendChild(footer);

    dialog.appendChild(content);
    el.appendChild(dialog);

    let settled = false;
    let instance;
    const cleanup = () => {
      try { instance?.dispose(); } catch {}
      el.remove();
      // Bootstrap leaves the backdrop/body lock behind if disposed mid-animation.
      document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("padding-right");
    };
    const finish = id => {
      if (settled) return;
      settled = true;
      resolve(id);
      if (instance) {
        try { instance.hide(); return; } catch {}
      }
      cleanup();
    };

    for (const b of buttons || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      const variant = b.variant === "danger" ? "btn-danger" : b.variant === "primary" ? "btn-primary" : "btn-secondary";
      btn.className = "btn btn-sm " + variant;
      btn.textContent = b.label;
      btn.addEventListener("click", () => finish(b.id));
      footer.appendChild(btn);
    }

    document.body.appendChild(el);

    if (bs && bs.Modal) {
      instance = new bs.Modal(el, { backdrop: true, keyboard: true, focus: true });
      el.addEventListener("hidden.bs.modal", () => {
        const wasSettled = settled;
        settled = true;
        cleanup();
        if (!wasSettled) resolve(null);
      });
      instance.show();
      const btns = footer.querySelectorAll("button");
      if (btns.length) setTimeout(() => { try { btns[btns.length - 1].focus(); } catch {} }, 50);
    } else {
      // No Bootstrap runtime: cannot show a modal; resolve null (caller treats
      // as cancel) rather than blocking on a native popup.
      cleanup();
      resolve(null);
    }
  });
}
