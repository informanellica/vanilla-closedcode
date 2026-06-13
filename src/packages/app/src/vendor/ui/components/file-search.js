import { createComponent, createRenderEffect } from "../../../lib/reactivity.js";
import { Portal } from "../../../lib/reactivity.js";
import { useI18n } from "../context/i18n.js";
import { Icon } from "./icon.js";

// Build the static skeleton from fully static, trusted markup. Line breaks
// only ever appear inside tags so the resulting DOM has no whitespace text
// nodes, matching the compiled template exactly. All dynamic text goes in
// via textContent / setAttribute, never into the markup string.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export function FileSearchBar(props) {
  const i18n = useI18n();
  // Solid's Portal is kept on purpose: it mounts the bar in a plain <div>
  // container appended to document.body, removes it on dispose, and wires the
  // container's host link back to the bar's place in the component tree so
  // delegated events from compiled modules keep retargeting through it.
  return createComponent(Portal, {
    get children() {
      const el = template(
        `<div class="fixed z-50 d-flex h-8 align-items-center gap-2 rounded-2 border bg-body px-3 shadow-md"><input
          class="w-40 bg-transparent outline-none fw-normal text-body-emphasis placeholder:text-secondary"><div
          class="shrink-0 small fw-normal text-secondary tabular-nums text-end" style="width:10ch"></div><div
          class="d-flex align-items-center"><button type="button"
          class="size-6 grid place-items-center rounded-2 text-secondary disabled:opacity-40 disabled:pointer-events-none"></button><button
          type="button"
          class="size-6 grid place-items-center rounded-2 text-secondary disabled:opacity-40 disabled:pointer-events-none"></button></div><button
          type="button" class="size-6 grid place-items-center rounded-2 text-secondary"></button></div>`
      );
      const input = el.querySelector("input");
      const counter = input.nextElementSibling;
      const nav = counter.nextElementSibling;
      const prevBtn = nav.firstElementChild;
      const nextBtn = prevBtn.nextElementSibling;
      const closeBtn = nav.nextElementSibling;

      // The compiled output registered this handler as a *delegated*
      // pointerdown: an `$$pointerdown` expando read by Solid's
      // document-level delegation, whose walk goes from the event target up
      // through the Portal container's host link into the viewer wrapper
      // in file.js. The wrapper's own delegated pointerdown refocuses the
      // viewer — stealing focus from this input — so the bar stops the walk
      // before it gets there. Keeping the expando (instead of a native
      // listener calling stopPropagation) preserves both halves of the
      // original behavior: the walk stops before reaching the wrapper, while
      // the native event still bubbles to document/window-level listeners
      // such as popover outside-dismiss. file.js (the only consumer) still
      // registers pointerdown delegation; once it is converted to native
      // listeners this expando becomes inert, which is then also correct
      // because portal events never bubble to the wrapper natively.
      el.$$pointerdown = e => e.stopPropagation();

      el.insertBefore(createComponent(Icon, {
        name: "magnifying-glass",
        size: "small",
        class: "text-secondary shrink-0"
      }), input);

      input.addEventListener("keydown", e => props.onKeyDown(e));
      input.addEventListener("input", e => props.onInput(e.currentTarget.value));
      const ref = props.setInput;
      if (typeof ref === "function") ref(input);
      else props.setInput = input;

      prevBtn.addEventListener("click", e => props.onPrev(e));
      prevBtn.appendChild(createComponent(Icon, {
        name: "chevron-down",
        size: "small",
        class: "rotate-180"
      }));
      nextBtn.addEventListener("click", e => props.onNext(e));
      nextBtn.appendChild(createComponent(Icon, {
        name: "chevron-down",
        size: "small"
      }));
      closeBtn.addEventListener("click", e => props.onClose(e));
      closeBtn.appendChild(createComponent(Icon, {
        name: "close-small",
        size: "small"
      }));

      createRenderEffect(() => {
        const pos = props.pos();
        el.style.setProperty("top", `${pos.top}px`);
        el.style.setProperty("right", `${pos.right}px`);
      });
      createRenderEffect(() => {
        counter.textContent = props.count() ? `${props.index() + 1}/${props.count()}` : "0/0";
      });
      createRenderEffect(() => {
        const none = props.count() === 0;
        prevBtn.disabled = none;
        nextBtn.disabled = none;
      });
      createRenderEffect(() => {
        input.setAttribute("placeholder", i18n.t("ui.fileSearch.placeholder"));
        prevBtn.setAttribute("aria-label", i18n.t("ui.fileSearch.previousMatch"));
        nextBtn.setAttribute("aria-label", i18n.t("ui.fileSearch.nextMatch"));
        closeBtn.setAttribute("aria-label", i18n.t("ui.fileSearch.close"));
      });
      createRenderEffect(() => {
        input.value = props.query();
      });
      return el;
    }
  });
}
