import { createComponent, createRenderEffect, mergeProps, splitProps } from "solid-js";
import { SegmentedControl as Kobalte } from "@kobalte/core/segmented-control";

// Resolve Solid-style children: unwrap zero-arg accessors (Kobalte components
// return Dynamic memo accessors), flatten arrays, keep Nodes, stringify the
// rest. Re-run inside a render effect so reactive children stay live.
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}
function renderInto(parent, read) {
  createRenderEffect(() => {
    parent.replaceChildren(...resolveNodes(read()));
  });
}

export function RadioGroup(props) {
  const [local, others] = splitProps(props, ["class", "classList", "options", "current", "defaultValue", "value", "label", "onSelect", "size", "fill", "pad"]);
  const getValue = item => {
    if (local.value) return local.value(item);
    return String(item);
  };
  const getLabel = item => {
    if (local.label) return local.label(item);
    return String(item);
  };
  const findOption = v => {
    return local.options.find(opt => getValue(opt) === v);
  };
  const buildItem = option => createComponent(Kobalte.Item, {
    get value() {
      return getValue(option);
    },
    "data-slot": "radio-group-item",
    get ["data-value"]() {
      return getValue(option);
    },
    get children() {
      return [createComponent(Kobalte.ItemInput, {
        "data-slot": "radio-group-item-input"
      }), createComponent(Kobalte.ItemLabel, {
        "data-slot": "radio-group-item-label",
        get children() {
          const control = document.createElement("span");
          control.setAttribute("data-slot", "radio-group-item-control");
          // Label is re-read reactively so locale-dependent label functions
          // (e.g. i18n.t) stay live, matching the compiled insert().
          renderInto(control, () => getLabel(option));
          return control;
        }
      })];
    }
  });
  return createComponent(Kobalte, mergeProps(others, {
    "data-component": "radio-group",
    get ["data-size"]() {
      return local.size ?? "medium";
    },
    get ["data-fill"]() {
      return local.fill ? "" : undefined;
    },
    get ["data-pad"]() {
      return local.pad ?? "normal";
    },
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get value() {
      return local.current ? getValue(local.current) : undefined;
    },
    get defaultValue() {
      return local.defaultValue ? getValue(local.defaultValue) : undefined;
    },
    onChange: v => local.onSelect?.(findOption(v)),
    get children() {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("role", "presentation");
      wrapper.setAttribute("data-slot", "radio-group-wrapper");
      const items = document.createElement("div");
      items.setAttribute("role", "presentation");
      items.setAttribute("data-slot", "radio-group-items");
      // Kobalte.Indicator must be created synchronously inside this getter so
      // it sees the SegmentedControl context (same scope as the compiled code).
      const indicator = createComponent(Kobalte.Indicator, {
        "data-slot": "radio-group-indicator"
      });
      // The compiled output used <For> here; options are static arrays in all
      // call sites, so a full rebuild on change is an equivalent replacement.
      // Item components created inside the effect are owned by it and get
      // disposed on rebuild. <For> treats a falsy `each` as empty, mirror that.
      renderInto(items, () => (local.options || []).map(buildItem));
      // Indicator sits before the items container, as in the compiled output.
      renderInto(wrapper, () => [indicator, items]);
      return wrapper;
    }
  }));
}
