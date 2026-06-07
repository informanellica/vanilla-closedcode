import { Schema } from "effect";
import { zod } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
export const Layout = Schema.Literals(["auto", "stretch"]).annotate({
  identifier: "LayoutConfig"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export * as ConfigLayout from "./layout.js";