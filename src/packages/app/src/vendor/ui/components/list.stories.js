import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<button type=button data-slot=list-item>Add item`),
  _tmpl$2 = /*#__PURE__*/_$template(`<button type=button>Action`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div style="border:1px solid var(--border-weak);border-radius:6px;margin:4px 0">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<strong>`);

import * as mod from "./list.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Filterable list with keyboard navigation and optional search input.

Use within panels or popovers where keyboard navigation is expected.

### API
- Required: \`items\` and \`key\`.
- Required: \`children\` render function for items.
- Optional: \`search\`, \`filterKeys\`, \`groupBy\`, \`onSelect\`, \`onKeyEvent\`.

### Variants and states
- Optional search bar and group headers.

### Behavior
- Uses fuzzy search when \`search\` is enabled.
- Keyboard navigation via arrow keys; Enter selects.

### Accessibility
- TODO: confirm ARIA roles for list items and search input.

### Theming/tokens
- Uses \`data-component="list"\` and data slots for structure.

`;
const story = create({
  title: "UI/List",
  mod,
  args: {
    items: ["One", "Two", "Three", "Four"],
    key: x => x,
    children: x => x,
    search: true
  }
});
export default {
  title: "UI/List",
  id: "components-list",
  component: story.meta.component,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  }
};
export const Basic = story.Basic;
export const Grouped = {
  render: () => {
    const items = [{
      id: "a1",
      title: "Alpha",
      group: "Group A"
    }, {
      id: "a2",
      title: "Bravo",
      group: "Group A"
    }, {
      id: "b1",
      title: "Delta",
      group: "Group B"
    }];
    return _$createComponent(mod.List, {
      items: items,
      key: item => item.id,
      groupBy: item => item.group,
      search: true,
      children: item => item.title
    });
  }
};
export const Empty = {
  render: () => _$createComponent(mod.List, {
    items: [],
    key: item => item,
    search: true,
    children: item => item
  })
};
export const WithAdd = {
  render: () => _$createComponent(mod.List, {
    items: ["One", "Two"],
    key: item => item,
    search: true,
    add: {
      render: () => _tmpl$()
    },
    children: item => item
  })
};
export const Divider = {
  render: () => _$createComponent(mod.List, {
    items: ["One", "Two", "Three"],
    key: item => item,
    divider: true,
    children: item => item
  })
};
export const ActiveIcon = {
  render: () => _$createComponent(mod.List, {
    items: ["Alpha", "Beta", "Gamma"],
    key: item => item,
    activeIcon: "chevron-right",
    children: item => item
  })
};
export const NoSearch = {
  render: () => _$createComponent(mod.List, {
    items: ["One", "Two", "Three"],
    key: item => item,
    search: false,
    children: item => item
  })
};
export const SearchOptions = {
  render: () => _$createComponent(mod.List, {
    items: ["Apple", "Banana", "Cherry"],
    key: item => item,
    get search() {
      return {
        placeholder: "Filter...",
        hideIcon: true,
        action: _tmpl$2()
      };
    },
    children: item => item
  })
};
export const ItemWrapper = {
  render: () => _$createComponent(mod.List, {
    items: ["One", "Two", "Three"],
    key: item => item,
    itemWrapper: (item, node) => (() => {
      var _el$3 = _tmpl$3();
      _$insert(_el$3, node);
      return _el$3;
    })(),
    children: item => item
  })
};
export const GroupHeader = {
  render: () => {
    const items = [{
      id: "a1",
      title: "Alpha",
      group: "Group A"
    }, {
      id: "b1",
      title: "Beta",
      group: "Group B"
    }];
    return _$createComponent(mod.List, {
      items: items,
      key: item => item.id,
      groupBy: item => item.group,
      groupHeader: group => (() => {
        var _el$4 = _tmpl$4();
        _$insert(_el$4, () => group.category);
        return _el$4;
      })(),
      children: item => item.title
    });
  }
};