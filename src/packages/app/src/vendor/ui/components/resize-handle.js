import { template as _$template } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`);
import { splitProps } from "solid-js";
export function ResizeHandle(props) {
  const [local, rest] = splitProps(props, ["direction", "edge", "size", "min", "max", "onResize", "onCollapse", "collapseThreshold", "class", "classList"]);
  const handleMouseDown = e => {
    e.preventDefault();
    const edge = local.edge ?? (local.direction === "vertical" ? "start" : "end");
    const start = local.direction === "horizontal" ? e.clientX : e.clientY;
    const startSize = local.size;
    let current = startSize;
    document.body.style.userSelect = "none";
    document.body.style.overflow = "hidden";
    const onMouseMove = moveEvent => {
      const pos = local.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
      const delta = local.direction === "vertical" ? edge === "end" ? pos - start : start - pos : edge === "start" ? start - pos : pos - start;
      current = startSize + delta;
      const clamped = Math.min(local.max, Math.max(local.min, current));
      local.onResize(clamped);
    };
    const onMouseUp = () => {
      document.body.style.userSelect = "";
      document.body.style.overflow = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      const threshold = local.collapseThreshold ?? 0;
      if (local.onCollapse && threshold > 0 && current < threshold) {
        local.onCollapse();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(rest, {
      "data-component": "resize-handle",
      get ["data-direction"]() {
        return local.direction;
      },
      get ["data-edge"]() {
        return local.edge ?? (local.direction === "vertical" ? "start" : "end");
      },
      get classList() {
        return {
          ...local.classList,
          [local.class ?? ""]: !!local.class
        };
      },
      "onMouseDown": handleMouseDown
    }), false, false);
    return _el$;
  })();
}