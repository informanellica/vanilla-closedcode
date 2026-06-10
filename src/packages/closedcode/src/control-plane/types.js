import { Schema } from "effect";
import { ProjectID } from "#project/schema.js";
import { WorkspaceID } from "./schema.js";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
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
export const WorkspaceAdapterEntry = Schema.Struct({
  type: Schema.String,
  name: Schema.String,
  description: Schema.String
}).pipe(withStatics(s => ({
  zod: zod(s)
})));