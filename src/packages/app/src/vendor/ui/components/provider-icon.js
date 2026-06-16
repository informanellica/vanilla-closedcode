/** @file ProviderIcon component: renders an SVG `<use>` reference into the provider-icons sprite sheet, falling back to a synthetic icon for unknown providers. */
import { iconNames } from "./provider-icons/types.js";
const sprite = "./provider-icons/sprite.svg";
/**
 * Provider icon component. Builds an `<svg>` containing a `<use>` element that
 * references the matching symbol in the provider sprite sheet; unknown ids fall
 * back to the "synthetic" symbol.
 * @param {Object} props - Component props.
 * @param {string} props.id - The provider id to look up in the sprite (defaults to "synthetic").
 * @param {string} props.class - Additional CSS class names for the svg.
 * @param {Object} props.classList - Solid-style class toggle map applied to the svg.
 * @returns {SVGElement} The svg element referencing the resolved provider symbol.
 */
export const ProviderIcon = props => {
  const el = document.createElement("svg");
  el.setAttribute("data-component", "provider-icon");
  const useEl = document.createElement("use");
  el.appendChild(useEl);
  const id = props.id || "synthetic";
  const resolved = iconNames.includes(id) ? id : "synthetic";
  useEl.setAttribute("href", `${sprite}#${resolved}`);
  if (props.class) {
    el.classList.add(...String(props.class).split(/\s+/).filter(Boolean));
  }
  if (props.classList) {
    Object.keys(props.classList).forEach(className => {
      if (props.classList[className]) {
        el.classList.add(...className.split(/\s+/).filter(Boolean));
      }
    });
  }
  return el;
};
