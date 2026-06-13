import { createEffect, createRenderEffect, onCleanup } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";

export const Typewriter = props => {
  const [store, setStore] = createStore({
    typing: false,
    displayed: "",
    cursor: true
  });
  createEffect(() => {
    const text = props.text;
    if (!text) return;
    let i = 0;
    const timeouts = [];
    setStore("typing", true);
    setStore("displayed", "");
    setStore("cursor", true);
    const getTypingDelay = () => {
      const random = Math.random();
      if (random < 0.05) return 150 + Math.random() * 100;
      if (random < 0.15) return 80 + Math.random() * 60;
      return 30 + Math.random() * 50;
    };
    const type = () => {
      if (i < text.length) {
        setStore("displayed", text.slice(0, i + 1));
        i++;
        timeouts.push(setTimeout(type, getTypingDelay()));
      } else {
        setStore("typing", false);
        timeouts.push(setTimeout(() => setStore("cursor", false), 2000));
      }
    };
    timeouts.push(setTimeout(type, 200));
    onCleanup(() => {
      for (const timeout of timeouts) clearTimeout(timeout);
    });
  });

  // The original wrapped this in <Dynamic>; `as` is a static tag in practice,
  // so create the element once (same approach as text-shimmer.js).
  const el = document.createElement(props.as || "p");
  const textNode = document.createTextNode("");
  const cursorEl = document.createElement("span");
  cursorEl.textContent = "│";
  el.appendChild(textNode);

  createRenderEffect(() => {
    const value = props.class;
    // Mirror Solid's className(): null/undefined removes the attribute.
    if (value == null) el.removeAttribute("class");
    else el.className = value;
  });
  createRenderEffect(() => {
    textNode.data = store.displayed;
  });
  // Show equivalent: attach/detach the cursor span after the text node. The
  // original rebuilt the span on re-show; its only state is the class kept in
  // sync by the dedicated effect below, so reattaching the same node is
  // behaviorally identical.
  createRenderEffect(() => {
    if (store.cursor) el.appendChild(cursorEl);
    else cursorEl.remove();
  });
  createRenderEffect(() => {
    cursorEl.classList.toggle("blinking-cursor", !store.typing);
  });
  return el;
};
