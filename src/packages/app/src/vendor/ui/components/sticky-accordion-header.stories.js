import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style="color:var(--text-weak);padding:8px 0">Accordion content.`);
import { Accordion } from "./accordion.js";
import * as mod from "./sticky-accordion-header.js";
const docs = `### Overview
Sticky accordion header wrapper for persistent section labels.

Use only inside \`Accordion.Item\` with \`Accordion.Trigger\`.

### API
- Accepts standard header props and children.

### Variants and states
- Inherits accordion states.

### Behavior
- Renders inside an Accordion item header.

### Accessibility
- TODO: confirm semantics from Accordion.Header usage.

### Theming/tokens
- Uses \`data-component="sticky-accordion-header"\`.

`;
export default {
  title: "UI/StickyAccordionHeader",
  id: "components-sticky-accordion-header",
  component: mod.StickyAccordionHeader,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  }
};
export const Basic = {
  render: () => _$createComponent(Accordion, {
    value: "first",
    get children() {
      return _$createComponent(Accordion.Item, {
        value: "first",
        get children() {
          return [_$createComponent(mod.StickyAccordionHeader, {
            get children() {
              return _$createComponent(Accordion.Trigger, {
                children: "Sticky header"
              });
            }
          }), _$createComponent(Accordion.Content, {
            get children() {
              return _tmpl$();
            }
          })];
        }
      });
    }
  })
};