/**
 * @file Validates a session id supplied to the TUI before launch: checks the id
 * format and confirms the session exists on the backend, throwing on failure.
 */
import { createClosedcodeClient } from "sdk/v2";
import { SessionID } from "#session/schema.js";
/**
 * Validate a session id (if provided) against the schema and the backend.
 * Resolves immediately when no sessionID is given.
 * @param {Object} input - `{sessionID, url, directory, fetch, headers}`: the session id to check plus the SDK client connection options.
 * @returns {Promise<void>} Resolves if valid/absent; rejects if the id is malformed or the session cannot be fetched.
 */
export async function validateSession(input) {
  if (!input.sessionID) return;
  const result = SessionID.zod.safeParse(input.sessionID);
  if (!result.success) {
    throw new Error(`Invalid session ID: ${result.error.issues.at(0)?.message ?? "unknown error"}`);
  }
  await createClosedcodeClient({
    baseUrl: input.url,
    directory: input.directory,
    fetch: input.fetch,
    headers: input.headers
  }).session.get({
    sessionID: result.data
  }, {
    throwOnError: true
  });
}