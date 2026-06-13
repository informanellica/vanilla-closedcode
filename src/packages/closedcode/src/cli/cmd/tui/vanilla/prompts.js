// Permission + question prompt widgets for the vanilla TUI (renderer parity
// phase). These are MODAL, but driven by data state rather than user-opened: when
// the data layer has a pending permission/question request for the current
// session, the shell renders one of these over the timeline and routes all keys
// to it. Replies go back through the data layer (sdk.permission/question.*).
// Each is { draw(region, ctx), handleKey(name, data) }, headless-testable.
import { createSelectList } from "../runtime/list.js";
import { column } from "../runtime/layout.js";
import { truncate } from "../runtime/text.js";
import { attr, defaultTheme } from "./theme.js";
import { drawRichLine } from "./richtext.js";
import { renderUnifiedDiff } from "./diff.js";

// Permission: Allow once / Allow always / Reject, with the edit diff if present.
export function createPermissionPrompt(req = {}, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const choices = [
    { label: "Allow once", value: "once" },
    { label: "Allow always", value: "always" },
    { label: "Reject", value: "reject" },
  ];
  const list = createSelectList(choices, { now: opts.now, onSelect: it => opts.onReply?.(it.value) });
  const title = req.title ?? `Permission required: ${req.tool ?? "tool"}`;
  const filepath = req.metadata?.filepath;
  const diff = req.metadata?.diff;
  const description = req.description ?? req.metadata?.description;

  function handleKey(name, data) {
    if (name === "ESCAPE") { opts.onReply?.("reject"); return true; }
    return list.handleKey(name, data);
  }
  function draw(region) {
    column(region, [
      { size: 1, draw: r => r.line(0, truncate(title, r.width), attr(theme, "warning", { bold: true })) },
      { size: filepath ? 1 : 0, draw: r => r.line(0, truncate(filepath ?? "", r.width), attr(theme, "textMuted")) },
      {
        size: "flex", draw: r => {
          if (diff) { const lines = renderUnifiedDiff(diff, r.width); for (let i = 0; i < r.height && i < lines.length; i++) drawRichLine(r, i, lines[i], theme); return; }
          if (description) r.line(0, truncate(description, r.width), attr(theme, "text"));
        },
      },
      { size: 1, draw: () => {} },
      { size: 3, draw: r => list.draw(r, { attr: attr(theme, "text"), activeAttr: { inverse: true }, marker: "› " }) },
    ]);
  }
  return { handleKey, draw, kind: "permission" };
}

// Question: render the (first) question's text + options as a single-select.
export function createQuestionPrompt(req = {}, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const question = req.questions?.[0] ?? {};
  const text = question.text ?? req.text ?? "Question";
  const options = (question.options ?? []).map(o => (typeof o === "string" ? { label: o, value: o } : { label: o.label ?? o.value, value: o.value ?? o.label }));
  const list = createSelectList(options, { now: opts.now, onSelect: it => opts.onReply?.([[it.value]]) });

  function handleKey(name, data) {
    if (name === "ESCAPE") { opts.onReject?.(); return true; }
    return list.handleKey(name, data);
  }
  function draw(region) {
    column(region, [
      { size: 1, draw: r => r.line(0, truncate(text, r.width), attr(theme, "primary", { bold: true })) },
      { size: 1, draw: () => {} },
      { size: "flex", draw: r => (options.length ? list.draw(r, { attr: attr(theme, "text"), activeAttr: { inverse: true }, marker: "› " }) : r.line(0, "(no options)", attr(theme, "textMuted"))) },
    ]);
  }
  return { handleKey, draw, kind: "question" };
}
