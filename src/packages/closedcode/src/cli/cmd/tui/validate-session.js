import { createOpencodeClient } from "sdk/v2";
import { SessionID } from "#session/schema.js";
export async function validateSession(input) {
  if (!input.sessionID) return;
  const result = SessionID.zod.safeParse(input.sessionID);
  if (!result.success) {
    throw new Error(`Invalid session ID: ${result.error.issues.at(0)?.message ?? "unknown error"}`);
  }
  await createOpencodeClient({
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