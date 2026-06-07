import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span><span data-slot=track><span data-slot=entering></span><span data-slot=leaving>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style=display:grid;gap:24px;padding:20px;max-width:820px><style>\n/* ── shared base ────────────────────────────────────────────────── */\n[data-variant] \{\n  display: inline-flex;\n  align-items: center;\n}\n\n[data-variant] [data-slot="track"] \{\n  display: grid;\n  overflow: visible;\n  min-height: 20px;\n  justify-items: start;\n  align-items: center;\n  transition: width var(--h-duration, 600ms) var(--h-spring-soft, cubic-bezier(0.34, 1.1, 0.64, 1));\n}\n\n[data-variant] [data-slot="entering"],\n[data-variant] [data-slot="leaving"] \{\n  grid-area: 1 / 1;\n  line-height: 20px;\n  white-space: nowrap;\n  justify-self: start;\n}\n\n/* kill transitions before fonts are ready */\n[data-variant][data-ready="false"] [data-slot="track"],\n[data-variant][data-ready="false"] [data-slot="entering"],\n[data-variant][data-ready="false"] [data-slot="leaving"] \{\n  transition-duration: 0ms !important;\n}\n\n\n/* ── 1. spring-up ───────────────────────────────────────────────── *\n * New text rises from below, old text exits upward.               */\n\n[data-variant="spring-up"] [data-slot="entering"],\n[data-variant="spring-up"] [data-slot="leaving"] \{\n  transition-property: transform, opacity, filter;\n  transition-duration:\n    var(--h-duration, 600ms),\n    calc(var(--h-duration-raw, 600) * 0.6 * 1ms),\n    calc(var(--h-duration-raw, 600) * 0.5 * 1ms);\n  transition-timing-function: var(--h-spring), ease-out, ease-out;\n}\n[data-variant="spring-up"] [data-slot="entering"] \{\n  transform: translateY(0);\n  opacity: 1;\n  filter: blur(0);\n}\n[data-variant="spring-up"] [data-slot="leaving"] \{\n  transform: translateY(calc(var(--h-travel, 18px) * -1));\n  opacity: 0;\n  filter: blur(var(--h-blur, 0px));\n}\n[data-variant="spring-up"][data-swapping="true"] [data-slot="entering"] \{\n  transform: translateY(var(--h-travel, 18px));\n  opacity: 0;\n  filter: blur(var(--h-blur, 0px));\n  transition-duration: 0ms !important;\n}\n[data-variant="spring-up"][data-swapping="true"] [data-slot="leaving"] \{\n  transform: translateY(0);\n  opacity: 1;\n  filter: blur(0);\n  transition-duration: 0ms !important;\n}\n\n\n/* ── 2. spring-down ─────────────────────────────────────────────── *\n * New text drops from above, old text exits downward.             */\n\n[data-variant="spring-down"] [data-slot="entering"],\n[data-variant="spring-down"] [data-slot="leaving"] \{\n  transition-property: transform, opacity, filter;\n  transition-duration:\n    var(--h-duration, 600ms),\n    calc(var(--h-duration-raw, 600) * 0.6 * 1ms),\n    calc(var(--h-duration-raw, 600) * 0.5 * 1ms);\n  transition-timing-function: var(--h-spring), ease-out, ease-out;\n}\n[data-variant="spring-down"] [data-slot="entering"] \{\n  transform: translateY(0);\n  opacity: 1;\n  filter: blur(0);\n}\n[data-variant="spring-down"] [data-slot="leaving"] \{\n  transform: translateY(var(--h-travel, 18px));\n  opacity: 0;\n  filter: blur(var(--h-blur, 0px));\n}\n[data-variant="spring-down"][data-swapping="true"] [data-slot="entering"] \{\n  transform: translateY(calc(var(--h-travel, 18px) * -1));\n  opacity: 0;\n  filter: blur(var(--h-blur, 0px));\n  transition-duration: 0ms !important;\n}\n[data-variant="spring-down"][data-swapping="true"] [data-slot="leaving"] \{\n  transform: translateY(0);\n  opacity: 1;\n  filter: blur(0);\n  transition-duration: 0ms !important;\n}\n\n\n/* ── 3. spring-pop ──────────────────────────────────────────────── *\n * Scale + slight vertical shift + blur. Playful, bouncy.          */\n\n[data-variant="spring-pop"] [data-slot="entering"],\n[data-variant="spring-pop"] [data-slot="leaving"] \{\n  transition-property: transform, opacity, filter;\n  transition-duration:\n    var(--h-duration, 600ms),\n    calc(var(--h-duration-raw, 600) * 0.55 * 1ms),\n    calc(var(--h-duration-raw, 600) * 0.55 * 1ms);\n  transition-timing-function: var(--h-spring), ease-out, ease-out;\n  transform-origin: left center;\n}\n[data-variant="spring-pop"] [data-slot="entering"] \{\n  transform: translateY(0) scale(1);\n  opacity: 1;\n  filter: blur(0);\n}\n[data-variant="spring-pop"] [data-slot="leaving"] \{\n  transform: translateY(calc(var(--h-travel, 18px) * -0.35)) scale(0.92);\n  opacity: 0;\n  filter: blur(var(--h-blur, 3px));\n}\n[data-variant="spring-pop"][data-swapping="true"] [data-slot="entering"] \{\n  transform: translateY(calc(var(--h-travel, 18px) * 0.35)) scale(0.92);\n  opacity: 0;\n  filter: blur(var(--h-blur, 3px));\n  transition-duration: 0ms !important;\n}\n[data-variant="spring-pop"][data-swapping="true"] [data-slot="leaving"] \{\n  transform: translateY(0) scale(1);\n  opacity: 1;\n  filter: blur(0);\n  transition-duration: 0ms !important;\n}\n\n\n/* ── 4. spring-blur ─────────────────────────────────────────────── *\n * Pure crossfade with heavy blur. No vertical movement.           *\n * Width still animates with spring.                               */\n\n[data-variant="spring-blur"] [data-slot="entering"],\n[data-variant="spring-blur"] [data-slot="leaving"] \{\n  transition-property: opacity, filter;\n  transition-duration:\n    calc(var(--h-duration-raw, 600) * 0.75 * 1ms),\n    var(--h-duration, 600ms);\n  transition-timing-function: ease-out, var(--h-spring-soft);\n}\n[data-variant="spring-blur"] [data-slot="entering"] \{\n  opacity: 1;\n  filter: blur(0);\n}\n[data-variant="spring-blur"] [data-slot="leaving"] \{\n  opacity: 0;\n  filter: blur(calc(var(--h-blur, 4px) * 2));\n}\n[data-variant="spring-blur"][data-swapping="true"] [data-slot="entering"] \{\n  opacity: 0;\n  filter: blur(calc(var(--h-blur, 4px) * 2));\n  transition-duration: 0ms !important;\n}\n[data-variant="spring-blur"][data-swapping="true"] [data-slot="leaving"] \{\n  opacity: 1;\n  filter: blur(0);\n  transition-duration: 0ms !important;\n}\n\n\n/* ── 5. odometer ──────────────────────────────────────────────── *\n * Both texts scroll vertically through a clipped track.           *\n *                                                                 *\n * overflow:hidden clips at the padding-box edge.                  *\n * mask-image fades to transparent at that same edge.              *\n * Result: content is invisible at the clip boundary → no hard     *\n * edge ever visible. Padding + mask height extend the clip area   *\n * so text has room to travel through the gradient fade zone.       *\n *                                                                 *\n * Uses transparent→white which works in both alpha &amp; luminance    *\n * mask modes (transparent=hidden, white=visible in both).         */\n\n[data-variant="odometer"] [data-slot="track"] \{\n  --h-mask-stop: min(var(--h-mask-size, 20px), calc(50% - 0.5px));\n  --h-odo-shift: calc(\n    100% + var(--h-travel, 18px) + var(--h-mask-height, 0px) + max(calc(var(--h-mask-pad, 28px) - 28px), 0px)\n  );\n  position: relative;\n  align-items: stretch;\n  overflow: hidden;\n  padding-block: calc(var(--h-mask-pad, 28px) + var(--h-mask-height, 0px));\n  margin-block: calc((var(--h-mask-pad, 28px) + var(--h-mask-height, 0px)) * -1);\n  -webkit-mask-image: linear-gradient(\n    to bottom,\n    transparent 0px,\n    white var(--h-mask-stop),\n    white calc(100% - var(--h-mask-stop)),\n    transparent 100%\n  );\n  mask-image: linear-gradient(\n    to bottom,\n    transparent 0px,\n    white var(--h-mask-stop),\n    white calc(100% - var(--h-mask-stop)),\n    transparent 100%\n  );\n  transition: width var(--h-duration, 600ms) var(--h-spring-soft, cubic-bezier(0.34, 1.1, 0.64, 1));\n}\n\n/* on swap, jump width instantly to the max of both texts */\n[data-variant="odometer"][data-swapping="true"] [data-slot="track"] \{\n  transition-duration: 0ms !important;\n}\n\n[data-variant="odometer"] [data-slot="entering"],\n[data-variant="odometer"] [data-slot="leaving"] \{\n  transition-property: transform;\n  transition-duration: var(--h-duration, 600ms);\n  transition-timing-function: var(--h-spring);\n  opacity: 1;\n}\n/* settled: entering in view, leaving pushed below */\n[data-variant="odometer"] [data-slot="entering"] \{\n  transform: translateY(0);\n}\n[data-variant="odometer"] [data-slot="leaving"] \{\n  transform: translateY(var(--h-odo-shift));\n}\n/* swapping: snap entering above, leaving in-place */\n[data-variant="odometer"][data-swapping="true"] [data-slot="entering"] \{\n  transform: translateY(calc(var(--h-odo-shift) * -1));\n  transition-duration: 0ms !important;\n}\n[data-variant="odometer"][data-swapping="true"] [data-slot="leaving"] \{\n  transform: translateY(0);\n  transition-duration: 0ms !important;\n}\n\n/* ── odometer + blur ──────────────────────────────────────────── *\n * Optional: adds opacity + blur transitions on top of the         *\n * positional odometer movement.                                   */\n\n[data-variant="odometer"][data-odo-blur="true"] [data-slot="entering"],\n[data-variant="odometer"][data-odo-blur="true"] [data-slot="leaving"] \{\n  transition-property: transform, opacity, filter;\n  transition-duration:\n    var(--h-duration, 600ms),\n    calc(var(--h-duration-raw, 600) * 0.6 * 1ms),\n    calc(var(--h-duration-raw, 600) * 0.5 * 1ms);\n}\n[data-variant="odometer"][data-odo-blur="true"] [data-slot="entering"] \{\n  opacity: 1;\n  filter: blur(0);\n}\n[data-variant="odometer"][data-odo-blur="true"] [data-slot="leaving"] \{\n  opacity: 0;\n  filter: blur(var(--h-blur, 4px));\n}\n[data-variant="odometer"][data-odo-blur="true"][data-swapping="true"] [data-slot="entering"] \{\n  opacity: 0;\n  filter: blur(var(--h-blur, 4px));\n}\n[data-variant="odometer"][data-odo-blur="true"][data-swapping="true"] [data-slot="leaving"] \{\n  opacity: 1;\n  filter: blur(0);\n}\n\n/* ── debug: show fade zones ───────────────────────────────────── */\n[data-variant="odometer"][data-debug="true"] [data-slot="track"] \{\n  outline: 1px dashed rgba(255, 0, 0, 0.6);\n}\n[data-variant="odometer"][data-debug="true"] [data-slot="track"]::before,\n[data-variant="odometer"][data-debug="true"] [data-slot="track"]::after \{\n  content: "";\n  position: absolute;\n  left: 0;\n  right: 0;\n  height: var(--h-mask-stop);\n  pointer-events: none;\n}\n[data-variant="odometer"][data-debug="true"] [data-slot="track"]::before \{\n  top: 0;\n  background: linear-gradient(to bottom, rgba(255, 0, 0, 0.3), transparent);\n}\n[data-variant="odometer"][data-debug="true"] [data-slot="track"]::after \{\n  bottom: 0;\n  background: linear-gradient(to top, rgba(255, 0, 0, 0.3), transparent);\n}\n\n\n/* ── slider styling ─────────────────────────────────────────────── */\ninput[type="range"].heading-slider \{\n  -webkit-appearance: none;\n  appearance: none;\n  width: 140px;\n  height: 4px;\n  border-radius: 2px;\n  background: var(--color-divider, #444);\n  outline: none;\n}\ninput[type="range"].heading-slider::-webkit-slider-thumb \{\n  -webkit-appearance: none;\n  appearance: none;\n  width: 14px;\n  height: 14px;\n  border-radius: 50%;\n  background: var(--color-accent, #58f);\n  cursor: pointer;\n  border: none;\n}\n</style><div style=display:grid;grid-template-columns:1fr;gap:16px><div><span>TextReveal (production)</span><span><span></span></span></div></div><div style="border-top:1px solid var(--color-divider, #333);padding-top:16px;display:grid;gap:10px"><div style=display:flex;align-items:center;gap:12px><span>duration</span><input type=range class=heading-slider min=200 max=1400 step=50><span>ms</span></div><div style=display:flex;align-items:center;gap:12px><span>blur</span><input type=range class=heading-slider min=0 max=16 step=0.5><span>px</span></div><div style=display:flex;align-items:center;gap:12px><span>travel</span><input type=range class=heading-slider min=4 max=120 step=1><span>px</span></div><div style=display:flex;align-items:center;gap:12px><span>bounce</span><input type=range class=heading-slider min=1 max=2.2 step=0.05><span> </span></div><div style=display:flex;align-items:center;gap:12px><span>mask</span><input type=range class=heading-slider min=0 max=50 step=1><span>px </span></div><div style=display:flex;align-items:center;gap:12px><span>mask pad</span><input type=range class=heading-slider min=0 max=60 step=1><span>px</span></div><div style=display:flex;align-items:center;gap:12px><span>mask height</span><input type=range class=heading-slider min=0 max=80 step=1><span>px</span></div></div><div style=display:grid;gap:12px><div style=display:flex;gap:8px;flex-wrap:wrap><button></button><button>Prev</button><button>Next</button><button>Clear</button><button></button><button></button><button></button></div><div style=display:flex;gap:6px;flex-wrap:wrap></div><div style="font-size:11px;color:var(--color-text-weak, #888);font-family:monospace">heading: <!> · sim: <!> · bounce: <!> · odo-blur: `),
  _tmpl$3 = /*#__PURE__*/_$template(`<div><span></span><span><span>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<button>`);

import { createEffect, on, onMount, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { TextShimmer } from "./text-shimmer.js";
import { TextReveal } from "./text-reveal.js";
export default {
  title: "UI/ThinkingHeading",
  id: "components-thinking-heading",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Overview
Playground for animating the secondary heading beside "Thinking".

Uses TextReveal for the production heading animation with tunable
duration, travel, bounce, and fade controls.`
      }
    }
  }
};
const HEADINGS = ["Planning key generation details", "Analyzing error handling", undefined, "Reviewing authentication flow", "Considering edge cases", "Evaluating performance", "Structuring the response", "Checking type safety", "Designing the API surface", "Mapping dependencies", "Outlining test strategy"];

// ---------------------------------------------------------------------------
// CSS
//
// Custom properties driven by sliders:
//   --h-duration       transition duration (e.g. "600ms")
//   --h-duration-raw   unitless number for calc (e.g. "600")
//   --h-blur           blur radius (e.g. "4px")
//   --h-travel         vertical travel distance (e.g. "18px")
//   --h-spring         full cubic-bezier for movement (set from bounce slider)
//   --h-spring-soft    softer version for width transitions
//   --h-mask-size      fade depth at top/bottom of odometer mask
//   --h-mask-pad       base padding-block on odometer track
//   --h-mask-height    extra vertical mask area per side
//   --h-mask-bg        background color for fade overlays
// ---------------------------------------------------------------------------

const STYLES = `
/* ── shared base ────────────────────────────────────────────────── */
[data-variant] {
  display: inline-flex;
  align-items: center;
}

[data-variant] [data-slot="track"] {
  display: grid;
  overflow: visible;
  min-height: 20px;
  justify-items: start;
  align-items: center;
  transition: width var(--h-duration, 600ms) var(--h-spring-soft, cubic-bezier(0.34, 1.1, 0.64, 1));
}

[data-variant] [data-slot="entering"],
[data-variant] [data-slot="leaving"] {
  grid-area: 1 / 1;
  line-height: 20px;
  white-space: nowrap;
  justify-self: start;
}

/* kill transitions before fonts are ready */
[data-variant][data-ready="false"] [data-slot="track"],
[data-variant][data-ready="false"] [data-slot="entering"],
[data-variant][data-ready="false"] [data-slot="leaving"] {
  transition-duration: 0ms !important;
}


/* ── 1. spring-up ───────────────────────────────────────────────── *
 * New text rises from below, old text exits upward.               */

[data-variant="spring-up"] [data-slot="entering"],
[data-variant="spring-up"] [data-slot="leaving"] {
  transition-property: transform, opacity, filter;
  transition-duration:
    var(--h-duration, 600ms),
    calc(var(--h-duration-raw, 600) * 0.6 * 1ms),
    calc(var(--h-duration-raw, 600) * 0.5 * 1ms);
  transition-timing-function: var(--h-spring), ease-out, ease-out;
}
[data-variant="spring-up"] [data-slot="entering"] {
  transform: translateY(0);
  opacity: 1;
  filter: blur(0);
}
[data-variant="spring-up"] [data-slot="leaving"] {
  transform: translateY(calc(var(--h-travel, 18px) * -1));
  opacity: 0;
  filter: blur(var(--h-blur, 0px));
}
[data-variant="spring-up"][data-swapping="true"] [data-slot="entering"] {
  transform: translateY(var(--h-travel, 18px));
  opacity: 0;
  filter: blur(var(--h-blur, 0px));
  transition-duration: 0ms !important;
}
[data-variant="spring-up"][data-swapping="true"] [data-slot="leaving"] {
  transform: translateY(0);
  opacity: 1;
  filter: blur(0);
  transition-duration: 0ms !important;
}


/* ── 2. spring-down ─────────────────────────────────────────────── *
 * New text drops from above, old text exits downward.             */

[data-variant="spring-down"] [data-slot="entering"],
[data-variant="spring-down"] [data-slot="leaving"] {
  transition-property: transform, opacity, filter;
  transition-duration:
    var(--h-duration, 600ms),
    calc(var(--h-duration-raw, 600) * 0.6 * 1ms),
    calc(var(--h-duration-raw, 600) * 0.5 * 1ms);
  transition-timing-function: var(--h-spring), ease-out, ease-out;
}
[data-variant="spring-down"] [data-slot="entering"] {
  transform: translateY(0);
  opacity: 1;
  filter: blur(0);
}
[data-variant="spring-down"] [data-slot="leaving"] {
  transform: translateY(var(--h-travel, 18px));
  opacity: 0;
  filter: blur(var(--h-blur, 0px));
}
[data-variant="spring-down"][data-swapping="true"] [data-slot="entering"] {
  transform: translateY(calc(var(--h-travel, 18px) * -1));
  opacity: 0;
  filter: blur(var(--h-blur, 0px));
  transition-duration: 0ms !important;
}
[data-variant="spring-down"][data-swapping="true"] [data-slot="leaving"] {
  transform: translateY(0);
  opacity: 1;
  filter: blur(0);
  transition-duration: 0ms !important;
}


/* ── 3. spring-pop ──────────────────────────────────────────────── *
 * Scale + slight vertical shift + blur. Playful, bouncy.          */

[data-variant="spring-pop"] [data-slot="entering"],
[data-variant="spring-pop"] [data-slot="leaving"] {
  transition-property: transform, opacity, filter;
  transition-duration:
    var(--h-duration, 600ms),
    calc(var(--h-duration-raw, 600) * 0.55 * 1ms),
    calc(var(--h-duration-raw, 600) * 0.55 * 1ms);
  transition-timing-function: var(--h-spring), ease-out, ease-out;
  transform-origin: left center;
}
[data-variant="spring-pop"] [data-slot="entering"] {
  transform: translateY(0) scale(1);
  opacity: 1;
  filter: blur(0);
}
[data-variant="spring-pop"] [data-slot="leaving"] {
  transform: translateY(calc(var(--h-travel, 18px) * -0.35)) scale(0.92);
  opacity: 0;
  filter: blur(var(--h-blur, 3px));
}
[data-variant="spring-pop"][data-swapping="true"] [data-slot="entering"] {
  transform: translateY(calc(var(--h-travel, 18px) * 0.35)) scale(0.92);
  opacity: 0;
  filter: blur(var(--h-blur, 3px));
  transition-duration: 0ms !important;
}
[data-variant="spring-pop"][data-swapping="true"] [data-slot="leaving"] {
  transform: translateY(0) scale(1);
  opacity: 1;
  filter: blur(0);
  transition-duration: 0ms !important;
}


/* ── 4. spring-blur ─────────────────────────────────────────────── *
 * Pure crossfade with heavy blur. No vertical movement.           *
 * Width still animates with spring.                               */

[data-variant="spring-blur"] [data-slot="entering"],
[data-variant="spring-blur"] [data-slot="leaving"] {
  transition-property: opacity, filter;
  transition-duration:
    calc(var(--h-duration-raw, 600) * 0.75 * 1ms),
    var(--h-duration, 600ms);
  transition-timing-function: ease-out, var(--h-spring-soft);
}
[data-variant="spring-blur"] [data-slot="entering"] {
  opacity: 1;
  filter: blur(0);
}
[data-variant="spring-blur"] [data-slot="leaving"] {
  opacity: 0;
  filter: blur(calc(var(--h-blur, 4px) * 2));
}
[data-variant="spring-blur"][data-swapping="true"] [data-slot="entering"] {
  opacity: 0;
  filter: blur(calc(var(--h-blur, 4px) * 2));
  transition-duration: 0ms !important;
}
[data-variant="spring-blur"][data-swapping="true"] [data-slot="leaving"] {
  opacity: 1;
  filter: blur(0);
  transition-duration: 0ms !important;
}


/* ── 5. odometer ──────────────────────────────────────────────── *
 * Both texts scroll vertically through a clipped track.           *
 *                                                                 *
 * overflow:hidden clips at the padding-box edge.                  *
 * mask-image fades to transparent at that same edge.              *
 * Result: content is invisible at the clip boundary → no hard     *
 * edge ever visible. Padding + mask height extend the clip area   *
 * so text has room to travel through the gradient fade zone.       *
 *                                                                 *
 * Uses transparent→white which works in both alpha & luminance    *
 * mask modes (transparent=hidden, white=visible in both).         */

[data-variant="odometer"] [data-slot="track"] {
  --h-mask-stop: min(var(--h-mask-size, 20px), calc(50% - 0.5px));
  --h-odo-shift: calc(
    100% + var(--h-travel, 18px) + var(--h-mask-height, 0px) + max(calc(var(--h-mask-pad, 28px) - 28px), 0px)
  );
  position: relative;
  align-items: stretch;
  overflow: hidden;
  padding-block: calc(var(--h-mask-pad, 28px) + var(--h-mask-height, 0px));
  margin-block: calc((var(--h-mask-pad, 28px) + var(--h-mask-height, 0px)) * -1);
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    white var(--h-mask-stop),
    white calc(100% - var(--h-mask-stop)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    white var(--h-mask-stop),
    white calc(100% - var(--h-mask-stop)),
    transparent 100%
  );
  transition: width var(--h-duration, 600ms) var(--h-spring-soft, cubic-bezier(0.34, 1.1, 0.64, 1));
}

/* on swap, jump width instantly to the max of both texts */
[data-variant="odometer"][data-swapping="true"] [data-slot="track"] {
  transition-duration: 0ms !important;
}

[data-variant="odometer"] [data-slot="entering"],
[data-variant="odometer"] [data-slot="leaving"] {
  transition-property: transform;
  transition-duration: var(--h-duration, 600ms);
  transition-timing-function: var(--h-spring);
  opacity: 1;
}
/* settled: entering in view, leaving pushed below */
[data-variant="odometer"] [data-slot="entering"] {
  transform: translateY(0);
}
[data-variant="odometer"] [data-slot="leaving"] {
  transform: translateY(var(--h-odo-shift));
}
/* swapping: snap entering above, leaving in-place */
[data-variant="odometer"][data-swapping="true"] [data-slot="entering"] {
  transform: translateY(calc(var(--h-odo-shift) * -1));
  transition-duration: 0ms !important;
}
[data-variant="odometer"][data-swapping="true"] [data-slot="leaving"] {
  transform: translateY(0);
  transition-duration: 0ms !important;
}

/* ── odometer + blur ──────────────────────────────────────────── *
 * Optional: adds opacity + blur transitions on top of the         *
 * positional odometer movement.                                   */

[data-variant="odometer"][data-odo-blur="true"] [data-slot="entering"],
[data-variant="odometer"][data-odo-blur="true"] [data-slot="leaving"] {
  transition-property: transform, opacity, filter;
  transition-duration:
    var(--h-duration, 600ms),
    calc(var(--h-duration-raw, 600) * 0.6 * 1ms),
    calc(var(--h-duration-raw, 600) * 0.5 * 1ms);
}
[data-variant="odometer"][data-odo-blur="true"] [data-slot="entering"] {
  opacity: 1;
  filter: blur(0);
}
[data-variant="odometer"][data-odo-blur="true"] [data-slot="leaving"] {
  opacity: 0;
  filter: blur(var(--h-blur, 4px));
}
[data-variant="odometer"][data-odo-blur="true"][data-swapping="true"] [data-slot="entering"] {
  opacity: 0;
  filter: blur(var(--h-blur, 4px));
}
[data-variant="odometer"][data-odo-blur="true"][data-swapping="true"] [data-slot="leaving"] {
  opacity: 1;
  filter: blur(0);
}

/* ── debug: show fade zones ───────────────────────────────────── */
[data-variant="odometer"][data-debug="true"] [data-slot="track"] {
  outline: 1px dashed rgba(255, 0, 0, 0.6);
}
[data-variant="odometer"][data-debug="true"] [data-slot="track"]::before,
[data-variant="odometer"][data-debug="true"] [data-slot="track"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: var(--h-mask-stop);
  pointer-events: none;
}
[data-variant="odometer"][data-debug="true"] [data-slot="track"]::before {
  top: 0;
  background: linear-gradient(to bottom, rgba(255, 0, 0, 0.3), transparent);
}
[data-variant="odometer"][data-debug="true"] [data-slot="track"]::after {
  bottom: 0;
  background: linear-gradient(to top, rgba(255, 0, 0, 0.3), transparent);
}


/* ── slider styling ─────────────────────────────────────────────── */
input[type="range"].heading-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 140px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-divider, #444);
  outline: none;
}
input[type="range"].heading-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-accent, #58f);
  cursor: pointer;
  border: none;
}
`;

// ---------------------------------------------------------------------------
// Animated heading component
//
// Width is measured via scrollWidth (NOT Range.getBoundingClientRect) because
// getBoundingClientRect includes CSS transforms — so scale(0.92) during the
// swap phase would measure 92% of the real width and permanently clip text.
// scrollWidth returns the layout/intrinsic width, unaffected by transforms.
// ---------------------------------------------------------------------------

function AnimatedHeading(props) {
  const [state, setState] = createStore({
    current: props.text,
    leaving: undefined,
    width: "auto",
    ready: false,
    swapping: false
  });
  const current = () => state.current;
  const leaving = () => state.leaving;
  const width = () => state.width;
  const ready = () => state.ready;
  const swapping = () => state.swapping;
  let enterRef;
  let leaveRef;
  let containerRef;
  let frame;
  const measureEnter = () => enterRef?.scrollWidth ?? 0;
  const measureLeave = () => leaveRef?.scrollWidth ?? 0;
  const widen = px => {
    if (px <= 0) return;
    const w = Number.parseFloat(width());
    if (Number.isFinite(w) && px <= w) return;
    setState("width", `${px}px`);
  };
  const measure = () => {
    if (!current()) {
      setState("width", "0px");
      return;
    }
    const px = measureEnter();
    if (px > 0) setState("width", `${px}px`);
  };
  createEffect(on(() => props.text, (next, prev) => {
    if (next === prev) return;
    setState("swapping", true);
    setState("leaving", prev);
    setState("current", next);
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // For odometer keep width as a grow-only max so heading never shrinks.
      if (props.variant === "odometer") {
        const enterW = measureEnter();
        const leaveW = measureLeave();
        widen(Math.max(enterW, leaveW));
        containerRef?.offsetHeight; // reflow with max width + swap positions
        setState("swapping", false);
      } else {
        containerRef?.offsetHeight;
        setState("swapping", false);
        measure();
      }
      frame = undefined;
    });
  }));
  onMount(() => {
    measure();
    void document.fonts?.ready.finally(() => {
      measure();
      requestAnimationFrame(() => setState("ready", true));
    });
  });
  onCleanup(() => {
    if (frame) cancelAnimationFrame(frame);
  });
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.nextSibling;
    var _ref$ = containerRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : containerRef = _el$;
    var _ref$2 = enterRef;
    typeof _ref$2 === "function" ? _$use(_ref$2, _el$3) : enterRef = _el$3;
    _$insert(_el$3, () => current() ?? "\u00A0");
    var _ref$3 = leaveRef;
    typeof _ref$3 === "function" ? _$use(_ref$3, _el$4) : leaveRef = _el$4;
    _$insert(_el$4, () => leaving() ?? "\u00A0");
    _$effect(_p$ => {
      var _v$ = props.variant,
        _v$2 = ready(),
        _v$3 = swapping(),
        _v$4 = props.debug ? "true" : undefined,
        _v$5 = props.odoBlur ? "true" : undefined,
        _v$6 = width();
      _v$ !== _p$.e && _$setAttribute(_el$, "data-variant", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$, "data-ready", _p$.t = _v$2);
      _v$3 !== _p$.a && _$setAttribute(_el$, "data-swapping", _p$.a = _v$3);
      _v$4 !== _p$.o && _$setAttribute(_el$, "data-debug", _p$.o = _v$4);
      _v$5 !== _p$.i && _$setAttribute(_el$, "data-odo-blur", _p$.i = _v$5);
      _v$6 !== _p$.n && _$setStyleProperty(_el$2, "width", _p$.n = _v$6);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined
    });
    return _el$;
  })();
}

// ---------------------------------------------------------------------------
// Button / layout styles
// ---------------------------------------------------------------------------

const btn = accent => ({
  padding: "6px 14px",
  "border-radius": "6px",
  border: "1px solid var(--color-divider, #333)",
  background: accent ? "var(--color-danger-fill, #c33)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "13px"
});
const smallBtn = active => ({
  padding: "4px 12px",
  "border-radius": "6px",
  border: active ? "1px solid var(--color-accent, #58f)" : "1px solid var(--color-divider, #333)",
  background: active ? "var(--color-accent, #58f)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "12px"
});
const sliderLabel = {
  "font-size": "11px",
  "font-family": "monospace",
  color: "var(--color-text-weak, #666)",
  "min-width": "70px",
  "flex-shrink": "0",
  "text-align": "right"
};
const sliderValue = {
  "font-family": "monospace",
  "font-size": "11px",
  color: "var(--color-text-weak, #aaa)",
  "min-width": "60px"
};
const cardLabel = {
  "font-size": "11px",
  "font-family": "monospace",
  color: "var(--color-text-weak, #666)"
};
const thinkingRow = {
  display: "flex",
  "align-items": "center",
  gap: "8px",
  "min-width": "0",
  "font-size": "14px",
  "font-weight": "500",
  "line-height": "20px",
  "min-height": "20px",
  color: "var(--text-weak, #aaa)"
};
const headingSlot = {
  "min-width": "0",
  overflow: "visible",
  "white-space": "nowrap",
  color: "var(--text-weaker, #888)",
  "font-weight": "400"
};
const cardStyle = {
  padding: "16px 20px",
  "border-radius": "10px",
  border: "1px solid var(--color-divider, #333)",
  background: "var(--h-mask-bg, #1a1a1a)",
  display: "grid",
  gap: "8px"
};

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const VARIANTS = [];

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const Playground = {
  render: () => {
    const [state, setState] = createStore({
      heading: HEADINGS[0],
      headingIndex: 0,
      active: true,
      cycling: false,
      duration: 550,
      blur: 2,
      travel: 4,
      bounce: 1.35,
      maskSize: 12,
      maskPad: 9,
      maskHeight: 0,
      debug: false,
      odoBlur: false
    });
    const heading = () => state.heading;
    const headingIndex = () => state.headingIndex;
    const active = () => state.active;
    const cycling = () => state.cycling;
    const duration = () => state.duration;
    const blur = () => state.blur;
    const travel = () => state.travel;
    const bounce = () => state.bounce;
    const maskSize = () => state.maskSize;
    const maskPad = () => state.maskPad;
    const maskHeight = () => state.maskHeight;
    const debug = () => state.debug;
    const odoBlur = () => state.odoBlur;
    let cycleTimer;
    const nextHeading = () => {
      const next = (headingIndex() + 1) % HEADINGS.length;
      setState("headingIndex", next);
      setState("heading", HEADINGS[next]);
    };
    const prevHeading = () => {
      const prev = (headingIndex() - 1 + HEADINGS.length) % HEADINGS.length;
      setState("headingIndex", prev);
      setState("heading", HEADINGS[prev]);
    };
    const toggleCycling = () => {
      if (cycling()) {
        clearTimeout(cycleTimer);
        cycleTimer = undefined;
        setState("cycling", false);
        return;
      }
      setState("cycling", true);
      const tick = () => {
        if (!cycling()) return;
        nextHeading();
        cycleTimer = setTimeout(tick, 850 + Math.floor(Math.random() * 550));
      };
      cycleTimer = setTimeout(tick, 850 + Math.floor(Math.random() * 550));
    };
    const clearHeading = () => {
      setState("heading", undefined);
      if (cycling()) {
        clearTimeout(cycleTimer);
        cycleTimer = undefined;
        setState("cycling", false);
      }
    };
    onCleanup(() => {
      if (cycleTimer) clearTimeout(cycleTimer);
    });
    const vars = () => ({
      "--h-duration": `${duration()}ms`,
      "--h-duration-raw": `${duration()}`,
      "--h-blur": `${blur()}px`,
      "--h-travel": `${travel()}px`,
      "--h-spring": `cubic-bezier(0.34, ${bounce()}, 0.64, 1)`,
      "--h-spring-soft": `cubic-bezier(0.34, ${Math.max(bounce() * 0.7, 1)}, 0.64, 1)`,
      "--h-mask-size": `${maskSize()}px`,
      "--h-mask-pad": `${maskPad()}px`,
      "--h-mask-height": `${maskHeight()}px`,
      "--h-mask-bg": "#1a1a1a"
    });
    return (() => {
      var _el$5 = _tmpl$2(),
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.nextSibling,
        _el$8 = _el$7.firstChild,
        _el$9 = _el$8.firstChild,
        _el$0 = _el$9.nextSibling,
        _el$1 = _el$0.firstChild,
        _el$10 = _el$7.nextSibling,
        _el$11 = _el$10.firstChild,
        _el$12 = _el$11.firstChild,
        _el$13 = _el$12.nextSibling,
        _el$14 = _el$13.nextSibling,
        _el$15 = _el$14.firstChild,
        _el$16 = _el$11.nextSibling,
        _el$17 = _el$16.firstChild,
        _el$18 = _el$17.nextSibling,
        _el$19 = _el$18.nextSibling,
        _el$20 = _el$19.firstChild,
        _el$21 = _el$16.nextSibling,
        _el$22 = _el$21.firstChild,
        _el$23 = _el$22.nextSibling,
        _el$24 = _el$23.nextSibling,
        _el$25 = _el$24.firstChild,
        _el$26 = _el$21.nextSibling,
        _el$27 = _el$26.firstChild,
        _el$28 = _el$27.nextSibling,
        _el$29 = _el$28.nextSibling,
        _el$30 = _el$29.firstChild,
        _el$31 = _el$26.nextSibling,
        _el$32 = _el$31.firstChild,
        _el$33 = _el$32.nextSibling,
        _el$34 = _el$33.nextSibling,
        _el$35 = _el$34.firstChild,
        _el$36 = _el$31.nextSibling,
        _el$37 = _el$36.firstChild,
        _el$38 = _el$37.nextSibling,
        _el$39 = _el$38.nextSibling,
        _el$40 = _el$39.firstChild,
        _el$41 = _el$36.nextSibling,
        _el$42 = _el$41.firstChild,
        _el$43 = _el$42.nextSibling,
        _el$44 = _el$43.nextSibling,
        _el$45 = _el$44.firstChild,
        _el$46 = _el$10.nextSibling,
        _el$47 = _el$46.firstChild,
        _el$48 = _el$47.firstChild,
        _el$49 = _el$48.nextSibling,
        _el$50 = _el$49.nextSibling,
        _el$51 = _el$50.nextSibling,
        _el$52 = _el$51.nextSibling,
        _el$53 = _el$52.nextSibling,
        _el$54 = _el$53.nextSibling,
        _el$55 = _el$47.nextSibling,
        _el$56 = _el$55.nextSibling,
        _el$57 = _el$56.firstChild,
        _el$61 = _el$57.nextSibling,
        _el$58 = _el$61.nextSibling,
        _el$62 = _el$58.nextSibling,
        _el$59 = _el$62.nextSibling,
        _el$63 = _el$59.nextSibling,
        _el$60 = _el$63.nextSibling;
      _$insert(_el$0, _$createComponent(TextShimmer, {
        text: "Thinking",
        get active() {
          return active();
        }
      }), _el$1);
      _$insert(_el$1, _$createComponent(TextReveal, {
        get text() {
          return heading();
        },
        get duration() {
          return duration();
        },
        travel: 25,
        edge: 17,
        get spring() {
          return `cubic-bezier(0.34, ${bounce()}, 0.64, 1)`;
        },
        get springSoft() {
          return `cubic-bezier(0.34, ${Math.max(bounce() * 0.7, 1)}, 0.64, 1)`;
        },
        growOnly: true
      }));
      _$insert(_el$7, () => VARIANTS.map(v => (() => {
        var _el$64 = _tmpl$3(),
          _el$65 = _el$64.firstChild,
          _el$66 = _el$65.nextSibling,
          _el$67 = _el$66.firstChild;
        _$insert(_el$65, () => v.label);
        _$insert(_el$66, _$createComponent(TextShimmer, {
          text: "Thinking",
          get active() {
            return active();
          }
        }), _el$67);
        _$insert(_el$67, _$createComponent(AnimatedHeading, {
          get text() {
            return heading();
          },
          get variant() {
            return v.key;
          },
          get debug() {
            return _$memo(() => v.key === "odometer")() && debug();
          },
          get odoBlur() {
            return _$memo(() => v.key === "odometer")() && odoBlur();
          }
        }));
        _$effect(_p$ => {
          var _v$31 = cardStyle,
            _v$32 = cardLabel,
            _v$33 = thinkingRow,
            _v$34 = headingSlot;
          _p$.e = _$style(_el$64, _v$31, _p$.e);
          _p$.t = _$style(_el$65, _v$32, _p$.t);
          _p$.a = _$style(_el$66, _v$33, _p$.a);
          _p$.o = _$style(_el$67, _v$34, _p$.o);
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined
        });
        return _el$64;
      })()), null);
      _el$13.$$input = e => setState("duration", Number(e.currentTarget.value));
      _$insert(_el$14, duration, _el$15);
      _el$18.$$input = e => setState("blur", Number(e.currentTarget.value));
      _$insert(_el$19, blur, _el$20);
      _el$23.$$input = e => setState("travel", Number(e.currentTarget.value));
      _$insert(_el$24, travel, _el$25);
      _el$28.$$input = e => setState("bounce", Number(e.currentTarget.value));
      _$insert(_el$29, () => bounce().toFixed(2), _el$30);
      _$insert(_el$29, (() => {
        var _c$ = _$memo(() => bounce() <= 1.05);
        return () => _c$() ? "(none)" : bounce() >= 1.9 ? "(heavy)" : "";
      })(), null);
      _el$33.$$input = e => setState("maskSize", Number(e.currentTarget.value));
      _$insert(_el$34, maskSize, _el$35);
      _$insert(_el$34, () => maskSize() === 0 ? "(hard)" : "", null);
      _el$38.$$input = e => setState("maskPad", Number(e.currentTarget.value));
      _$insert(_el$39, maskPad, _el$40);
      _el$43.$$input = e => setState("maskHeight", Number(e.currentTarget.value));
      _$insert(_el$44, maskHeight, _el$45);
      _el$48.$$click = toggleCycling;
      _$insert(_el$48, () => cycling() ? "Stop sim" : "Simulate jitter");
      _el$49.$$click = prevHeading;
      _el$50.$$click = nextHeading;
      _el$51.$$click = clearHeading;
      _el$52.$$click = () => setState("active", value => !value);
      _$insert(_el$52, () => active() ? "Shimmer: on" : "Shimmer: off");
      _el$53.$$click = () => setState("debug", value => !value);
      _$insert(_el$53, () => debug() ? "Debug mask: on" : "Debug mask");
      _el$54.$$click = () => setState("odoBlur", value => !value);
      _$insert(_el$54, () => odoBlur() ? "Odo blur: on" : "Odo blur");
      _$insert(_el$55, () => HEADINGS.map((h, i) => (() => {
        var _el$68 = _tmpl$4();
        _el$68.$$click = () => {
          setState("headingIndex", i);
          setState("heading", h);
        };
        _$insert(_el$68, h ?? "(no submessage)");
        _$effect(_$p => _$style(_el$68, smallBtn(headingIndex() === i), _$p));
        return _el$68;
      })()));
      _$insert(_el$56, () => heading() ?? "(none)", _el$61);
      _$insert(_el$56, () => cycling() ? "on" : "off", _el$62);
      _$insert(_el$56, () => bounce().toFixed(2), _el$63);
      _$insert(_el$56, () => odoBlur() ? "on" : "off", null);
      _$effect(_p$ => {
        var _v$7 = {
            ...vars()
          },
          _v$8 = cardStyle,
          _v$9 = cardLabel,
          _v$0 = thinkingRow,
          _v$1 = headingSlot,
          _v$10 = sliderLabel,
          _v$11 = sliderValue,
          _v$12 = sliderLabel,
          _v$13 = sliderValue,
          _v$14 = sliderLabel,
          _v$15 = sliderValue,
          _v$16 = sliderLabel,
          _v$17 = sliderValue,
          _v$18 = sliderLabel,
          _v$19 = sliderValue,
          _v$20 = sliderLabel,
          _v$21 = sliderValue,
          _v$22 = sliderLabel,
          _v$23 = sliderValue,
          _v$24 = btn(cycling()),
          _v$25 = btn(),
          _v$26 = btn(),
          _v$27 = btn(),
          _v$28 = smallBtn(active()),
          _v$29 = smallBtn(debug()),
          _v$30 = smallBtn(odoBlur());
        _p$.e = _$style(_el$5, _v$7, _p$.e);
        _p$.t = _$style(_el$8, _v$8, _p$.t);
        _p$.a = _$style(_el$9, _v$9, _p$.a);
        _p$.o = _$style(_el$0, _v$0, _p$.o);
        _p$.i = _$style(_el$1, _v$1, _p$.i);
        _p$.n = _$style(_el$12, _v$10, _p$.n);
        _p$.s = _$style(_el$14, _v$11, _p$.s);
        _p$.h = _$style(_el$17, _v$12, _p$.h);
        _p$.r = _$style(_el$19, _v$13, _p$.r);
        _p$.d = _$style(_el$22, _v$14, _p$.d);
        _p$.l = _$style(_el$24, _v$15, _p$.l);
        _p$.u = _$style(_el$27, _v$16, _p$.u);
        _p$.c = _$style(_el$29, _v$17, _p$.c);
        _p$.w = _$style(_el$32, _v$18, _p$.w);
        _p$.m = _$style(_el$34, _v$19, _p$.m);
        _p$.f = _$style(_el$37, _v$20, _p$.f);
        _p$.y = _$style(_el$39, _v$21, _p$.y);
        _p$.g = _$style(_el$42, _v$22, _p$.g);
        _p$.p = _$style(_el$44, _v$23, _p$.p);
        _p$.b = _$style(_el$48, _v$24, _p$.b);
        _p$.T = _$style(_el$49, _v$25, _p$.T);
        _p$.A = _$style(_el$50, _v$26, _p$.A);
        _p$.O = _$style(_el$51, _v$27, _p$.O);
        _p$.I = _$style(_el$52, _v$28, _p$.I);
        _p$.S = _$style(_el$53, _v$29, _p$.S);
        _p$.W = _$style(_el$54, _v$30, _p$.W);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined,
        s: undefined,
        h: undefined,
        r: undefined,
        d: undefined,
        l: undefined,
        u: undefined,
        c: undefined,
        w: undefined,
        m: undefined,
        f: undefined,
        y: undefined,
        g: undefined,
        p: undefined,
        b: undefined,
        T: undefined,
        A: undefined,
        O: undefined,
        I: undefined,
        S: undefined,
        W: undefined
      });
      _$effect(() => _el$13.value = duration());
      _$effect(() => _el$18.value = blur());
      _$effect(() => _el$23.value = travel());
      _$effect(() => _el$28.value = bounce());
      _$effect(() => _el$33.value = maskSize());
      _$effect(() => _el$38.value = maskPad());
      _$effect(() => _el$43.value = maskHeight());
      return _el$5;
    })();
  }
};
_$delegateEvents(["input", "click"]);