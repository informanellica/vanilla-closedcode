import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill, minmax(120px, 1fr))">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style=display:flex;gap:8px;align-items:center><div style=font-size:12px;color:var(--text-weak)>`);
import * as mod from "./file-icon.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
File and folder icon renderer based on file name and extension.

Use in file trees and lists.

### API
- Required: \`node\` with \`path\` and \`type\`.
- Optional: \`expanded\` (for folders), \`mono\` for monochrome rendering.

### Variants and states
- Folder vs file icons; expanded folder variant.

### Behavior
- Maps file names and extensions to sprite icons.

### Accessibility
- Provide adjacent text labels for filenames; icons are decorative.

### Theming/tokens
- Uses \`data-component="file-icon"\` and sprite-based styling.

`;
const story = create({
  title: "UI/FileIcon",
  mod,
  args: {
    node: {
      path: "package.json",
      type: "file"
    },
    mono: true
  }
});
export default {
  title: "UI/FileIcon",
  id: "components-file-icon",
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
export const Folder = {
  args: {
    node: {
      path: "src",
      type: "directory"
    },
    expanded: true,
    mono: false
  }
};
export const Samples = {
  render: () => {
    const items = [{
      path: "README.md",
      type: "file"
    }, {
      path: "package.json",
      type: "file"
    }, {
      path: "tsconfig.json",
      type: "file"
    }, {
      path: "index.ts",
      type: "file"
    }, {
      path: "styles.css",
      type: "file"
    }, {
      path: "logo.svg",
      type: "file"
    }, {
      path: "photo.png",
      type: "file"
    }, {
      path: "Dockerfile",
      type: "file"
    }, {
      path: ".env",
      type: "file"
    }, {
      path: "src",
      type: "directory"
    }, {
      path: "public",
      type: "directory"
    }];
    return (() => {
      var _el$ = _tmpl$();
      _$insert(_el$, () => items.map(node => (() => {
        var _el$2 = _tmpl$2(),
          _el$3 = _el$2.firstChild;
        _$insert(_el$2, _$createComponent(mod.FileIcon, {
          get node() {
            return {
              path: node.path,
              type: node.type
            };
          },
          mono: false
        }), _el$3);
        _$insert(_el$3, () => node.path);
        return _el$2;
      })()));
      return _el$;
    })();
  }
};