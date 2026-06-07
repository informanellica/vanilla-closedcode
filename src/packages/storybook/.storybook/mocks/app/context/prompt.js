import { createSignal } from "solid-js";
export const DEFAULT_PROMPT = [{
  type: "text",
  content: "",
  start: 0,
  end: 0
}];
function clonePart(part) {
  if (part.type === "image") return {
    ...part
  };
  if (part.type === "agent") return {
    ...part
  };
  if (part.type === "file") return {
    ...part
  };
  return {
    ...part
  };
}
function clonePrompt(prompt) {
  return prompt.map(clonePart);
}
export function isPromptEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((part, i) => JSON.stringify(part) === JSON.stringify(b[i]));
}
let index = 0;
const [prompt, setPrompt] = createSignal(clonePrompt(DEFAULT_PROMPT));
const [cursor, setCursor] = createSignal(0);
const [items, setItems] = createSignal([]);
const withKey = item => ({
  ...item,
  key: item.key ?? `ctx:${++index}`
});
export function usePrompt() {
  return {
    ready: () => true,
    current: prompt,
    cursor,
    dirty: () => !isPromptEqual(prompt(), DEFAULT_PROMPT),
    set(next, cursorPosition) {
      setPrompt(clonePrompt(next));
      if (cursorPosition !== undefined) setCursor(cursorPosition);
    },
    reset() {
      setPrompt(clonePrompt(DEFAULT_PROMPT));
      setCursor(0);
      setItems(current => current.filter(item => !!item.comment?.trim()));
    },
    context: {
      items,
      add(item) {
        const next = withKey(item);
        if (items().some(current => current.key === next.key)) return;
        setItems(current => [...current, next]);
      },
      remove(key) {
        setItems(current => current.filter(item => item.key !== key));
      },
      removeComment(path, commentID) {
        setItems(current => current.filter(item => !(item.type === "file" && item.path === path && item.commentID === commentID)));
      },
      updateComment(path, commentID, next) {
        setItems(current => current.map(item => {
          if (item.type !== "file" || item.path !== path || item.commentID !== commentID) return item;
          return withKey({
            ...item,
            ...next
          });
        }));
      },
      replaceComments(next) {
        const nonComment = items().filter(item => !item.comment?.trim());
        setItems([...nonComment, ...next.map(withKey)]);
      }
    }
  };
}