import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style="position:relative;height:160px;padding:16px 16px 16px 40px;border:1px solid var(--border-weak);border-radius:8px;font-family:var(--font-family-mono);font-size:12px;color:var(--text-weak)"><div>12 | const total = sum(values)</div><div>13 | return total / values.length`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style="position:relative;height:220px;padding:16px 16px 16px 40px;border:1px solid var(--border-weak);border-radius:8px;font-family:var(--font-family-mono);font-size:12px;color:var(--text-weak)"><div>40 | if (values.length === 0) return 0`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=line-comment-content>Anchor content`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div style="position:relative;height:120px;padding:16px 16px 16px 40px;border:1px solid var(--border-weak);border-radius:8px;font-family:var(--font-family-mono);font-size:12px;color:var(--text-weak)"><div>20 | const ready = true`);
import { createSignal } from "../../../lib/reactivity.js";
import * as mod from "./line-comment.js";
const docs = `### Overview
Inline comment anchor and editor for code review or annotation flows.

Pair with \`Diff\` or \`Code\` to align comments to lines.

### API
- \`LineCommentAnchor\`: position with \`top\`, control \`open\`, render custom children.
- \`LineComment\`: convenience wrapper for displaying comment + selection label.
- \`LineCommentEditor\`: controlled textarea with submit/cancel handlers.

### Variants and states
- Default display and editor display variants.

### Behavior
- Anchor positions relative to a containing element.
- Editor submits on Enter (Shift+Enter for newline).

### Accessibility
- TODO: confirm ARIA labeling for comment button and editor textarea.

### Theming/tokens
- Uses \`data-component="line-comment"\` and related slots.

`;
export default {
  title: "UI/LineComment",
  id: "components-line-comment",
  component: mod.LineComment,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  }
};
export const Default = {
  render: () => (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling;
    _$insert(_el$, _$createComponent(mod.LineComment, {
      open: true,
      top: 18,
      comment: "Consider guarding against empty arrays.",
      selection: "L12-L13"
    }), null);
    return _el$;
  })()
};
export const Editor = {
  render: () => {
    const [value, setValue] = createSignal("Add context for this change.");
    return (() => {
      var _el$4 = _tmpl$2(),
        _el$5 = _el$4.firstChild;
      _$insert(_el$4, _$createComponent(mod.LineCommentEditor, {
        top: 24,
        get value() {
          return value();
        },
        selection: "L40",
        onInput: setValue,
        onCancel: () => setValue(""),
        onSubmit: next => setValue(next)
      }), null);
      return _el$4;
    })();
  }
};
export const AnchorOnly = {
  render: () => (() => {
    var _el$6 = _tmpl$4(),
      _el$7 = _el$6.firstChild;
    _$insert(_el$6, _$createComponent(mod.LineCommentAnchor, {
      top: 18,
      open: false,
      get children() {
        return _tmpl$3();
      }
    }), null);
    return _el$6;
  })()
};