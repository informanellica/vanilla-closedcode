/** @file Prompt attachment handling: image paste/drop, file-to-data-URL conversion and global drag wiring for the prompt input. */
import { onMount } from "../../lib/reactivity.js";
import { makeEventListener } from "../../lib/primitives/event-listener.js";
import { showToast } from "@/lib/toast.js";
import { usePrompt } from "@/context/prompt.js";
import { useLanguage } from "@/context/language.js";
import { uuid } from "@/utils/uuid.js";
import { getCursorPosition } from "./editor-dom.js";
import { attachmentMime } from "./files.js";
import { normalizePaste, pasteMode } from "./paste.js";

/**
 * Read a file as a base64 data URL, re-tagging it with the resolved MIME type.
 * @param {File} file - The file (typically an image) to encode.
 * @param {string} mime - The MIME type to embed in the resulting data URL.
 * @returns {Promise<string>} Resolves to the data URL, or an empty string on read failure.
 */
function dataUrl(file, mime) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.addEventListener("error", () => resolve(""));
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const idx = value.indexOf(",");
      if (idx === -1) {
        resolve(value);
        return;
      }
      resolve(`data:${mime};base64,${value.slice(idx + 1)}`);
    });
    reader.readAsDataURL(file);
  });
}
/**
 * Create the attachment controller for the prompt input: handles adding/removing image attachments, clipboard paste and global drag-and-drop.
 * @param {Object} input - Wiring callbacks and accessors: `editor` (Function returning the editor element), `isDialogActive` (Function), `setDraggingType` (Function), `focusEditor` (Function), `addPart` (Function inserting a prompt part) and `readClipboardImage` (Function for the platform clipboard, optional).
 * @returns {Object} An object with `addAttachment`, `addAttachments`, `removeAttachment` and `handlePaste`.
 */
export function createPromptAttachments(input) {
  const prompt = usePrompt();
  const language = useLanguage();
  const warn = () => {
    showToast({
      title: language.t("prompt.toast.pasteUnsupported.title"),
      description: language.t("prompt.toast.pasteUnsupported.description")
    });
  };
  /**
   * Validate, encode and append a single file as an image part at the current cursor position.
   * @param {File} file - The file to attach.
   * @param {boolean} toast - Whether to show a warning toast when the file type is unsupported.
   * @returns {Promise<boolean>} Resolves true when the attachment was added.
   */
  const add = async (file, toast = true) => {
    const mime = await attachmentMime(file);
    if (!mime) {
      if (toast) warn();
      return false;
    }
    const editor = input.editor();
    if (!editor) return false;
    const url = await dataUrl(file, mime);
    if (!url) return false;
    const attachment = {
      type: "image",
      id: uuid(),
      filename: file.name,
      mime,
      dataUrl: url
    };
    const cursor = prompt.cursor() ?? getCursorPosition(editor);
    prompt.set([...prompt.current(), attachment], cursor);
    return true;
  };
  /**
   * Add a single file attachment, surfacing a warning toast on unsupported types.
   * @param {File} file - The file to attach.
   * @returns {Promise<boolean>} Resolves true when the attachment was added.
   */
  const addAttachment = file => add(file);

  /**
   * Add multiple file attachments, warning once if none of them were accepted.
   * @param {Array} files - The files to attach.
   * @param {boolean} toast - Whether to show a warning toast when nothing was added.
   * @returns {Promise<boolean>} Resolves true when at least one attachment was added.
   */
  const addAttachments = async (files, toast = true) => {
    let found = false;
    for (const file of files) {
      const ok = await add(file, false);
      if (ok) found = true;
    }
    if (!found && files.length > 0 && toast) warn();
    return found;
  };
  /**
   * Remove an image attachment from the prompt by its id.
   * @param {string} id - The attachment id to remove.
   * @returns {void}
   */
  const removeAttachment = id => {
    const current = prompt.current();
    const next = current.filter(part => part.type !== "image" || part.id !== id);
    prompt.set(next, prompt.cursor());
  };
  /**
   * Paste handler: attaches clipboard image files, falls back to the platform image clipboard, otherwise inserts normalized plain text.
   * @param {ClipboardEvent} event - The paste event.
   * @returns {Promise<void>}
   */
  const handlePaste = async event => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(clipboardData.items).flatMap(item => {
      if (item.kind !== "file") return [];
      const file = item.getAsFile();
      return file ? [file] : [];
    });
    if (files.length > 0) {
      await addAttachments(files);
      return;
    }
    const plainText = clipboardData.getData("text/plain") ?? "";

    // Desktop: Browser clipboard has no images and no text, try platform's native clipboard for images
    if (input.readClipboardImage && !plainText) {
      const file = await input.readClipboardImage();
      if (file) {
        await addAttachment(file);
        return;
      }
    }
    if (!plainText) return;
    const text = normalizePaste(plainText);
    const put = () => {
      if (input.addPart({
        type: "text",
        content: text,
        start: 0,
        end: 0
      })) return true;
      input.focusEditor();
      return input.addPart({
        type: "text",
        content: text,
        start: 0,
        end: 0
      });
    };
    if (pasteMode(text) === "manual") {
      put();
      return;
    }
    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
    if (inserted) return;
    put();
  };
  /**
   * Document-level dragover handler: sets the dragging type (image vs @mention) so the overlay can render.
   * @param {DragEvent} event - The dragover event.
   * @returns {void}
   */
  const handleGlobalDragOver = event => {
    if (input.isDialogActive()) return;
    event.preventDefault();
    const hasFiles = event.dataTransfer?.types.includes("Files");
    const hasText = event.dataTransfer?.types.includes("text/plain");
    if (hasFiles) {
      input.setDraggingType("image");
    } else if (hasText) {
      input.setDraggingType("@mention");
    }
  };
  /**
   * Document-level dragleave handler: clears the dragging type when the pointer leaves the window.
   * @param {DragEvent} event - The dragleave event.
   * @returns {void}
   */
  const handleGlobalDragLeave = event => {
    if (input.isDialogActive()) return;
    if (!event.relatedTarget) {
      input.setDraggingType(null);
    }
  };
  /**
   * Document-level drop handler: inserts a dropped file path as an @mention or attaches dropped files as images.
   * @param {DragEvent} event - The drop event.
   * @returns {Promise<void>}
   */
  const handleGlobalDrop = async event => {
    if (input.isDialogActive()) return;
    event.preventDefault();
    input.setDraggingType(null);
    const plainText = event.dataTransfer?.getData("text/plain");
    const filePrefix = "file:";
    if (plainText?.startsWith(filePrefix)) {
      const filePath = plainText.slice(filePrefix.length);
      input.focusEditor();
      input.addPart({
        type: "file",
        path: filePath,
        content: "@" + filePath,
        start: 0,
        end: 0
      });
      return;
    }
    const dropped = event.dataTransfer?.files;
    if (!dropped) return;
    await addAttachments(Array.from(dropped));
  };
  onMount(() => {
    makeEventListener(document, "dragover", handleGlobalDragOver);
    makeEventListener(document, "dragleave", handleGlobalDragLeave);
    makeEventListener(document, "drop", handleGlobalDrop);
  });
  return {
    addAttachment,
    addAttachments,
    removeAttachment,
    handlePaste
  };
}