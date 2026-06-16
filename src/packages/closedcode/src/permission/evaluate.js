/** @file Evaluates a permission/pattern pair against one or more permission rulesets to decide the resulting action. */

import { Wildcard } from "#util/wildcard.js";
/**
 * Find the action for a permission/pattern pair by matching against rulesets.
 *
 * Flattens all provided rulesets and returns the last rule whose permission
 * and pattern both wildcard-match the request. Defaults to an "ask" rule when
 * no rule matches.
 * @param {string} permission - The permission key being checked (e.g. a tool name).
 * @param {string} pattern - The concrete pattern/argument being checked.
 * @param {...Array} rulesets - One or more rule arrays; each rule has {permission, pattern, action}.
 * @returns {Object} The matched rule, or a default {action: "ask", permission, pattern: "*"}.
 */
export function evaluate(permission, pattern, ...rulesets) {
  const rules = rulesets.flat();
  const match = rules.findLast(rule => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern));
  return match ?? {
    action: "ask",
    permission,
    pattern: "*"
  };
}