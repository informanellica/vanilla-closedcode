import { useIsRouting, useLocation } from "../lib/router/index.js";
import { batch, createComponent, createEffect, onCleanup, onMount } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { makeEventListener } from "../lib/primitives/event-listener.js";
import { Tooltip } from "@/bs/tooltip.js";
import { useLanguage } from "@/context/language.js";
const span = 5000;
const ms = (n, d = 0) => {
  if (n === undefined || Number.isNaN(n)) return;
  return `${n.toFixed(d)}ms`;
};
const time = n => {
  if (n === undefined || Number.isNaN(n)) return;
  return `${Math.round(n)}`;
};
const mb = n => {
  if (n === undefined || Number.isNaN(n)) return;
  const v = n / 1024 / 1024;
  return `${v >= 1024 ? v.toFixed(0) : v.toFixed(1)}MB`;
};
const bad = (n, limit, low = false) => {
  if (n === undefined || Number.isNaN(n)) return false;
  return low ? n < limit : n > limit;
};
const session = path => path.includes("/session");

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

function Cell(props) {
  // Static skeleton; conditional classes and text are wired below.
  const root = template(
    `<div class="d-flex min-h-[42px] w-100 min-w-0 flex-column align-items-center justify-content-center rounded-[8px] px-0.5 py-1 text-center"><div class="text-[10px] leading-none font-black uppercase tracking-[0.04em] opacity-70" data-slot="label"></div><div class="text-[13px] leading-none font-bold tabular-nums sm:text-[14px]" data-slot="value"></div></div>`,
  );
  const labelEl = root.querySelector('[data-slot="label"]');
  const valueEl = root.querySelector('[data-slot="value"]');
  createEffect(() => {
    labelEl.textContent = props.label ?? "";
  });
  createEffect(() => {
    valueEl.textContent = props.value ?? "";
  });
  createEffect(() => {
    root.classList.toggle("col-span-2", !!props.wide);
  });
  createEffect(() => {
    valueEl.classList.toggle("text-danger", !!props.bad);
  });
  createEffect(() => {
    valueEl.classList.toggle("opacity-70", !!props.dim);
  });
  return createComponent(Tooltip, {
    // Read lazily so the tooltip text is fresh (locale/state) each open.
    get value() {
      return props.tip;
    },
    placement: "top",
    children: root,
  });
}
export function DebugBar() {
  const language = useLanguage();
  const location = useLocation();
  const routing = useIsRouting();
  const [state, setState] = createStore({
    cls: undefined,
    delay: undefined,
    fps: undefined,
    gap: undefined,
    heap: {
      limit: undefined,
      used: undefined
    },
    inp: undefined,
    jank: undefined,
    long: {
      block: undefined,
      count: undefined,
      max: undefined
    },
    nav: {
      dur: undefined,
      pending: false
    }
  });
  const na = () => language.t("debugBar.na");
  const heap = () => state.heap.limit ? (state.heap.used ?? 0) / state.heap.limit : undefined;
  const heapv = () => {
    const value = heap();
    if (value === undefined) return na();
    return `${Math.round(value * 100)}%`;
  };
  const longv = () => state.long.count === undefined ? na() : `${time(state.long.block) ?? na()}/${state.long.count}`;
  const navv = () => state.nav.pending ? "..." : time(state.nav.dur) ?? na();
  let prev = "";
  let start = 0;
  let init = false;
  let one = 0;
  let two = 0;
  createEffect(() => {
    const busy = routing();
    const next = `${location.pathname}${location.search}`;
    if (!init) {
      init = true;
      prev = next;
      return;
    }
    if (busy) {
      if (one !== 0) cancelAnimationFrame(one);
      if (two !== 0) cancelAnimationFrame(two);
      one = 0;
      two = 0;
      if (start !== 0) return;
      start = performance.now();
      if (session(prev)) setState("nav", {
        dur: undefined,
        pending: true
      });
      return;
    }
    if (start === 0) {
      prev = next;
      return;
    }
    const at = start;
    const from = prev;
    start = 0;
    prev = next;
    if (!(session(from) || session(next))) return;
    if (one !== 0) cancelAnimationFrame(one);
    if (two !== 0) cancelAnimationFrame(two);
    one = requestAnimationFrame(() => {
      one = 0;
      two = requestAnimationFrame(() => {
        two = 0;
        setState("nav", {
          dur: performance.now() - at,
          pending: false
        });
      });
    });
  });
  onMount(() => {
    const obs = [];
    const fps = [];
    const long = [];
    const seen = new Map();
    let hasLong = false;
    let poll;
    let raf = 0;
    let last = 0;
    let snap = 0;
    const trim = (list, span, at) => {
      while (list[0] && at - list[0].at > span) list.shift();
    };
    const syncFrame = at => {
      trim(fps, span, at);
      const total = fps.reduce((sum, entry) => sum + entry.dur, 0);
      const gap = fps.reduce((max, entry) => Math.max(max, entry.dur), 0);
      const jank = fps.filter(entry => entry.dur > 32).length;
      batch(() => {
        setState("fps", total > 0 ? fps.length * 1000 / total : undefined);
        setState("gap", gap > 0 ? gap : undefined);
        setState("jank", jank);
      });
    };
    const syncLong = (at = performance.now()) => {
      if (!hasLong) return;
      trim(long, span, at);
      const block = long.reduce((sum, entry) => sum + Math.max(0, entry.dur - 50), 0);
      const max = long.reduce((hi, entry) => Math.max(hi, entry.dur), 0);
      setState("long", {
        block,
        count: long.length,
        max
      });
    };
    const syncInp = (at = performance.now()) => {
      for (const [key, entry] of seen) {
        if (at - entry.at > span) seen.delete(key);
      }
      let delay = 0;
      let inp = 0;
      for (const entry of seen.values()) {
        delay = Math.max(delay, entry.delay);
        inp = Math.max(inp, entry.dur);
      }
      batch(() => {
        setState("delay", delay > 0 ? delay : undefined);
        setState("inp", inp > 0 ? inp : undefined);
      });
    };
    const syncHeap = () => {
      const mem = performance.memory;
      if (!mem) return;
      setState("heap", {
        limit: mem.jsHeapSizeLimit,
        used: mem.usedJSHeapSize
      });
    };
    const reset = () => {
      fps.length = 0;
      long.length = 0;
      seen.clear();
      last = 0;
      snap = 0;
      batch(() => {
        setState("fps", undefined);
        setState("gap", undefined);
        setState("jank", undefined);
        setState("delay", undefined);
        setState("inp", undefined);
        if (hasLong) setState("long", {
          block: 0,
          count: 0,
          max: 0
        });
      });
    };
    const watch = (type, init, fn) => {
      if (typeof PerformanceObserver === "undefined") return false;
      if (!(PerformanceObserver.supportedEntryTypes ?? []).includes(type)) return false;
      const ob = new PerformanceObserver(list => fn(list.getEntries()));
      try {
        ob.observe(init);
        obs.push(ob);
        return true;
      } catch {
        ob.disconnect();
        return false;
      }
    };
    if (watch("layout-shift", {
      buffered: true,
      type: "layout-shift"
    }, entries => {
      const add = entries.reduce((sum, entry) => {
        const item = entry;
        if (item.hadRecentInput) return sum;
        return sum + item.value;
      }, 0);
      if (add === 0) return;
      setState("cls", value => (value ?? 0) + add);
    })) {
      setState("cls", 0);
    }
    if (watch("longtask", {
      buffered: true,
      type: "longtask"
    }, entries => {
      const at = performance.now();
      long.push(...entries.map(entry => ({
        at: entry.startTime,
        dur: entry.duration
      })));
      syncLong(at);
    })) {
      hasLong = true;
      setState("long", {
        block: 0,
        count: 0,
        max: 0
      });
    }
    watch("event", {
      buffered: true,
      durationThreshold: 16,
      type: "event"
    }, entries => {
      for (const raw of entries) {
        const entry = raw;
        if (entry.duration < 16) continue;
        const key = entry.interactionId && entry.interactionId > 0 ? entry.interactionId : `${entry.name}:${Math.round(entry.startTime)}`;
        const prev = seen.get(key);
        const delay = Math.max(0, (entry.processingStart ?? entry.startTime) - entry.startTime);
        seen.set(key, {
          at: entry.startTime,
          delay: Math.max(prev?.delay ?? 0, delay),
          dur: Math.max(prev?.dur ?? 0, entry.duration)
        });
        if (seen.size <= 200) continue;
        const first = seen.keys().next().value;
        if (first !== undefined) seen.delete(first);
      }
      syncInp();
    });
    const loop = at => {
      if (document.visibilityState !== "visible") {
        raf = 0;
        return;
      }
      if (last === 0) {
        last = at;
        raf = requestAnimationFrame(loop);
        return;
      }
      fps.push({
        at,
        dur: at - last
      });
      last = at;
      if (at - snap >= 250) {
        snap = at;
        syncFrame(at);
      }
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      if (poll === undefined) return;
      clearInterval(poll);
      poll = undefined;
    };
    const start = () => {
      if (document.visibilityState !== "visible") return;
      if (poll === undefined) {
        poll = window.setInterval(() => {
          syncLong();
          syncInp();
          syncHeap();
        }, 1000);
      }
      if (raf !== 0) return;
      raf = requestAnimationFrame(loop);
    };
    const vis = () => {
      if (document.visibilityState !== "visible") {
        stop();
        return;
      }
      reset();
      start();
    };
    syncHeap();
    start();
    makeEventListener(document, "visibilitychange", vis);
    onCleanup(() => {
      if (one !== 0) cancelAnimationFrame(one);
      if (two !== 0) cancelAnimationFrame(two);
      stop();
      for (const ob of obs) ob.disconnect();
    });
  });
  const root = template(
    `<aside class="pointer-events-auto fixed bottom-3 right-3 z-50 w-[308px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-3 border bg-body-tertiary p-0.5 text-body-emphasis shadow-[var(--shadow-lg-border-base)] sm:bottom-4 sm:right-4 sm:w-[324px]"><div class="grid grid-cols-5 gap-px font-mono" data-slot="grid"></div></aside>`,
  );
  const grid = root.querySelector('[data-slot="grid"]');
  createEffect(() => {
    root.setAttribute("aria-label", language.t("debugBar.ariaLabel"));
  });
  grid.replaceChildren(
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.nav.label");
      },
      get tip() {
        return language.t("debugBar.nav.tip");
      },
      get value() {
        return navv();
      },
      get bad() {
        return bad(state.nav.dur, 400);
      },
      get dim() {
        return state.nav.dur === undefined && !state.nav.pending;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.fps.label");
      },
      get tip() {
        return language.t("debugBar.fps.tip");
      },
      get value() {
        return state.fps === undefined ? na() : `${Math.round(state.fps)}`;
      },
      get bad() {
        return bad(state.fps, 50, true);
      },
      get dim() {
        return state.fps === undefined;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.frame.label");
      },
      get tip() {
        return language.t("debugBar.frame.tip");
      },
      get value() {
        return time(state.gap) ?? na();
      },
      get bad() {
        return bad(state.gap, 50);
      },
      get dim() {
        return state.gap === undefined;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.jank.label");
      },
      get tip() {
        return language.t("debugBar.jank.tip");
      },
      get value() {
        return state.jank === undefined ? na() : `${state.jank}`;
      },
      get bad() {
        return bad(state.jank, 8);
      },
      get dim() {
        return state.jank === undefined;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.long.label");
      },
      get tip() {
        return language.t("debugBar.long.tip", {
          max: ms(state.long.max) ?? na()
        });
      },
      get value() {
        return longv();
      },
      get bad() {
        return bad(state.long.block, 200);
      },
      get dim() {
        return state.long.count === undefined;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.delay.label");
      },
      get tip() {
        return language.t("debugBar.delay.tip");
      },
      get value() {
        return time(state.delay) ?? na();
      },
      get bad() {
        return bad(state.delay, 100);
      },
      get dim() {
        return state.delay === undefined;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.inp.label");
      },
      get tip() {
        return language.t("debugBar.inp.tip");
      },
      get value() {
        return time(state.inp) ?? na();
      },
      get bad() {
        return bad(state.inp, 200);
      },
      get dim() {
        return state.inp === undefined;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.cls.label");
      },
      get tip() {
        return language.t("debugBar.cls.tip");
      },
      get value() {
        return state.cls === undefined ? na() : state.cls.toFixed(2);
      },
      get bad() {
        return bad(state.cls, 0.1);
      },
      get dim() {
        return state.cls === undefined;
      }
    }),
    createComponent(Cell, {
      get label() {
        return language.t("debugBar.mem.label");
      },
      get tip() {
        return state.heap.used === undefined ? language.t("debugBar.mem.tipUnavailable") : language.t("debugBar.mem.tip", {
          used: mb(state.heap.used) ?? na(),
          limit: mb(state.heap.limit) ?? na()
        });
      },
      get value() {
        return heapv();
      },
      get bad() {
        return bad(heap(), 0.8);
      },
      get dim() {
        return state.heap.used === undefined;
      },
      wide: true
    })
  );
  return root;
}
