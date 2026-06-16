/** @file Brand mark / logo components rendering the c-square SVG (Mark, Splash, Logo). */
import { createRenderEffect, untrack } from "../../../lib/reactivity.js";

// Brand mark: Bootstrap `c-square` icon as an inline SVG. Rendered as SVG (not
// an <i> font glyph) so it scales with the width utility classes the callers
// pass (w-10, md:w-xl, …) and inherits color via currentColor — exactly like
// the closedcode logo SVG it replaces.
const C_SQUARE_MARKUP = `<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8.146 4.992c-1.212 0-1.927.92-1.927 2.502v1.06c0 1.571.703 2.462 1.927 2.462.979 0 1.641-.586 1.729-1.418h1.295v.093c-.1 1.448-1.354 2.467-3.03 2.467-2.091 0-3.269-1.336-3.269-3.603V7.482c0-2.261 1.201-3.638 3.27-3.638 1.681 0 2.935 1.054 3.029 2.572v.088H9.875c-.088-.879-.768-1.512-1.729-1.512"></path><path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1z"></path></svg>`;

let _cSquareTemplate;
// Returns a fresh c-square <svg> node. The markup is fully static and carries
// no event listeners, so cloning a shared parsed template is safe.
/**
 * Build a fresh c-square brand SVG node by cloning a lazily-parsed shared template.
 * @returns {Node} A new <svg> element containing the c-square mark.
 */
function cSquare() {
  if (!_cSquareTemplate) {
    _cSquareTemplate = document.createElement("template");
    _cSquareTemplate.innerHTML = C_SQUARE_MARKUP;
  }
  return _cSquareTemplate.content.firstChild.cloneNode(true);
}

// SVG elements expose className as a read-only SVGAnimatedString, so the class
// must go through (set|remove)Attribute. props.class is read inside a render
// effect so a signal-backed class keeps updating live.
/**
 * Reactively bind `props.class` onto an SVG element via setAttribute/removeAttribute.
 * @param {Element} el - The SVG element to apply the class to.
 * @param {Object} props - Props bag whose `class` field (possibly signal-backed) is the class string.
 * @returns {void}
 */
function bindClass(el, props) {
  createRenderEffect(() => {
    const cls = props.class;
    if (cls) el.setAttribute("class", cls);
    else el.removeAttribute("class");
  });
}

/**
 * The brand mark: a c-square SVG sized by the caller's width class.
 * @param {Object} props - Component props.
 * @param {string} props.class - Class string applied to the SVG (controls sizing/color).
 * @returns {Node} The c-square SVG element.
 */
export const Mark = props => {
  const el = cSquare();
  bindClass(el, props);
  return el;
};

/**
 * Splash brand mark: a c-square SVG that also forwards a `ref` to the created element.
 * @param {Object} props - Component props.
 * @param {Function} props.ref - Ref callback (or ref slot) receiving the SVG element.
 * @param {string} props.class - Class string applied to the SVG.
 * @returns {Node} The c-square SVG element.
 */
export const Splash = props => {
  const el = cSquare();
  const ref = props.ref;
  if (typeof ref === "function") untrack(() => ref(el));
  else props.ref = el;
  bindClass(el, props);
  return el;
};

// Logo (the large faint home watermark / error-page brand) now renders the
// same c-square mark, scaled by the caller's width class.
/**
 * The large logo watermark (home/error-page brand), rendered as the c-square mark.
 * @param {Object} props - Component props.
 * @param {string} props.class - Class string applied to the SVG (controls sizing/color).
 * @returns {Node} The c-square SVG element.
 */
export const Logo = props => {
  const el = cSquare();
  bindClass(el, props);
  return el;
};
