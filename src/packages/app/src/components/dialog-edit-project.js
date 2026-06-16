import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { TextField } from "@/bs/text-field.js";
import { useMutation } from "../lib/query/index.js";
import { Icon } from "@/bs/icon.js";
import { createComponent, createEffect, createMemo } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { getAvatarColors } from "@/context/layout.js";
import { getFilename } from "core/util/path";
import { Avatar } from "@/vendor/ui/components/avatar.js";
import { useLanguage } from "@/context/language.js";
import { getProjectAvatarSource } from "@/pages/layout/sidebar-items.js";
import { useProjectController, AVATAR_COLOR_KEYS } from "@/controllers/project.js";

/** @file Project-edit dialog: rename a project, set/clear its icon (color swatch, image upload or drop) and configure a startup command. */

/**
 * Build a detached element from an HTML string.
 * @param {string} html - HTML markup whose first element becomes the returned node.
 * @returns {Element} The first element of the parsed markup.
 */
// Build a detached element from an HTML string.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

const SWATCH_BASE_CLASS =
  "d-flex align-items-center justify-content-center size-10 p-0.5 rounded-3 overflow-hidden transition-colors cursor-default";

/**
 * Project-edit dialog component. Renders a form to change a project's display
 * name, icon (color swatch, uploaded/dropped image, or none) and startup command.
 * @param {Object} props - Component props.
 * @param {Object} props.project - The project being edited (id, name, worktree, icon, commands).
 * @returns {Node} The Dialog element wrapping the edit form.
 */
export function DialogEditProject(props) {
  const dialog = useDialog();
  const language = useLanguage();
  const controller = useProjectController({
    get project() {
      return props.project;
    },
    onSaved: () => dialog.close()
  });
  const folderName = createMemo(() => getFilename(props.project.worktree));
  const defaultName = createMemo(() => props.project.name || folderName());
  const [store, setStore] = createStore({
    name: defaultName(),
    color: props.project.icon?.color,
    iconOverride: props.project.icon?.override,
    startup: props.project.commands?.start ?? "",
    dragOver: false,
    iconHover: false
  });
  let iconInput;
  /**
   * Read an image file as a data URL and set it as the project icon override.
   * @param {File} file - The selected image file (non-image files are ignored).
   * @returns {void}
   */
  function handleFileSelect(file) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      setStore("iconOverride", e.target?.result);
      setStore("iconHover", false);
    };
    reader.readAsDataURL(file);
  }
  /**
   * Handle a file drop on the icon area: use the first dropped file as the icon.
   * @param {DragEvent} e - The drop event.
   * @returns {void}
   */
  function handleDrop(e) {
    e.preventDefault();
    setStore("dragOver", false);
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelect(file);
  }
  /**
   * Mark the icon drop zone as drag-over.
   * @param {DragEvent} e - The dragover event.
   * @returns {void}
   */
  function handleDragOver(e) {
    e.preventDefault();
    setStore("dragOver", true);
  }
  /**
   * Clear the drag-over state when a drag leaves the drop zone.
   * @returns {void}
   */
  function handleDragLeave() {
    setStore("dragOver", false);
  }
  /**
   * Handle the file input change: use the chosen file as the icon.
   * @param {Event} e - The input change event.
   * @returns {void}
   */
  function handleInputChange(e) {
    const input = e.target;
    const file = input.files?.[0];
    if (file) handleFileSelect(file);
  }
  /**
   * Remove the current icon override.
   * @returns {void}
   */
  function clearIcon() {
    setStore("iconOverride", "");
  }
  const saveMutation = useMutation(() => ({
    mutationFn: async () => {
      const name = store.name.trim() === folderName() ? "" : store.name.trim();
      const start = store.startup.trim();
      await controller.saveProject({
        name,
        startup: start,
        color: store.color,
        iconOverride: store.iconOverride
      });
    }
  }));
  /**
   * Submit the form: save the project unless a save is already in flight.
   * @param {Event} e - The submit event.
   * @returns {void}
   */
  function handleSubmit(e) {
    e.preventDefault();
    if (saveMutation.isPending) return;
    saveMutation.mutate();
  }

  // Current avatar preview source; the truthiness memo reproduces the
  // non-keyed Show (the branch is rebuilt only when it flips, while the
  // image src keeps updating live inside the truthy branch).
  const avatarSource = createMemo(() =>
    getProjectAvatarSource(props.project.id, {
      color: store.color,
      url: props.project.icon?.url,
      override: store.iconOverride
    })
  );
  const hasAvatarSource = createMemo(() => !!avatarSource());
  // Show(!store.iconOverride) for the color swatch section.
  const showColorSection = createMemo(() => !store.iconOverride);

  /**
   * Build the dialog body: name field, icon area (preview, upload/drop, color
   * swatches), startup-command field and the cancel/submit footer.
   * @returns {Element} The form element.
   */
  function buildBody() {
    const form = template(`
      <form class="d-flex flex-column gap-6 p-6 pt-0">
        <div class="d-flex flex-column gap-4">
          <div style="display: contents" data-slot="name-field"></div>
          <div class="d-flex flex-column gap-2">
            <label class="small fw-medium text-secondary" data-slot="icon-label"></label>
            <div class="d-flex gap-3 align-items-start">
              <div class="relative" data-slot="icon-area">
                <div class="relative size-16 rounded-2 transition-colors cursor-pointer" data-slot="icon-drop"></div>
                <div class="absolute inset-0 size-16 bg-body-tertiary rounded-[6px] z-10 pointer-events-none d-flex align-items-center justify-content-center transition-opacity" data-slot="upload-overlay"></div>
                <div class="absolute inset-0 size-16 bg-body-tertiary rounded-[6px] z-10 pointer-events-none d-flex align-items-center justify-content-center transition-opacity" data-slot="trash-overlay"></div>
              </div>
              <input id="icon-upload" type="file" accept="image/*" class="d-none">
              <div class="d-flex flex-column gap-1.5 small fw-normal text-secondary self-center">
                <span data-slot="icon-hint"></span>
                <span data-slot="icon-recommended"></span>
              </div>
            </div>
          </div>
          <div style="display: contents" data-slot="color-section"></div>
          <div style="display: contents" data-slot="startup-field"></div>
        </div>
        <div class="d-flex justify-content-end gap-2" data-slot="footer"></div>
      </form>`);
    form.addEventListener("submit", handleSubmit);

    const nameSlot = form.querySelector('[data-slot="name-field"]');
    const iconLabel = form.querySelector('[data-slot="icon-label"]');
    const iconArea = form.querySelector('[data-slot="icon-area"]');
    const dropZone = form.querySelector('[data-slot="icon-drop"]');
    const uploadOverlay = form.querySelector('[data-slot="upload-overlay"]');
    const trashOverlay = form.querySelector('[data-slot="trash-overlay"]');
    const fileInput = form.querySelector('input[type="file"]');
    const iconHint = form.querySelector('[data-slot="icon-hint"]');
    const iconRecommended = form.querySelector('[data-slot="icon-recommended"]');
    const colorSlot = form.querySelector('[data-slot="color-section"]');
    const startupSlot = form.querySelector('[data-slot="startup-field"]');
    const footer = form.querySelector('[data-slot="footer"]');

    nameSlot.appendChild(
      createComponent(TextField, {
        autofocus: true,
        type: "text",
        get label() {
          return language.t("dialog.project.edit.name");
        },
        get placeholder() {
          return folderName();
        },
        get value() {
          return store.name;
        },
        onChange: v => setStore("name", v)
      })
    );

    createEffect(() => {
      iconLabel.textContent = language.t("dialog.project.edit.icon");
    });
    createEffect(() => {
      iconHint.textContent = language.t("dialog.project.edit.icon.hint");
    });
    createEffect(() => {
      iconRecommended.textContent = language.t("dialog.project.edit.icon.recommended");
    });

    iconArea.addEventListener("mouseleave", () => setStore("iconHover", false));
    iconArea.addEventListener("mouseenter", () => setStore("iconHover", true));
    dropZone.addEventListener("click", () => {
      if (store.iconOverride && store.iconHover) {
        clearIcon();
      } else {
        iconInput?.click();
      }
    });
    dropZone.addEventListener("dragleave", handleDragLeave);
    dropZone.addEventListener("dragover", handleDragOver);
    dropZone.addEventListener("drop", handleDrop);

    // Avatar preview: image when a source exists, letter avatar otherwise.
    createEffect(() => {
      if (hasAvatarSource()) {
        const img = template(`<img class="size-full object-cover">`);
        createEffect(() => {
          const src = avatarSource();
          if (src == null) img.removeAttribute("src");
          else img.setAttribute("src", src);
        });
        createEffect(() => {
          img.setAttribute("alt", language.t("dialog.project.edit.icon.alt"));
        });
        dropZone.replaceChildren(img);
      } else {
        const holder = template(`<div class="size-full d-flex align-items-center justify-content-center"></div>`);
        // The vanilla Avatar renders once; rebuild it when its reactive
        // inputs (name, color) change so the preview stays live.
        createEffect(() => {
          holder.replaceChildren(
            createComponent(Avatar, {
              fallback: store.name || defaultName(),
              ...getAvatarColors(store.color),
              class: "size-full text-[32px]"
            })
          );
        });
        dropZone.replaceChildren(holder);
      }
    });

    uploadOverlay.appendChild(
      createComponent(Icon, {
        name: "cloud-upload",
        size: "large",
        class: "text-secondary drop-shadow-sm"
      })
    );
    trashOverlay.appendChild(
      createComponent(Icon, {
        name: "trash",
        size: "large",
        class: "text-secondary drop-shadow-sm"
      })
    );

    fileInput.addEventListener("change", handleInputChange);
    iconInput = fileInput;

    // Drop-zone border feedback and hover overlay visibility.
    createEffect(() => {
      const dragOver = store.dragOver;
      const hasOverride = !!store.iconOverride;
      dropZone.classList.toggle("border-primary", dragOver);
      dropZone.classList.toggle("bg-info-subtle", dragOver);
      dropZone.classList.toggle("border", !dragOver);
      dropZone.classList.toggle("overflow-hidden", hasOverride);
      const showUpload = store.iconHover && !hasOverride;
      uploadOverlay.classList.toggle("opacity-100", showUpload);
      uploadOverlay.classList.toggle("opacity-0", !showUpload);
      const showTrash = store.iconHover && hasOverride;
      trashOverlay.classList.toggle("opacity-100", showTrash);
      trashOverlay.classList.toggle("opacity-0", !showTrash);
    });

    // Color swatches, hidden while a custom icon override is set. Rebuilt
    // only when the Show condition flips, like the compiled output.
    createEffect(() => {
      if (!showColorSection()) {
        colorSlot.replaceChildren();
        return;
      }
      const section = template(`
        <div class="d-flex flex-column gap-2">
          <label class="small fw-medium text-secondary" data-slot="color-label"></label>
          <div class="d-flex gap-1.5" data-slot="swatches"></div>
        </div>`);
      const colorLabel = section.querySelector('[data-slot="color-label"]');
      const swatches = section.querySelector('[data-slot="swatches"]');
      createEffect(() => {
        colorLabel.textContent = language.t("dialog.project.edit.color");
      });
      for (const color of AVATAR_COLOR_KEYS) {
        const btn = template(`<button type="button"></button>`);
        btn.addEventListener("click", () => {
          if (store.color === color && !props.project.icon?.url) return;
          setStore("color", store.color === color ? undefined : color);
        });
        createEffect(() => {
          const selected = store.color === color;
          btn.setAttribute("aria-label", language.t("dialog.project.edit.color.select", { color }));
          btn.setAttribute("aria-pressed", String(selected));
          btn.className =
            SWATCH_BASE_CLASS +
            " " +
            (selected ? "bg-transparent border-2 border" : "bg-transparent border border-transparent");
        });
        // The vanilla Avatar renders once; rebuild when the project name
        // (its fallback letter) changes.
        createEffect(() => {
          btn.replaceChildren(
            createComponent(Avatar, {
              fallback: store.name || defaultName(),
              ...getAvatarColors(color),
              class: "size-full rounded"
            })
          );
        });
        swatches.appendChild(btn);
      }
      colorSlot.replaceChildren(section);
    });

    startupSlot.appendChild(
      createComponent(TextField, {
        multiline: true,
        get label() {
          return language.t("dialog.project.edit.worktree.startup");
        },
        get description() {
          return language.t("dialog.project.edit.worktree.startup.description");
        },
        get placeholder() {
          return language.t("dialog.project.edit.worktree.startup.placeholder");
        },
        get value() {
          return store.startup;
        },
        onChange: v => setStore("startup", v),
        spellcheck: false,
        class: "max-h-14 w-full overflow-y-auto font-mono text-xs"
      })
    );

    const cancelButton = createComponent(Button, {
      type: "button",
      variant: "ghost",
      size: "large",
      onClick: () => dialog.close()
    });
    const submitButton = createComponent(Button, {
      type: "submit",
      variant: "primary",
      size: "large",
      get disabled() {
        return saveMutation.isPending;
      }
    });
    // The vanilla Button renders its children once; keep the labels live
    // (saving state, locale) by updating the text directly.
    createEffect(() => {
      cancelButton.textContent = language.t("common.cancel");
    });
    createEffect(() => {
      submitButton.textContent = saveMutation.isPending
        ? language.t("common.saving")
        : language.t("common.save");
    });
    footer.append(cancelButton, submitButton);

    return form;
  }

  // bs/Dialog probes `props.children` several times (truthiness, typeof and
  // instanceof checks before the final appendChild). Memoize the built form so
  // every probe sees the same node; otherwise each getter access would re-run
  // buildBody(), leaking extra effect trees bound to discarded DOM.
  let body;
  return createComponent(Dialog, {
    get title() {
      return language.t("dialog.project.edit.title");
    },
    class: "w-full max-w-[480px] mx-auto",
    get children() {
      return (body ??= buildBody());
    }
  });
}
