import { ContextMenu as Kobalte } from "@kobalte/core/context-menu";
import { createComponent, mergeProps, splitProps } from "solid-js";

// Thin Kobalte wrappers: tag each part with a data attribute and fold the
// `class` prop into `classList` (live via splitProps getters). Caller props
// come first in mergeProps so the wrapper's data attributes and classList
// always win, exactly like the compiled output.
function ContextMenuRoot(props) {
  return createComponent(Kobalte, mergeProps(props, {
    "data-component": "context-menu"
  }));
}
function ContextMenuTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Trigger, mergeProps(rest, {
    "data-slot": "context-menu-trigger",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuIcon(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Icon, mergeProps(rest, {
    "data-slot": "context-menu-icon",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuPortal(props) {
  return createComponent(Kobalte.Portal, props);
}
function ContextMenuContent(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Content, mergeProps(rest, {
    "data-component": "context-menu-content",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuArrow(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return createComponent(Kobalte.Arrow, mergeProps(rest, {
    "data-slot": "context-menu-arrow",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    }
  }));
}
function ContextMenuSeparator(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return createComponent(Kobalte.Separator, mergeProps(rest, {
    "data-slot": "context-menu-separator",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    }
  }));
}
function ContextMenuGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Group, mergeProps(rest, {
    "data-slot": "context-menu-group",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuGroupLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.GroupLabel, mergeProps(rest, {
    "data-slot": "context-menu-group-label",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuItem(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Item, mergeProps(rest, {
    "data-slot": "context-menu-item",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuItemLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.ItemLabel, mergeProps(rest, {
    "data-slot": "context-menu-item-label",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuItemDescription(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.ItemDescription, mergeProps(rest, {
    "data-slot": "context-menu-item-description",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuItemIndicator(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.ItemIndicator, mergeProps(rest, {
    "data-slot": "context-menu-item-indicator",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuRadioGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.RadioGroup, mergeProps(rest, {
    "data-slot": "context-menu-radio-group",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuRadioItem(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.RadioItem, mergeProps(rest, {
    "data-slot": "context-menu-radio-item",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuCheckboxItem(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.CheckboxItem, mergeProps(rest, {
    "data-slot": "context-menu-checkbox-item",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuSub(props) {
  return createComponent(Kobalte.Sub, props);
}
function ContextMenuSubTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.SubTrigger, mergeProps(rest, {
    "data-slot": "context-menu-sub-trigger",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
function ContextMenuSubContent(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.SubContent, mergeProps(rest, {
    "data-component": "context-menu-sub-content",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return local.children;
    }
  }));
}
export const ContextMenu = Object.assign(ContextMenuRoot, {
  Trigger: ContextMenuTrigger,
  Icon: ContextMenuIcon,
  Portal: ContextMenuPortal,
  Content: ContextMenuContent,
  Arrow: ContextMenuArrow,
  Separator: ContextMenuSeparator,
  Group: ContextMenuGroup,
  GroupLabel: ContextMenuGroupLabel,
  Item: ContextMenuItem,
  ItemLabel: ContextMenuItemLabel,
  ItemDescription: ContextMenuItemDescription,
  ItemIndicator: ContextMenuItemIndicator,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
  CheckboxItem: ContextMenuCheckboxItem,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent
});
