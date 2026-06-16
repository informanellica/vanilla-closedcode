/** @file Client for the Exa MCP HTTP endpoint: builds JSON-RPC tools/call requests and parses the SSE response into the first text content block. */
import { Effect, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
/** Exa MCP endpoint URL, with the EXA_API_KEY query param appended when that env var is set. */
const URL = process.env.EXA_API_KEY ? `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(process.env.EXA_API_KEY)}` : "https://mcp.exa.ai/mcp";
/** Schema for the relevant slice of an MCP tools/call result: `result.content[]` items with `type` and `text`. */
const McpResult = Schema.Struct({
  result: Schema.Struct({
    content: Schema.Array(Schema.Struct({
      type: Schema.String,
      text: Schema.String
    }))
  })
});
/** Decoder that parses a JSON string into an {@link McpResult}. */
const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(McpResult));
/**
 * Parses a Server-Sent Events response body, decoding each `data:` line as an MCP result and returning
 * the first non-empty text content found.
 * @param {string} body - The raw SSE response body.
 * @returns {Effect} An Effect resolving to the first content text string, or undefined if none is found.
 */
const parseSse = Effect.fn("McpExa.parseSse")(function* (body) {
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = yield* decode(line.substring(6));
    if (data.result.content[0]?.text) return data.result.content[0].text;
  }
  return undefined;
});
/** Schema for the arguments passed to the Exa search tool: query, search type, result count, livecrawl mode, and optional context size cap. */
export const SearchArgs = Schema.Struct({
  query: Schema.String,
  type: Schema.String,
  numResults: Schema.Number,
  livecrawl: Schema.String,
  contextMaxCharacters: Schema.optional(Schema.Number)
});
/**
 * Builds the JSON-RPC `tools/call` request schema for a given arguments schema.
 * @param {Object} args - The Effect Schema describing the tool's `arguments` payload.
 * @returns {Object} A Schema.Struct describing the full JSON-RPC request envelope.
 */
const McpRequest = args => Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(1),
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({
    name: Schema.String,
    arguments: args
  })
});
/**
 * Invokes a named Exa MCP tool over HTTP and returns its first text content block.
 * @param {Object} http - The Effect HttpClient used to send the request.
 * @param {string} tool - The MCP tool name to call.
 * @param {Object} args - The Effect Schema describing the tool's arguments (passed to {@link McpRequest}).
 * @param {Object} value - The concrete argument values matching `args`.
 * @param {*} timeout - Duration after which the request fails with a timeout error.
 * @returns {Effect} An Effect resolving to the response text, or undefined if no content was returned.
 */
export const call = (http, tool, args, value, timeout) => Effect.gen(function* () {
  const request = yield* HttpClientRequest.post(URL).pipe(HttpClientRequest.accept("application/json, text/event-stream"), HttpClientRequest.schemaBodyJson(McpRequest(args))({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: tool,
      arguments: value
    }
  }));
  const response = yield* HttpClient.filterStatusOk(http).execute(request).pipe(Effect.timeoutOrElse({
    duration: timeout,
    orElse: () => Effect.die(new Error(`${tool} request timed out`))
  }));
  const body = yield* response.text;
  return yield* parseSse(body);
});