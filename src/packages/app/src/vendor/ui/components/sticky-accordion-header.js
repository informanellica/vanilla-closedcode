/** @file StickyAccordionHeader: a thin Accordion.Header wrapper that tags the sticky header variant. */
import { createComponent } from "../../../lib/reactivity.js";
import { Accordion } from "./accordion.js";

// Thin wrapper over Accordion.Header that tags the sticky header variant.
// Props are forwarded through live getters so class/classList/children stay
// reactive exactly as in the compiled Solid original.
/**
 * Render an Accordion.Header marked as the sticky-header variant, forwarding
 * class/classList/children reactively.
 * @param {Object} props - Component props.
 * @param {Object} props.classList - Optional class-name map merged onto the header.
 * @param {string} props.class - Optional extra class name toggled on when truthy.
 * @param {*} props.children - Header content.
 * @returns {*} The Accordion.Header component.
 */
export function StickyAccordionHeader(props) {
  return createComponent(Accordion.Header, {
    "data-component": "sticky-accordion-header",
    get classList() {
      return {
        ...props.classList,
        [props.class ?? ""]: !!props.class
      };
    },
    get children() {
      return props.children;
    }
  });
}
