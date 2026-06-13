import { onMount } from "../../lib/reactivity.js";
import { makeEventListener } from "../../lib/primitives/event-listener.js";
import { showToast } from "@/lib/toast.js";
import { usePrompt } from "@/context/prompt.js";
import { useLanguage } from "@/context/language.js";
import { uuid } from "@/utils/uuid.js";
import { getCursorPosition } from "./editor-dom.js";
import { attachmentMime } from "./files.js";
import { normalizePaste, pasteMode } from "./paste.js";
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
export function createPromptAttachments(input) {
  const prompt = usePrompt();
  const language = useLanguage();
  const warn = () => {
    showToast({
      title: language.t("prompt.toast.pasteUnsupported.title"),
      description: language.t("prompt.toast.pasteUnsupported.description")
    });
  };
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
  const addAttachment = file => add(file);
  const addAttachments = async (files, toast = true) => {
    let found = false;
    for (const file of files) {
      const ok = await add(file, false);
      if (ok) found = true;
    }
    if (!found && files.length > 0 && toast) warn();
    return found;
  };
  const removeAttachment = id => {
    const current = prompt.current();
    const next = current.filter(part => part.type !== "image" || part.id !== id);
    prompt.set(next, prompt.cursor());
  };
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
  const handleGlobalDragLeave = event => {
    if (input.isDialogActive()) return;
    if (!event.relatedTarget) {
      input.setDraggingType(null);
    }
  };
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