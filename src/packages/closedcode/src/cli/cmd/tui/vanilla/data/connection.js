/**
 * @file Real-backend connection for the vanilla TUI (SDK-integration phase). Builds
 * the pieces createDataLayer() needs from the tui(input) launch payload: the HTTP/SSE
 * client (createClosedcodeClient from sdk/v2 — pure fetch+SSE, no @opentui/solid in
 * its graph), the optional in-process event source, and the real monotonic ID minters
 * (Identifier.ascending, same as MessageID/PartID). Kept separate from data/index.js
 * so the data layer itself stays mock-injectable.
 */
// Real-backend connection for the vanilla TUI (SDK-integration phase). Builds
// the pieces createDataLayer() needs from the tui(input) launch payload:
// the HTTP/SSE client (createClosedcodeClient from sdk/v2 — pure fetch+SSE, no
// @opentui/solid in its graph), the optional in-process event source, and the
// real monotonic ID minters (Identifier.ascending, same as MessageID/PartID).
// Kept separate from data/index.js so the data layer itself stays mock-injectable.
import { createClosedcodeClient } from "sdk/v2";
import { ascending } from "../../../../../id/id.js";

/**
 * Build the real backend connection (SDK client, event source, ID minters) for the
 * data layer from the TUI launch payload.
 * @param {Object} input - `{url, directory, fetch, headers, events}`: backend base URL, working directory, optional fetch override, extra headers, and optional in-process event source.
 * @returns {Object} `{sdk, events, directory, ids}` where ids.message/ids.part mint monotonic ascending identifiers.
 */
export function createConnection(input = {}) {
  const sdk = createClosedcodeClient({
    baseUrl: input.url,
    directory: input.directory,
    fetch: input.fetch,
    headers: input.headers,
  });
  return {
    sdk,
    events: input.events, // in-process source ({subscribe}) or undefined -> SSE
    directory: input.directory,
    ids: {
      message: id => ascending("message", id),
      part: id => ascending("part", id),
    },
  };
}
