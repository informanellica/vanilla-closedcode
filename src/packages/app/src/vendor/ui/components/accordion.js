import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { Accordion as Kobalte } from "@kobalte/core/accordion";
import { splitProps } from "solid-js";
function AccordionRoot(props) {
  const [split, rest] = splitProps(props, ["class", "classList"]);
  return _$createComponent(Kobalte, _$mergeProps(rest, {
    "data-component": "accordion",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    }
  }));
}
function AccordionItem(props) {
  const [split, rest] = splitProps(props, ["class", "classList"]);
  return _$createComponent(Kobalte.Item, _$mergeProps(rest, {
    "data-slot": "accordion-item",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    }
  }));
}
function AccordionHeader(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Header, _$mergeProps(rest, {
    "data-slot": "accordion-header",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return split.children;
    }
  }));
}
function AccordionTrigger(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Trigger, _$mergeProps(rest, {
    "data-slot": "accordion-trigger",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return split.children;
    }
  }));
}
function AccordionContent(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Content, _$mergeProps(rest, {
    "data-slot": "accordion-content",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return split.children;
    }
  }));
}
export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Header: AccordionHeader,
  Trigger: AccordionTrigger,
  Content: AccordionContent
});