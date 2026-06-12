import { createComponent, mergeProps, splitProps } from "solid-js";
import { DropdownMenu as Kobalte } from "@kobalte/core/dropdown-menu";

// These components are pure composition over Kobalte's DropdownMenu: there is
// no DOM skeleton of their own, so the vanilla form keeps the same component
// tree built with createComponent/mergeProps (re-exported by solid-js;
// identical to the compiled solid-js/web helpers). Kobalte owns rendering,
// portal and the presence-gated content; all reactive props (children,
// class/classList, refs, handlers) stay live through getters and mergeProps.
function DropdownMenuRoot(props) {
  return createComponent(Kobalte, mergeProps(props, {
    "data-component": "dropdown-menu"
  }));
}
function DropdownMenuTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Trigger, mergeProps(rest, {
    "data-slot": "dropdown-menu-trigger",
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
function DropdownMenuIcon(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Icon, mergeProps(rest, {
    "data-slot": "dropdown-menu-icon",
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
function DropdownMenuPortal(props) {
  return createComponent(Kobalte.Portal, props);
}
function DropdownMenuContent(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Content, mergeProps(rest, {
    "data-component": "dropdown-menu-content",
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
function DropdownMenuArrow(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return createComponent(Kobalte.Arrow, mergeProps(rest, {
    "data-slot": "dropdown-menu-arrow",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    }
  }));
}
function DropdownMenuSeparator(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return createComponent(Kobalte.Separator, mergeProps(rest, {
    "data-slot": "dropdown-menu-separator",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    }
  }));
}
function DropdownMenuGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Group, mergeProps(rest, {
    "data-slot": "dropdown-menu-group",
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
function DropdownMenuGroupLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.GroupLabel, mergeProps(rest, {
    "data-slot": "dropdown-menu-group-label",
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
function DropdownMenuItem(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Item, mergeProps(rest, {
    "data-slot": "dropdown-menu-item",
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
function DropdownMenuItemLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.ItemLabel, mergeProps(rest, {
    "data-slot": "dropdown-menu-item-label",
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
function DropdownMenuItemDescription(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.ItemDescription, mergeProps(rest, {
    "data-slot": "dropdown-menu-item-description",
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
function DropdownMenuItemIndicator(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.ItemIndicator, mergeProps(rest, {
    "data-slot": "dropdown-menu-item-indicator",
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
function DropdownMenuRadioGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.RadioGroup, mergeProps(rest, {
    "data-slot": "dropdown-menu-radio-group",
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
function DropdownMenuRadioItem(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.RadioItem, mergeProps(rest, {
    "data-slot": "dropdown-menu-radio-item",
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
function DropdownMenuCheckboxItem(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.CheckboxItem, mergeProps(rest, {
    "data-slot": "dropdown-menu-checkbox-item",
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
function DropdownMenuSub(props) {
  return createComponent(Kobalte.Sub, props);
}
function DropdownMenuSubTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.SubTrigger, mergeProps(rest, {
    "data-slot": "dropdown-menu-sub-trigger",
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
function DropdownMenuSubContent(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.SubContent, mergeProps(rest, {
    "data-component": "dropdown-menu-sub-content",
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
export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Icon: DropdownMenuIcon,
  Portal: DropdownMenuPortal,
  Content: DropdownMenuContent,
  Arrow: DropdownMenuArrow,
  Separator: DropdownMenuSeparator,
  Group: DropdownMenuGroup,
  GroupLabel: DropdownMenuGroupLabel,
  Item: DropdownMenuItem,
  ItemLabel: DropdownMenuItemLabel,
  ItemDescription: DropdownMenuItemDescription,
  ItemIndicator: DropdownMenuItemIndicator,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent
});