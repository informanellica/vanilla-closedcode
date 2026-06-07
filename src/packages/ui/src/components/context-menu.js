import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { ContextMenu as Kobalte } from "@kobalte/core/context-menu";
import { splitProps } from "solid-js";
function ContextMenuRoot(props) {
  return _$createComponent(Kobalte, _$mergeProps(props, {
    "data-component": "context-menu"
  }));
}
function ContextMenuTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Trigger, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Icon, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Portal, props);
}
function ContextMenuContent(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Content, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Arrow, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Separator, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Group, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.GroupLabel, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Item, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.ItemLabel, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.ItemDescription, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.ItemIndicator, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.RadioGroup, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.RadioItem, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.CheckboxItem, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.Sub, props);
}
function ContextMenuSubTrigger(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.SubTrigger, _$mergeProps(rest, {
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
  return _$createComponent(Kobalte.SubContent, _$mergeProps(rest, {
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