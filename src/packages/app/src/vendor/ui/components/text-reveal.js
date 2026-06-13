import { createEffect, createRenderEffect, on, onCleanup, onMount } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
const px = (value, fallback) => {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string") return value;
  return `${fallback}px`;
};
const ms = (value, fallback) => {
  if (typeof value === "number") return `${value}ms`;
  if (typeof value === "string") return value;
  return `${fallback}ms`;
};
const pct = (value, fallback) => {
  const v = value ?? fallback;
  return `${v}%`;
};
export function TextReveal(props) {
  const [state, setState] = createStore({
    cur: props.text,
    old: undefined,
    width: "auto",
    ready: false,
    swapping: false
  });
  const cur = () => state.cur;
  const old = () => state.old;
  const width = () => state.width;
  const ready = () => state.ready;
  const swapping = () => state.swapping;
  let inRef;
  let outRef;
  let rootRef;
  let frame;
  const win = () => inRef?.scrollWidth ?? 0;
  const wout = () => outRef?.scrollWidth ?? 0;
  const widen = next => {
    if (next <= 0) return;
    if (props.growOnly ?? true) {
      const prev = Number.parseFloat(width());
      if (Number.isFinite(prev) && next <= prev) return;
    }
    setState("width", `${next}px`);
  };
  createEffect(on(() => props.text, (next, prev) => {
    if (next === prev) return;
    if (typeof next === "string" && typeof prev === "string" && next.startsWith(prev)) {
      setState("cur", next);
      widen(win());
      return;
    }
    setState("swapping", true);
    setState("old", prev);
    setState("cur", next);
    if (typeof requestAnimationFrame !== "function") {
      widen(Math.max(win(), wout()));
      rootRef?.offsetHeight;
      setState("swapping", false);
      return;
    }
    if (frame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      widen(Math.max(win(), wout()));
      rootRef?.offsetHeight;
      setState("swapping", false);
      frame = undefined;
    });
  }));
  onMount(() => {
    widen(win());
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (typeof requestAnimationFrame !== "function") {
      setState("ready", true);
      return;
    }
    if (!fonts) {
      requestAnimationFrame(() => setState("ready", true));
      return;
    }
    void fonts.ready.finally(() => {
      widen(win());
      requestAnimationFrame(() => setState("ready", true));
    });
  });
  onCleanup(() => {
    if (frame === undefined || typeof cancelAnimationFrame !== "function") return;
    cancelAnimationFrame(frame);
  });

  // Static skeleton, mirroring the compiled template:
  //   <span data-component=text-reveal>
  //     <span data-slot=text-reveal-track>
  //       <span data-slot=text-reveal-entering></span>
  //       <span data-slot=text-reveal-leaving></span>
  //     </span>
  //   </span>
  const root = document.createElement("span");
  root.setAttribute("data-component", "text-reveal");
  const track = document.createElement("span");
  track.setAttribute("data-slot", "text-reveal-track");
  const entering = document.createElement("span");
  entering.setAttribute("data-slot", "text-reveal-entering");
  const leaving = document.createElement("span");
  leaving.setAttribute("data-slot", "text-reveal-leaving");
  track.appendChild(entering);
  track.appendChild(leaving);
  root.appendChild(track);

  // Internal (non-function) refs, as in the compiled output.
  rootRef = root;
  inRef = entering;
  outRef = leaving;

  // Reactive text content. The compiled insert() wrote the signal value
  // directly; replicate with textContent (no HTML interpolation). The
  // non-breaking space placeholder keeps the spans from collapsing.
  createRenderEffect(() => {
    entering.textContent = cur() ?? " ";
  });
  createRenderEffect(() => {
    leaving.textContent = old() ?? " ";
  });

  // Change-guarded dynamic attributes / style, like the compiled effect(): an
  // unchanged value never re-touches the DOM. className mirrors solid-js/web
  // semantics (nullish removes the class attribute; the guard skips the
  // initial undefined, as compiled).
  let prevReady;
  let prevSwapping;
  let prevTruncate;
  let prevClass;
  let prevLabel;
  let prevDuration;
  let prevEdge;
  let prevTravel;
  let prevSpring;
  let prevSpringSoft;
  let prevWidth;
  createRenderEffect(() => {
    const nextReady = ready() ? "true" : "false";
    const nextSwapping = swapping() ? "true" : "false";
    const nextTruncate = props.truncate ? "true" : "false";
    const nextClass = props.class;
    const nextLabel = props.text ?? "";
    const nextDuration = ms(props.duration, 450);
    const nextEdge = pct(props.edge, 17);
    const nextTravel = px(props.travel, 0);
    const nextSpring = props.spring ?? "cubic-bezier(0.34, 1.08, 0.64, 1)";
    const nextSpringSoft = props.springSoft ?? "cubic-bezier(0.34, 1, 0.64, 1)";
    const nextWidth = props.truncate ? "100%" : width();
    if (nextReady !== prevReady) root.setAttribute("data-ready", prevReady = nextReady);
    if (nextSwapping !== prevSwapping) root.setAttribute("data-swapping", prevSwapping = nextSwapping);
    if (nextTruncate !== prevTruncate) root.setAttribute("data-truncate", prevTruncate = nextTruncate);
    if (nextClass !== prevClass) {
      prevClass = nextClass;
      if (nextClass == null) root.removeAttribute("class");
      else root.className = nextClass;
    }
    if (nextLabel !== prevLabel) root.setAttribute("aria-label", prevLabel = nextLabel);
    if (nextDuration !== prevDuration) root.style.setProperty("--text-reveal-duration", prevDuration = nextDuration);
    if (nextEdge !== prevEdge) root.style.setProperty("--text-reveal-edge", prevEdge = nextEdge);
    if (nextTravel !== prevTravel) root.style.setProperty("--text-reveal-travel", prevTravel = nextTravel);
    if (nextSpring !== prevSpring) root.style.setProperty("--text-reveal-spring", prevSpring = nextSpring);
    if (nextSpringSoft !== prevSpringSoft) root.style.setProperty("--text-reveal-spring-soft", prevSpringSoft = nextSpringSoft);
    if (nextWidth !== prevWidth) track.style.setProperty("width", prevWidth = nextWidth);
  });
  return root;
}
