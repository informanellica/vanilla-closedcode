import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { DropdownMenu as Kobalte } from "@kobalte/core/dropdown-menu";
import { splitProps } from "solid-js";
function DropdownMenuRoot(props) {
  return _$createComponent(Kobalte, _$mergeProps(props, {
    "data-component": "dropdown-menu"
  }));
}
function DropdownMenuTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Trigger, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Icon, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Portal, props);
}
function DropdownMenuContent(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Content, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Arrow, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Separator, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Group, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.GroupLabel, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Item, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.ItemLabel, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.ItemDescription, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.ItemIndicator, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.RadioGroup, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.RadioItem, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.CheckboxItem, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Sub, props);
}
function DropdownMenuSubTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.SubTrigger, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.SubContent, _$mergeProps(rest, {
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