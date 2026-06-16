/**
 * @file Schema and branded newtype for question identifiers (`QuestionID`),
 * with an ascending-id constructor and Zod interop.
 */
import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { Newtype } from "#util/schema.js";
/**
 * Branded newtype for question identifiers.
 */
export class QuestionID extends Newtype()("QuestionID", Schema.String.annotate({
  [ZodOverride]: Identifier.schema("question")
})) {
  /**
   * Mint a new monotonically-ascending QuestionID.
   * @param {string} id - Optional seed/previous id used to derive the next ascending value.
   * @returns {QuestionID} The newly created branded id.
   */
  static ascending(id) {
    return this.make(Identifier.ascending("question", id));
  }
  static zod = zod(this);
}