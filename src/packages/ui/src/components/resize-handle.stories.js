import { template as _$template } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:8px><div style=color:var(--text-weak);font-size:12px>Size: <!>px</div><div style=height:48px;background-color:var(--background-stronger);border-radius:6px>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style=display:grid;gap:8px;width:220px><div style=color:var(--text-weak);font-size:12px>Size: <!>px</div><div style=background-color:var(--background-stronger);border-radius:6px>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div style=display:grid;gap:8px><div style=color:var(--text-weak);font-size:12px></div><div style=height:48px;background-color:var(--background-stronger);border-radius:6px>`);
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import * as mod from "./resize-handle.js";
const docs = `### Overview
Drag handle for resizing panels or split views.

Use alongside resizable panels and split layouts.

### API
- Required: \`direction\`, \`size\`, \`min\`, \`max\`, \`onResize\`.
- Optional: \`edge\`, \`onCollapse\`, \`collapseThreshold\`.

### Variants and states
- Horizontal and vertical directions.

### Behavior
- Drag updates size and calls \`onResize\` with clamped values.

### Accessibility
- TODO: provide keyboard resizing guidance if needed.

### Theming/tokens
- Uses \`data-component="resize-handle"\` with direction/edge data attributes.

`;
export default {
  title: "UI/ResizeHandle",
  id: "components-resize-handle",
  component: mod.ResizeHandle,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  }
};
export const Basic = {
  render: () => {
    const [size, setSize] = createSignal(240);
    return (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$5 = _el$3.nextSibling,
        _el$4 = _el$5.nextSibling,
        _el$6 = _el$2.nextSibling;
      _$insert(_el$2, size, _el$5);
      _$insert(_el$, _$createComponent(mod.ResizeHandle, {
        direction: "horizontal",
        get size() {
          return size();
        },
        min: 120,
        max: 480,
        onResize: setSize,
        style: "height:24px;border:1px dashed color-mix(in oklab, var(--text-base) 20%, transparent)"
      }), null);
      _$effect(_$p => _$setStyleProperty(_el$6, "width", `${size()}px`));
      return _el$;
    })();
  }
};
export const Vertical = {
  render: () => {
    const [size, setSize] = createSignal(180);
    return (() => {
      var _el$7 = _tmpl$2(),
        _el$8 = _el$7.firstChild,
        _el$9 = _el$8.firstChild,
        _el$1 = _el$9.nextSibling,
        _el$0 = _el$1.nextSibling,
        _el$10 = _el$8.nextSibling;
      _$insert(_el$8, size, _el$1);
      _$insert(_el$7, _$createComponent(mod.ResizeHandle, {
        direction: "vertical",
        get size() {
          return size();
        },
        min: 120,
        max: 320,
        onResize: setSize,
        style: "width:24px;border:1px dashed color-mix(in oklab, var(--text-base) 20%, transparent)"
      }), null);
      _$effect(_$p => _$setStyleProperty(_el$10, "height", `${size()}px`));
      return _el$7;
    })();
  }
};
export const Collapse = {
  render: () => {
    const [state, setState] = createStore({
      size: 200,
      collapsed: false
    });
    const size = () => state.size;
    const collapsed = () => state.collapsed;
    return (() => {
      var _el$11 = _tmpl$3(),
        _el$12 = _el$11.firstChild,
        _el$13 = _el$12.nextSibling;
      _$insert(_el$12, (() => {
        var _c$ = _$memo(() => !!collapsed());
        return () => _c$() ? "Collapsed" : `Size: ${size()}px`;
      })());
      _$insert(_el$11, _$createComponent(mod.ResizeHandle, {
        direction: "horizontal",
        get size() {
          return size();
        },
        min: 80,
        max: 360,
        collapseThreshold: 100,
        onResize: next => {
          setState("collapsed", false);
          setState("size", next);
        },
        onCollapse: () => setState("collapsed", true),
        style: "height:24px;border:1px dashed color-mix(in oklab, var(--text-base) 20%, transparent)"
      }), null);
      _$effect(_$p => _$setStyleProperty(_el$13, "width", `${collapsed() ? 0 : size()}px`));
      return _el$11;
    })();
  }
};
export const EdgeStart = {
  render: () => {
    const [size, setSize] = createSignal(240);
    return (() => {
      var _el$14 = _tmpl$(),
        _el$15 = _el$14.firstChild,
        _el$16 = _el$15.firstChild,
        _el$18 = _el$16.nextSibling,
        _el$17 = _el$18.nextSibling,
        _el$19 = _el$15.nextSibling;
      _$insert(_el$15, size, _el$18);
      _$insert(_el$14, _$createComponent(mod.ResizeHandle, {
        direction: "horizontal",
        edge: "start",
        get size() {
          return size();
        },
        min: 120,
        max: 480,
        onResize: setSize,
        style: "height:24px;border:1px dashed color-mix(in oklab, var(--text-base) 20%, transparent)"
      }), null);
      _$effect(_$p => _$setStyleProperty(_el$19, "width", `${size()}px`));
      return _el$14;
    })();
  }
};