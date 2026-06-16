/** @module ToolOutput - Effect Schema definitions for tool-result content (text/file blocks) and structured output. */
export * as ToolOutput from "./tool-output.js";
import { Schema } from "effect";

/** Schema class for a plain-text tool output block. */
export class TextContent extends Schema.Class("Tool.TextContent")({
  type: Schema.Literal("text"),
  text: Schema.String
}) {}

/** Schema class for a file reference tool output block (uri + mime, optional display name). */
export class FileContent extends Schema.Class("Tool.FileContent")({
  type: Schema.Literal("file"),
  uri: Schema.String,
  mime: Schema.String,
  name: Schema.String.pipe(Schema.optional)
}) {}

/**
 * Tagged union of a single tool output content block, discriminated on the `type` field.
 * @type {Object}
 */
export const Content = Schema.Union([TextContent, FileContent]).pipe(Schema.toTaggedUnion("type"));

/**
 * Schema for free-form structured tool output: a record of string keys to arbitrary values.
 * @type {Object}
 */
export const Structured = Schema.Record(Schema.String, Schema.Any);