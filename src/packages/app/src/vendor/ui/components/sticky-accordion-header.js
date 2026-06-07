import { createComponent as _$createComponent } from "solid-js/web";
import { Accordion } from "./accordion.js";
export function StickyAccordionHeader(props) {
  return _$createComponent(Accordion.Header, {
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