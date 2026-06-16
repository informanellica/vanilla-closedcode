/** @file Config schema for the (deprecated) TUI layout mode. */
import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
/**
 * Schema for the layout config value, one of `"auto"` or `"stretch"`.
 * Exposes a derived `.zod` compatibility schema. (Deprecated: layout is always stretch.)
 */
export const Layout = Schema.Literals(["auto", "stretch"]).annotate({
  identifier: "LayoutConfig"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export * as ConfigLayout from "./layout.js";