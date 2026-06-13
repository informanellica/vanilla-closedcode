import { createComponent, createMemo } from "solid-js";
import { useNavigate, useParams } from "../lib/router/index.js";
import { useSync } from "@/context/sync.js";
import { useSDK } from "@/context/sdk.js";
import { usePrompt } from "@/context/prompt.js";
import { useDialog } from "@/lib/dialog.js";
import { useSessionController } from "@/controllers/session.js";
import { Dialog } from "@/bs/dialog.js";
import { List } from "@/bs/list.js";
import { showToast } from "@/lib/toast.js";
import { extractPromptFromParts } from "@/utils/prompt.js";
import { base64Encode } from "core/util/encode";
import { useLanguage } from "@/context/language.js";
function formatTime(date) {
  return date.toLocaleTimeString(undefined, {
    timeStyle: "short"
  });
}
export const DialogFork = () => {
  const params = useParams();
  const navigate = useNavigate();
  const sync = useSync();
  const sdk = useSDK();
  const prompt = usePrompt();
  const dialog = useDialog();
  const language = useLanguage();
  const controller = useSessionController();
  const messages = createMemo(() => {
    const sessionID = params.id;
    if (!sessionID) return [];
    const msgs = sync.data?.message?.[sessionID] ?? [];
    const result = [];
    for (const message of msgs) {
      if (message.role !== "user") continue;
      const parts = sync.data?.part?.[message.id] ?? [];
      const textPart = parts.find(x => x.type === "text" && !x.synthetic && !x.ignored);
      if (!textPart) continue;
      result.push({
        id: message.id,
        text: textPart.text.replace(/\n/g, " ").slice(0, 200),
        time: formatTime(new Date(message.time.created))
      });
    }
    return result.reverse();
  });
  const handleSelect = item => {
    if (!item) return;
    const sessionID = params.id;
    if (!sessionID) return;
    const parts = sync.data?.part?.[item.id] ?? [];
    const restored = extractPromptFromParts(parts, {
      directory: sdk.directory,
      attachmentName: language.t("common.attachment")
    });
    const dir = base64Encode(sdk.directory);
    controller.fork(sessionID, item.id).then(forked => {
      if (!forked.data) {
        showToast({
          title: language.t("common.requestFailed")
        });
        return;
      }
      dialog.close();
      prompt.set(restored, undefined, {
        dir,
        id: forked.data.id
      });
      navigate(`/${dir}/session/${forked.data.id}`);
    }).catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      showToast({
        title: language.t("common.requestFailed"),
        description: message
      });
    });
  };

  // Row renderer for List items. Items are static snapshots built by the
  // messages memo (List re-renders rows itself), so plain DOM construction is
  // enough; user message text goes through textContent, never into markup.
  const renderItem = item => {
    const row = document.createElement("div");
    row.className = "w-100 d-flex align-items-center gap-2";
    const textEl = document.createElement("span");
    textEl.className = "truncate flex-1 min-w-0 text-left font-normal";
    textEl.textContent = item.text ?? "";
    row.appendChild(textEl);
    const timeEl = document.createElement("span");
    timeEl.className = "text-secondary shrink-0 font-normal";
    timeEl.textContent = item.time ?? "";
    row.appendChild(timeEl);
    return row;
  };

  return createComponent(Dialog, {
    get title() {
      return language.t("command.session.fork");
    },
    get children() {
      return createComponent(List, {
        "class": "flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0",
        get search() {
          return {
            placeholder: language.t("common.search.placeholder"),
            autofocus: true
          };
        },
        get emptyMessage() {
          return language.t("dialog.fork.empty");
        },
        key: x => x.id,
        items: messages,
        filterKeys: ["text"],
        onSelect: handleSelect,
        children: renderItem
      });
    }
  });
};
