/** @file Defines the PermissionID newtype (a branded string identifier for permission records). */

import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { Newtype } from "#util/schema.js";
/** Branded string identifier for a permission record. */
export class PermissionID extends Newtype()("PermissionID", Schema.String.annotate({
  [ZodOverride]: Identifier.schema("permission")
})) {
  /**
   * Generate a new monotonically increasing PermissionID.
   * @param {string} id - Optional seed/previous id used to derive the next ascending value.
   * @returns {PermissionID} A new ascending permission identifier.
   */
  static ascending(id) {
    return this.make(Identifier.ascending("permission", id));
  }
  static zod = zod(this);
}