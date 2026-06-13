import {
  createComponent,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  on,
  onCleanup,
  untrack
} from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";

const TRACK = Array.from({
  length: 30
}, (_, index) => index % 10);
const DURATION = 600;

function normalize(value) {
  return (value % 10 + 10) % 10;
}

function spin(from, to, direction) {
  if (from === to) return 0;
  if (direction > 0) return (to - from + 10) % 10;
  return -((from - to + 10) % 10);
}

// One odometer digit. props.value is a live getter (0-9); spinning state is
// kept locally so an in-flight transition survives value updates.
function Digit(props) {
  const [state, setState] = createStore({
    step: props.value + 10,
    animating: false
  });
  const step = () => state.step;
  const animating = () => state.animating;
  let last = props.value;
  createEffect(on(() => props.value, next => {
    const delta = spin(last, next, props.direction);
    last = next;
    if (!delta) {
      setState("animating", false);
      setState("step", next + 10);
      return;
    }
    setState("animating", true);
    setState("step", value => value + delta);
  }, {
    defer: true
  }));

  const root = document.createElement("span");
  root.setAttribute("data-slot", "animated-number-digit");
  const strip = document.createElement("span");
  strip.setAttribute("data-slot", "animated-number-strip");
  strip.style.setProperty("--animated-number-duration", `var(--tool-motion-odometer-ms, ${DURATION}ms)`);
  strip.addEventListener("transitionend", () => {
    setState("animating", false);
    setState("step", value => normalize(value) + 10);
  });
  // TRACK is a static array, so the compiled <For> never re-runs: build the
  // 30 cells once.
  for (const value of TRACK) {
    const cell = document.createElement("span");
    cell.setAttribute("data-slot", "animated-number-cell");
    cell.textContent = String(value);
    strip.appendChild(cell);
  }
  root.appendChild(strip);

  // Change-guarded dynamic attributes, like the compiled effect(): an
  // unchanged value never re-touches the DOM.
  let prevAnimating;
  let prevStep;
  createRenderEffect(() => {
    const nextAnimating = animating() ? "true" : "false";
    const nextStep = `${step()}`;
    if (nextAnimating !== prevAnimating) strip.setAttribute("data-animating", prevAnimating = nextAnimating);
    if (nextStep !== prevStep) strip.style.setProperty("--animated-number-offset", prevStep = nextStep);
  });
  return root;
}

export function AnimatedNumber(props) {
  const target = createMemo(() => {
    if (!Number.isFinite(props.value)) return 0;
    return Math.max(0, Math.round(props.value));
  });
  const [state, setState] = createStore({
    value: target(),
    direction: 1
  });
  const value = () => state.value;
  const direction = () => state.direction;
  createEffect(on(target, next => {
    const current = value();
    if (next === current) return;
    setState("direction", next > current ? 1 : -1);
    setState("value", next);
  }, {
    defer: true
  }));
  const label = createMemo(() => value().toString());
  const digits = createMemo(() => Array.from(label(), char => {
    const code = char.charCodeAt(0) - 48;
    if (code < 0 || code > 9) return 0;
    return code;
  }).reverse());
  const width = createMemo(() => `${digits().length}ch`);

  const root = document.createElement("span");
  root.setAttribute("data-component", "animated-number");
  const valueEl = document.createElement("span");
  valueEl.setAttribute("data-slot", "animated-number-value");
  root.appendChild(valueEl);

  // Hand-rolled <Index>: each position keeps its Digit instance (and its
  // in-flight spin) across updates; only the per-index value signal changes.
  // New positions mount in their own root so removal disposes their effects,
  // mirroring solid's indexArray.
  const items = [];
  createRenderEffect(() => {
    const next = digits();
    untrack(() => {
      const shared = Math.min(items.length, next.length);
      for (let i = 0; i < shared; i++) items[i].set(next[i]);
      for (let i = items.length; i < next.length; i++) {
        const [digit, set] = createSignal(next[i]);
        createRoot(dispose => {
          const node = createComponent(Digit, {
            get value() {
              return digit();
            },
            get direction() {
              return direction();
            }
          });
          items.push({
            set,
            node,
            dispose
          });
          valueEl.appendChild(node);
        });
      }
      while (items.length > next.length) {
        const item = items.pop();
        item.dispose();
        item.node.remove();
      }
    });
  });
  onCleanup(() => {
    for (const item of items) item.dispose();
    items.length = 0;
  });

  // Change-guarded root class / aria-label / width, like the compiled
  // effect(). className mirrors solid-js/web semantics: nullish removes the
  // class attribute (and the guard skips the initial undefined, as compiled).
  let prevClass;
  let prevLabel;
  let prevWidth;
  createRenderEffect(() => {
    const nextClass = props.class;
    const nextLabel = label();
    const nextWidth = width();
    if (nextClass !== prevClass) {
      prevClass = nextClass;
      if (nextClass == null) root.removeAttribute("class");
      else root.className = nextClass;
    }
    if (nextLabel !== prevLabel) root.setAttribute("aria-label", prevLabel = nextLabel);
    if (nextWidth !== prevWidth) valueEl.style.setProperty("--animated-number-width", prevWidth = nextWidth);
  });
  return root;
}
