import { createComponent, mergeProps, ErrorBoundary } from "solid-js";
import { Dynamic } from "solid-js/web";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — dynamic
// strings (export list, error text) are assigned via textContent / text
// nodes, never interpolated into the markup.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

function fn(value) {
  return typeof value === "function";
}
function pick(mod, name) {
  if (name && fn(mod[name])) return mod[name];
  if (fn(mod.default)) return mod.default;
  const preferred = Object.keys(mod).filter(k => k[0] && k[0] === k[0].toUpperCase()).find(k => fn(mod[k]));
  if (preferred) return mod[preferred];
  const first = Object.keys(mod).find(k => fn(mod[k]));
  if (first) return mod[first];
  return () => {
    // Fallback notice when the module has no usable component export.
    // `mod` is static for this closure, so the exports list is a one-time
    // text node appended after the "Exports: " label, matching the
    // compiled insert(..., null) placement.
    const root = template(`<div data-component="storybook-missing"><div>Missing component export.</div><div style="opacity:0.7;font-size:12px">Exports: </div></div>`);
    root.lastElementChild.appendChild(document.createTextNode(Object.keys(mod).join(", ") || "(none)"));
    return root;
  };
}
export function create(input) {
  const component = pick(input.mod, input.name);
  return {
    meta: {
      title: input.title,
      component
    },
    Basic: {
      args: input.args ?? {},
      render: args => {
        return createComponent(ErrorBoundary, {
          fallback: err => {
            // `err` is fixed for each fallback render — plain textContent.
            const el = template(`<pre data-component="storybook-error" style="white-space:pre-wrap"></pre>`);
            el.textContent = String(err);
            return el;
          },
          get children() {
            return createComponent(Dynamic, mergeProps({
              component: component
            }, args));
          }
        });
      }
    }
  };
}
