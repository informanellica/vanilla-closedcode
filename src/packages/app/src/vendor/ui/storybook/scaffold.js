/** @file Storybook scaffolding helpers: turn a module into a story meta/Basic story wrapped in an ErrorBoundary. */
import { createComponent, mergeProps, ErrorBoundary } from "../../../lib/reactivity.js";
import { Dynamic } from "../../../lib/reactivity.js";

/**
 * Build a detached DOM element from a compact static HTML string.
 * @param {string} html - Static markup with no inter-element whitespace.
 * @returns {Element} The first element child of the parsed markup.
 */
// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — dynamic
// strings (export list, error text) are assigned via textContent / text
// nodes, never interpolated into the markup.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/**
 * Test whether a value is a function.
 * @param {*} value - Value to test.
 * @returns {boolean} True when the value is a function.
 */
function fn(value) {
  return typeof value === "function";
}
/**
 * Select the component export from a module, preferring an explicit name, then `default`,
 * then a capitalized export, then the first function export; falls back to a component that
 * renders a "missing export" notice listing the module's exports.
 * @param {Object} mod - The imported module object.
 * @param {string} name - Preferred export name to use, if present and a function.
 * @returns {Function} The chosen component function (or a fallback notice component).
 */
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
/**
 * Build a Storybook story definition (meta plus a Basic story) for a component module.
 * The Basic story renders the resolved component via Dynamic, wrapped in an ErrorBoundary
 * that displays thrown errors as preformatted text.
 * @param {Object} input - Story inputs: `mod` (module), `name` (preferred export), `title` (story title), `args` (default render args).
 * @returns {Object} Story definition with `meta` and a `Basic` story containing `args` and `render`.
 */
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
