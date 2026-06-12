import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { Newtype } from "#util/schema.js";
export class QuestionID extends Newtype()("QuestionID", Schema.String.annotate({
  [ZodOverride]: Identifier.schema("question")
})) {
  static ascending(id) {
    return this.make(Identifier.ascending("question", id));
  }
  static zod = zod(this);
}