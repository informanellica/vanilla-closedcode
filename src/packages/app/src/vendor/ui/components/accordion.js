import { Accordion as Kobalte } from "@kobalte/core/accordion";
import { createComponent, mergeProps, splitProps } from "solid-js";

// Thin Kobalte wrappers: tag each part with a data attribute and fold the
// `class` prop into `classList` (live via splitProps getters). All other
// props — including children and ref — pass straight through to Kobalte.
function withClassList(Component, dataAttr, dataValue) {
  return function (props) {
    const [split, rest] = splitProps(props, ["class", "classList"]);
    return createComponent(Component, mergeProps(rest, {
      [dataAttr]: dataValue,
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }));
  };
}

const AccordionRoot = withClassList(Kobalte, "data-component", "accordion");
const AccordionItem = withClassList(Kobalte.Item, "data-slot", "accordion-item");
const AccordionHeader = withClassList(Kobalte.Header, "data-slot", "accordion-header");
const AccordionTrigger = withClassList(Kobalte.Trigger, "data-slot", "accordion-trigger");
const AccordionContent = withClassList(Kobalte.Content, "data-slot", "accordion-content");

export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Header: AccordionHeader,
  Trigger: AccordionTrigger,
  Content: AccordionContent
});
