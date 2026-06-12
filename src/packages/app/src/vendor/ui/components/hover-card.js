import { insert as _solidInsert } from "solid-js/web";
import { HoverCard as Kobalte } from "@kobalte/core/hover-card";
import { createComponent, mergeProps, splitProps } from "solid-js";

export function HoverCard(props) {
  const [local, rest] = splitProps(props, ["trigger", "mount", "class", "classList", "children"]);
  // Merge order matters: defaults first, then caller props (rest) so e.g. a
  // caller-supplied gutter overrides the default, then our children override.
  return createComponent(Kobalte, mergeProps({
    gutter: 4
  }, rest, {
    get children() {
      return [createComponent(Kobalte.Trigger, {
        as: "div",
        "data-slot": "hover-card-trigger",
        tabIndex: -1,
        get children() {
          return local.trigger;
        }
      }), createComponent(Kobalte.Portal, {
        get mount() {
          return local.mount;
        },
        get children() {
          return createComponent(Kobalte.Content, {
            "data-component": "hover-card-content",
            get classList() {
              return {
                ...local.classList,
                [local.class ?? ""]: !!local.class
              };
            },
            get children() {
              const body = document.createElement("div");
              body.setAttribute("data-slot", "hover-card-body");
              // Children may be reactive (signal-backed getter); insert keeps
              // them live instead of evaluating once and freezing.
              _solidInsert(body, () => local.children);
              return body;
            }
          });
        }
      })];
    }
  }));
}
