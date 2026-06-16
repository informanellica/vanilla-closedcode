/** @file CLI `export` command: dumps a session (info + messages) as JSON, optionally redacting sensitive data. */
import { Session } from "#session/session.js";
import { SessionID } from "../../session/schema.js";
import { effectCmd, fail } from "../effect-cmd.js";
import { UI } from "../ui.js";
import * as prompts from "@clack/prompts";
import { EOL } from "os";
import { Effect } from "effect";
/**
 * Replace a non-empty string value with a redaction placeholder.
 * @param {string} kind - Category label for the redacted value (e.g. "text", "file-path").
 * @param {string} id - Identifier (typically part/message id) used to scope the placeholder.
 * @param {string} value - The original string value.
 * @returns {string} A `[redacted:kind:id]` placeholder when non-empty, otherwise the original value.
 */
function redact(kind, id, value) {
  return value.trim() ? `[redacted:${kind}:${id}]` : value;
}
/**
 * Replace a non-empty object payload with a redaction marker object.
 * @param {string} kind - Category label for the redacted payload.
 * @param {string} id - Identifier used to scope the marker.
 * @param {Object} value - The original object payload (may be null/undefined).
 * @returns {Object} A `{redacted: "kind:id"}` marker when the object has keys, otherwise the original value.
 */
function data(kind, id, value) {
  if (!value) return value;
  return Object.keys(value).length ? {
    redacted: `${kind}:${id}`
  } : value;
}
/**
 * Redact the `.value` text of a file-text span while keeping its other fields.
 * @param {string} id - Identifier used to scope the redaction.
 * @param {Object} value - Span object containing a `value` text field.
 * @returns {Object} The span with its text value redacted.
 */
function span(id, value) {
  return {
    ...value,
    value: redact("file-text", id, value.value)
  };
}
/**
 * Redact the file path and patch text of each diff entry.
 * @param {string} kind - Category prefix for the redacted diff fields.
 * @param {Array} diffs - List of diff entries each with `file` and `patch` fields.
 * @returns {Array} The diffs with redacted `file` and `patch` fields (or undefined if no diffs).
 */
function diff(kind, diffs) {
  return diffs?.map((item, i) => ({
    ...item,
    file: redact(`${kind}-file`, String(i), item.file),
    patch: redact(`${kind}-patch`, String(i), item.patch)
  }));
}
/**
 * Redact the source descriptor of a file part, handling symbol, resource, and plain-file sources.
 * @param {Object} part - A file part with an optional `source` descriptor and an `id`.
 * @returns {Object} The redacted source descriptor (or the original falsy source).
 */
function source(part) {
  if (!part.source) return part.source;
  if (part.source.type === "symbol") {
    return {
      ...part.source,
      path: redact("file-path", part.id, part.source.path),
      name: redact("file-symbol", part.id, part.source.name),
      text: span(part.id, part.source.text)
    };
  }
  if (part.source.type === "resource") {
    return {
      ...part.source,
      clientName: redact("file-client", part.id, part.source.clientName),
      uri: redact("file-uri", part.id, part.source.uri),
      text: span(part.id, part.source.text)
    };
  }
  return {
    ...part.source,
    path: redact("file-path", part.id, part.source.path),
    text: span(part.id, part.source.text)
  };
}
/**
 * Redact the URL, filename, and source of a file part.
 * @param {Object} part - A file part with `url`, optional `filename`, `source`, and `id`.
 * @returns {Object} The part with sensitive file fields redacted.
 */
function filepart(part) {
  return {
    ...part,
    url: redact("file-url", part.id, part.url),
    filename: part.filename === undefined ? undefined : redact("file-name", part.id, part.filename),
    source: source(part)
  };
}
/**
 * Redact a single message part according to its `type` (text, reasoning, file, subtask, tool, patch, snapshot, step-*, agent).
 * @param {Object} part - A message part with a `type` discriminator and an `id`.
 * @returns {Object} The part with its type-specific sensitive fields redacted (unknown types returned unchanged).
 */
function part(part) {
  switch (part.type) {
    case "text":
      return {
        ...part,
        text: redact("text", part.id, part.text),
        metadata: data("text-metadata", part.id, part.metadata)
      };
    case "reasoning":
      return {
        ...part,
        text: redact("reasoning", part.id, part.text),
        metadata: data("reasoning-metadata", part.id, part.metadata)
      };
    case "file":
      return filepart(part);
    case "subtask":
      return {
        ...part,
        prompt: redact("subtask-prompt", part.id, part.prompt),
        description: redact("subtask-description", part.id, part.description),
        command: part.command === undefined ? undefined : redact("subtask-command", part.id, part.command)
      };
    case "tool":
      return {
        ...part,
        metadata: data("tool-metadata", part.id, part.metadata),
        state: part.state.status === "pending" ? {
          ...part.state,
          input: data("tool-input", part.id, part.state.input) ?? part.state.input,
          raw: redact("tool-raw", part.id, part.state.raw)
        } : part.state.status === "running" ? {
          ...part.state,
          input: data("tool-input", part.id, part.state.input) ?? part.state.input,
          title: part.state.title === undefined ? undefined : redact("tool-title", part.id, part.state.title),
          metadata: data("tool-state-metadata", part.id, part.state.metadata)
        } : part.state.status === "completed" ? {
          ...part.state,
          input: data("tool-input", part.id, part.state.input) ?? part.state.input,
          output: redact("tool-output", part.id, part.state.output),
          title: redact("tool-title", part.id, part.state.title),
          metadata: data("tool-state-metadata", part.id, part.state.metadata) ?? part.state.metadata,
          attachments: part.state.attachments?.map(filepart)
        } : {
          ...part.state,
          input: data("tool-input", part.id, part.state.input) ?? part.state.input,
          metadata: data("tool-state-metadata", part.id, part.state.metadata)
        }
      };
    case "patch":
      return {
        ...part,
        hash: redact("patch", part.id, part.hash),
        files: part.files.map((item, i) => redact("patch-file", `${part.id}-${i}`, item))
      };
    case "snapshot":
      return {
        ...part,
        snapshot: redact("snapshot", part.id, part.snapshot)
      };
    case "step-start":
      return {
        ...part,
        snapshot: part.snapshot === undefined ? undefined : redact("snapshot", part.id, part.snapshot)
      };
    case "step-finish":
      return {
        ...part,
        snapshot: part.snapshot === undefined ? undefined : redact("snapshot", part.id, part.snapshot)
      };
    case "agent":
      return {
        ...part,
        source: !part.source ? part.source : {
          ...part.source,
          value: redact("agent-source", part.id, part.source.value)
        }
      };
    default:
      return part;
  }
}
/** Alias to the `part` redactor, used inside `sanitize` where the parameter named `part` would shadow it. */
const partFn = part;
/**
 * Redact all sensitive fields of an exported session: info (title, directory, summary, revert) and every message/part.
 * @param {Object} data - Export payload `{info, messages}` for a session.
 * @returns {Object} A deep copy of the export payload with sensitive fields redacted.
 */
function sanitize(data) {
  return {
    info: {
      ...data.info,
      title: redact("session-title", data.info.id, data.info.title),
      directory: redact("session-directory", data.info.id, data.info.directory),
      summary: !data.info.summary ? data.info.summary : {
        ...data.info.summary,
        diffs: diff("session-diff", data.info.summary.diffs)
      },
      revert: !data.info.revert ? data.info.revert : {
        ...data.info.revert,
        snapshot: data.info.revert.snapshot === undefined ? undefined : redact("revert-snapshot", data.info.id, data.info.revert.snapshot),
        diff: data.info.revert.diff === undefined ? undefined : redact("revert-diff", data.info.id, data.info.revert.diff)
      }
    },
    messages: data.messages.map(msg => ({
      info: msg.info.role === "user" ? {
        ...msg.info,
        system: msg.info.system === undefined ? undefined : redact("system", msg.info.id, msg.info.system),
        summary: !msg.info.summary ? msg.info.summary : {
          ...msg.info.summary,
          title: msg.info.summary.title === undefined ? undefined : redact("summary-title", msg.info.id, msg.info.summary.title),
          body: msg.info.summary.body === undefined ? undefined : redact("summary-body", msg.info.id, msg.info.summary.body),
          diffs: diff("message-diff", msg.info.summary.diffs)
        }
      } : {
        ...msg.info,
        path: {
          cwd: redact("cwd", msg.info.id, msg.info.path.cwd),
          root: redact("root", msg.info.id, msg.info.path.root)
        }
      },
      parts: msg.parts.map(partFn)
    }))
  };
}
/** `export [sessionID]` command definition: exports a session as JSON to stdout, with an optional `--sanitize` flag. */
export const ExportCommand = effectCmd({
  command: "export [sessionID]",
  describe: "export session data as JSON",
  builder: yargs => yargs.positional("sessionID", {
    describe: "session id to export",
    type: "string"
  }).option("sanitize", {
    describe: "redact sensitive transcript and file data",
    type: "boolean"
  }),
  handler: Effect.fn("Cli.export")(function* (args) {
    return yield* run(args);
  })
});
/**
 * Resolve the target session (prompting for selection when none is given), load its messages, and print JSON.
 * @param {Object} args - Parsed CLI args with optional `sessionID` and `sanitize` boolean.
 * @returns {Effect} An Effect that writes the (optionally sanitized) session JSON to stdout.
 */
const run = Effect.fn("Cli.export.body")(function* (args) {
  const svc = yield* Session.Service;
  let sessionID = args.sessionID ? SessionID.make(args.sessionID) : undefined;
  process.stderr.write(`Exporting session: ${sessionID ?? "latest"}\n`);
  if (!sessionID) {
    UI.empty();
    prompts.intro("Export session", {
      output: process.stderr
    });
    const sessions = yield* svc.list();
    if (sessions.length === 0) {
      prompts.log.error("No sessions found", {
        output: process.stderr
      });
      prompts.outro("Done", {
        output: process.stderr
      });
      return;
    }
    sessions.sort((a, b) => b.time.updated - a.time.updated);
    const selectedSession = yield* Effect.promise(() => prompts.autocomplete({
      message: "Select session to export",
      maxItems: 10,
      options: sessions.map(session => ({
        label: session.title,
        value: session.id,
        hint: `${new Date(session.time.updated).toLocaleString()} • ${session.id.slice(-8)}`
      })),
      output: process.stderr
    }));
    if (prompts.isCancel(selectedSession)) {
      return yield* Effect.die(new UI.CancelledError());
    }
    sessionID = selectedSession;
    prompts.outro("Exporting session...", {
      output: process.stderr
    });
  }

  // Match legacy try/catch — catches both typed failures and defects
  // (Session.Service.get throws NotFoundError as a defect, not a typed E).
  return yield* Effect.gen(function* () {
    const sessionInfo = yield* svc.get(sessionID);
    const messages = yield* svc.messages({
      sessionID: sessionInfo.id
    });
    const exportData = {
      info: sessionInfo,
      messages
    };
    process.stdout.write(JSON.stringify(args.sanitize ? sanitize(exportData) : exportData, null, 2));
    process.stdout.write(EOL);
  }).pipe(Effect.catchCause(() => fail(`Session not found: ${sessionID}`)));
});