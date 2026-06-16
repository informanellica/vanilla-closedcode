/** @module SessionPrompt - Effect Schema classes describing a user prompt and its file/agent attachments. */
import * as Schema from "effect/Schema";

/** Schema class for a text span source within a prompt: a [start, end) range plus the referenced text. */
export class Source extends Schema.Class("Prompt.Source")({
  start: Schema.Finite,
  end: Schema.Finite,
  text: Schema.String
}) {}

/** Schema class for a file attachment on a prompt (uri + mime, with optional name/description/source span). */
export class FileAttachment extends Schema.Class("Prompt.FileAttachment")({
  uri: Schema.String,
  mime: Schema.String,
  name: Schema.String.pipe(Schema.optional),
  description: Schema.String.pipe(Schema.optional),
  source: Source.pipe(Schema.optional)
}) {
  /**
   * Construct a FileAttachment instance from a plain input object.
   * @param {Object} input - Attachment fields: uri, mime, and optional name, description, source.
   * @returns {FileAttachment} The constructed attachment instance.
   */
  static create(input) {
    return new FileAttachment({
      uri: input.uri,
      mime: input.mime,
      name: input.name,
      description: input.description,
      source: input.source
    });
  }
}

/** Schema class for an agent attachment on a prompt (agent name plus optional source span). */
export class AgentAttachment extends Schema.Class("Prompt.AgentAttachment")({
  name: Schema.String,
  source: Source.pipe(Schema.optional)
}) {}

/** Schema class for a full user prompt: text plus optional file and agent attachments. */
export class Prompt extends Schema.Class("Prompt")({
  text: Schema.String,
  files: Schema.Array(FileAttachment).pipe(Schema.optional),
  agents: Schema.Array(AgentAttachment).pipe(Schema.optional)
}) {}