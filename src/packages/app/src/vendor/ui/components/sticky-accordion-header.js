import { createComponent } from "solid-js";
import { Accordion } from "./accordion.js";

// Thin wrapper over Accordion.Header that tags the sticky header variant.
// Props are forwarded through live getters so class/classList/children stay
// reactive exactly as in the compiled Solid original.
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
