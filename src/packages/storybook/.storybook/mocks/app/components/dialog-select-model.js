import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { splitProps } from "solid-js";
export function ModelSelectorPopover(props) {
  const [local] = splitProps(props, ["triggerAs", "triggerProps", "children"]);
  const Trigger = local.triggerAs;
  return _$createComponent(Trigger, _$mergeProps(() => local.triggerProps ?? {}, {
    get children() {
      return local.children;
    }
  }));
}