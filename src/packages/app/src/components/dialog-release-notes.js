import { createComponent, createEffect, createMemo, createSignal } from "solid-js";
import { Dialog } from "@/bs/dialog.js";
import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { useLanguage } from "@/context/language.js";
import { useSettings } from "@/context/settings.js";

// Build a detached element from an HTML string.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export function DialogReleaseNotes(props) {
  const dialog = useDialog();
  const language = useLanguage();
  const settings = useSettings();
  const [index, setIndex] = createSignal(0);
  const total = () => props.highlights.length;
  const last = () => Math.max(0, total() - 1);
  const feature = () => props.highlights[index()] ?? props.highlights[last()];
  const isFirst = () => index() === 0;
  const isLast = () => index() >= last();
  const paged = () => total() > 1;
  function handleNext() {
    if (isLast()) return;
    setIndex(index() + 1);
  }
  function handleClose() {
    dialog.close();
  }
  function handleDisable() {
    settings.general.setReleaseNotes(false);
    handleClose();
  }
  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
      return;
    }
    if (!paged()) return;
    if (e.key === "ArrowLeft" && !isFirst()) {
      e.preventDefault();
      setIndex(index() - 1);
    }
    if (e.key === "ArrowRight" && !isLast()) {
      e.preventDefault();
      setIndex(index() + 1);
    }
  }

  // Dialog body. Called from the children getter below, so — like the
  // compiled output — it builds a fresh tree on every getter access.
  function buildContent() {
    const root = template(`
      <div class="d-flex flex-1 min-w-0 min-h-0" tabindex="0" autofocus>
        <div class="d-flex flex-column flex-1 min-w-0 p-8">
          <div class="d-flex flex-column gap-2 pt-22">
            <div class="d-flex align-items-center gap-2">
              <h1 class="fs-6 fw-medium text-body-emphasis" data-slot="title"></h1>
            </div>
            <p class="text-body" data-slot="description"></p>
          </div>
          <div class="flex-1"></div>
          <div class="d-flex flex-column gap-12">
            <div class="d-flex flex-column align-items-start gap-3" data-slot="actions">
              <div style="display: contents" data-slot="next-action"></div>
            </div>
            <div style="display: contents" data-slot="dots"></div>
          </div>
        </div>
        <div style="display: contents" data-slot="media"></div>
      </div>`);
    const titleEl = root.querySelector('[data-slot="title"]');
    const descEl = root.querySelector('[data-slot="description"]');
    const actionsEl = root.querySelector('[data-slot="actions"]');
    const nextSlot = root.querySelector('[data-slot="next-action"]');
    const dotsSlot = root.querySelector('[data-slot="dots"]');
    const mediaSlot = root.querySelector('[data-slot="media"]');

    // The compiled output used a delegated keydown handler; a plain bubbling
    // listener on the body root keeps the same reach, since the root holds
    // focus via tabindex/autofocus.
    root.addEventListener("keydown", handleKeyDown);

    createEffect(() => { titleEl.textContent = feature()?.title ?? ""; });
    createEffect(() => { descEl.textContent = feature()?.description ?? ""; });

    // Show(isLast), non-keyed: the action button is rebuilt only when the
    // last-page truthiness flips, like the compiled memo-gated insert. The
    // label is read inside createComponent (untracked), so it resolves with
    // the locale current at build time, matching the compiled output.
    const atEnd = createMemo(() => !!isLast());
    createEffect(() => {
      nextSlot.replaceChildren(atEnd()
        ? createComponent(Button, {
          variant: "primary",
          size: "large",
          onClick: handleClose,
          get children() {
            return language.t("dialog.releaseNotes.action.getStarted");
          }
        })
        : createComponent(Button, {
          variant: "secondary",
          size: "large",
          onClick: handleNext,
          get children() {
            return language.t("dialog.releaseNotes.action.next");
          }
        }));
    });

    // Static "don't show again" button, placed after the action slot.
    actionsEl.appendChild(createComponent(Button, {
      variant: "ghost",
      size: "small",
      onClick: handleDisable,
      get children() {
        return language.t("dialog.releaseNotes.action.hideFuture");
      }
    }));

    // Show(paged): pagination dots. The row mounts/unmounts only when the
    // paged truthiness flips; the dots stay mounted across index changes (so
    // the width/color CSS transitions can run) and only their classes are
    // toggled, change-guarded like the compiled effect.
    const hasPages = createMemo(() => !!paged());
    createEffect(() => {
      if (!hasPages()) {
        dotsSlot.replaceChildren();
        return;
      }
      const row = template(`<div class="d-flex align-items-center gap-1.5 -my-2.5"></div>`);
      createEffect(() => {
        row.replaceChildren(...props.highlights.map((_, i) => {
          const dot = template(`<button type="button" class="h-6 d-flex align-items-center cursor-pointer bg-transparent border-none p-0 transition-all duration-200"><div class="w-100 h-0.5 rounded-[1px] transition-colors duration-200"></div></button>`);
          const bar = dot.firstChild;
          dot.addEventListener("click", () => setIndex(i));
          let prevActive;
          createEffect(() => {
            const active = i === index();
            if (active === prevActive) return;
            prevActive = active;
            dot.classList.toggle("w-8", active);
            dot.classList.toggle("w-3", !active);
            bar.classList.toggle("bg-icon-strong-base", active);
            bar.classList.toggle("bg-icon-weak-base", !active);
          });
          return dot;
        }));
      });
      dotsSlot.replaceChildren(row);
    });

    // Show(feature().media): right-hand media panel. The panel mounts only
    // while the current feature has media; inside, the img/video element is
    // swapped only when the media type changes, and src/alt updates flow to
    // the existing element (no remount between same-type features).
    const hasMedia = createMemo(() => !!feature()?.media);
    createEffect(() => {
      if (!hasMedia()) {
        mediaSlot.replaceChildren();
        return;
      }
      const panel = template(`<div class="flex-1 min-w-0 bg-body-tertiary overflow-hidden rounded-r-xl"></div>`);
      const isImage = createMemo(() => feature().media.type === "image");
      createEffect(() => {
        if (isImage()) {
          const img = template(`<img class="w-100 h-100 object-cover">`);
          let prevSrc;
          let prevAlt;
          createEffect(() => {
            const src = feature().media.src;
            const alt = feature().media.alt ?? feature()?.title ?? language.t("dialog.releaseNotes.media.alt");
            if (src !== prevSrc) img.setAttribute("src", prevSrc = src);
            if (alt !== prevAlt) img.setAttribute("alt", prevAlt = alt);
          });
          panel.replaceChildren(img);
        } else {
          const video = template(`<video autoplay loop muted playsinline class="w-100 h-100 object-cover"></video>`);
          // No change guard, matching the compiled single-expression effect.
          createEffect(() => video.setAttribute("src", feature().media.src));
          panel.replaceChildren(video);
        }
      });
      mediaSlot.replaceChildren(panel);
    });

    return root;
  }

  return createComponent(Dialog, {
    size: "large",
    fit: true,
    "class": "w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),400px)] -mt-20 min-h-0 overflow-hidden",
    get children() {
      return buildContent();
    }
  });
}
