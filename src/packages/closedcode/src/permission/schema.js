import { Schema } from "effect";
import { Identifier } from "@/id/id.js";
import { zod, ZodOverride } from "@/util/effect-zod.js";
import { Newtype } from "@/util/schema.js";
export class PermissionID extends Newtype()("PermissionID", Schema.String.annotate({
  [ZodOverride]: Identifier.schema("permission")
})) {
  static ascending(id) {
    return this.make(Identifier.ascending("permission", id));
  }
  static zod = zod(this);
}