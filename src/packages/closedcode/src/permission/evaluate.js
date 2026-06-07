import { Wildcard } from "@/util/wildcard.js";
export function evaluate(permission, pattern, ...rulesets) {
  const rules = rulesets.flat();
  const match = rules.findLast(rule => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern));
  return match ?? {
    action: "ask",
    permission,
    pattern: "*"
  };
}