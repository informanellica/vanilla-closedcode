/**
 * @file Permission + question prompt widgets for the vanilla TUI (renderer parity
 * phase). These are MODAL, but driven by data state rather than user-opened: when
 * the data layer has a pending permission/question request for the current
 * session, the shell renders one of these over the timeline and routes all keys
 * to it. Replies go back through the data layer (sdk.permission/question.*).
 * Each is { draw(region, ctx), handleKey(name, data) }, headless-testable.
 */
import { createSelectList } from "../runtime/list.js";
import { column } from "../runtime/layout.js";
import { truncate } from "../runtime/text.js";
import { attr, defaultTheme } from "./theme.js";
import { drawRichLine } from "./richtext.js";
import { renderUnifiedDiff } from "./diff.js";
import { langFromPath } from "./syntax.js";

/**
 * Permission prompt widget: Allow once / Allow always / Reject, with the edit
 * diff (or description) shown if present.
 * @param {Object} req - The pending permission request {title, tool, description, metadata:{filepath, diff, description}}.
 * @param {Object} opts - Options.
 * @param {Object} opts.theme - Theme token map (defaults to defaultTheme).
 * @param {Function} opts.now - Clock function passed to the select list.
 * @param {Function} opts.onReply - Called with the chosen value ("once"|"always"|"reject").
 * @returns {Object} The widget {handleKey, draw, kind:"permission"}.
 */
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

  /**
   * Route a key: Escape rejects; everything else goes to the choice list.
   * @param {string} name - Combined key name.
   * @param {Object} data - Key metadata.
   * @returns {boolean} true when the key was consumed.
   */
  function handleKey(name, data) {
    if (name === "ESCAPE") { opts.onReply?.("reject"); return true; }
    return list.handleKey(name, data);
  }
  /**
   * Draw the title, optional filepath, diff/description body, and the choices.
   * @param {Object} region - The drawing region.
   * @returns {void}
   */
  function draw(region) {
    column(region, [
      { size: 1, draw: r => r.line(0, truncate(title, r.width), attr(theme, "warning", { bold: true })) },
      { size: filepath ? 1 : 0, draw: r => r.line(0, truncate(filepath ?? "", r.width), attr(theme, "textMuted")) },
      {
        size: "flex", draw: r => {
          if (diff) {
            const lines = renderUnifiedDiff(diff, r.width, { lang: langFromPath(filepath) });
            const overflow = lines.length > r.height;
            const shown = overflow ? r.height - 1 : lines.length;
            for (let i = 0; i < shown; i++) drawRichLine(r, i, lines[i], theme);
            if (overflow) r.line(r.height - 1, truncate(`… (+${lines.length - shown} more lines — open the file to review)`, r.width), attr(theme, "textMuted"));
            return;
          }
          if (description) r.line(0, truncate(description, r.width), attr(theme, "text"));
        },
      },
      { size: 1, draw: () => {} },
      { size: 3, draw: r => list.draw(r, { attr: attr(theme, "text"), activeAttr: { inverse: true }, marker: "› " }) },
    ]);
  }
  return { handleKey, draw, kind: "permission" };
}

/**
 * Question prompt widget: render the (first) question's text + options as a
 * single-select list.
 * @param {Object} req - The pending question request {questions:[{text, options}], text}.
 * @param {Object} opts - Options.
 * @param {Object} opts.theme - Theme token map (defaults to defaultTheme).
 * @param {Function} opts.now - Clock function passed to the select list.
 * @param {Function} opts.onReply - Called with the answer (nested [[value]]).
 * @param {Function} opts.onReject - Called on Escape.
 * @returns {Object} The widget {handleKey, draw, kind:"question"}.
 */
export function createQuestionPrompt(req = {}, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const question = req.questions?.[0] ?? {};
  const text = question.text ?? req.text ?? "Question";
  const options = (question.options ?? []).map(o => (typeof o === "string" ? { label: o, value: o } : { label: o.label ?? o.value, value: o.value ?? o.label }));
  const list = createSelectList(options, { now: opts.now, onSelect: it => opts.onReply?.([[it.value]]) });

  /**
   * Route a key: Escape rejects; everything else goes to the option list.
   * @param {string} name - Combined key name.
   * @param {Object} data - Key metadata.
   * @returns {boolean} true when the key was consumed.
   */
  function handleKey(name, data) {
    if (name === "ESCAPE") { opts.onReject?.(); return true; }
    return list.handleKey(name, data);
  }
  /**
   * Draw the question text and the option list (or a "(no options)" notice).
   * @param {Object} region - The drawing region.
   * @returns {void}
   */
  function draw(region) {
    column(region, [
      { size: 1, draw: r => r.line(0, truncate(text, r.width), attr(theme, "primary", { bold: true })) },
      { size: 1, draw: () => {} },
      { size: "flex", draw: r => (options.length ? list.draw(r, { attr: attr(theme, "text"), activeAttr: { inverse: true }, marker: "› " }) : r.line(0, "(no options)", attr(theme, "textMuted"))) },
    ]);
  }
  return { handleKey, draw, kind: "question" };
}
