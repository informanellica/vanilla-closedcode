/** @file Schemas describing a workspace's persisted info and an adapter registry entry. */
import { Schema } from "effect";
import { ProjectID } from "#project/schema.js";
import { WorkspaceID } from "./schema.js";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
/**
 * Schema for a workspace's persisted information: its id, adapter type, name,
 * optional branch/directory, free-form extra data and owning project id.
 * Carries a derived `zod` static for zod-based validation.
 * @type {Schema.Struct}
 */
export const WorkspaceInfo = Schema.Struct({
  id: WorkspaceID,
  type: Schema.String,
  name: Schema.String,
  branch: Schema.NullOr(Schema.String),
  directory: Schema.NullOr(Schema.String),
  extra: Schema.NullOr(Schema.Unknown),
  projectID: ProjectID
}).annotate({
  identifier: "Workspace"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Schema for a workspace adapter registry entry: its type key, display name and description.
 * Carries a derived `zod` static for zod-based validation.
 * @type {Schema.Struct}
 */
export const WorkspaceAdapterEntry = Schema.Struct({
  type: Schema.String,
  name: Schema.String,
  description: Schema.String
}).pipe(withStatics(s => ({
  zod: zod(s)
})));