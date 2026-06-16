/** @file Defines the "websearch" tool, which runs a web search via the Exa MCP endpoint and returns LLM-optimized result context. */
import { assetText } from "#util/asset.js";
import { Effect, Schema } from "effect";
import { HttpClient } from "effect/unstable/http";
import * as Tool from "./tool.js";
import * as McpExa from "./mcp-exa.js";
const DESCRIPTION = assetText("tool/websearch.txt");
/** Schema for the websearch tool parameters: query, optional numResults, livecrawl mode, search type, and contextMaxCharacters. */
export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "Websearch query"
  }),
  numResults: Schema.optional(Schema.Number).annotate({
    description: "Number of search results to return (default: 8)"
  }),
  livecrawl: Schema.optional(Schema.Literals(["fallback", "preferred"])).annotate({
    description: "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')"
  }),
  type: Schema.optional(Schema.Literals(["auto", "fast", "deep"])).annotate({
    description: "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search"
  }),
  contextMaxCharacters: Schema.optional(Schema.Number).annotate({
    description: "Maximum characters for context string optimized for LLMs (default: 10000)"
  })
});
/**
 * The "websearch" tool. After requesting permission, calls the Exa
 * `web_search_exa` MCP endpoint with the query and options, and returns the
 * resulting context string (or a not-found message). The description is
 * rendered dynamically with the current year substituted for `{{year}}`.
 */
export const WebSearchTool = Tool.define("websearch", Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  return {
    /** Tool description with the `{{year}}` placeholder replaced by the current year. */
    get description() {
      return DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString());
    },
    parameters: Parameters,
    execute: (params, ctx) => Effect.gen(function* () {
      yield* ctx.ask({
        permission: "websearch",
        patterns: [params.query],
        always: ["*"],
        metadata: {
          query: params.query,
          numResults: params.numResults,
          livecrawl: params.livecrawl,
          type: params.type,
          contextMaxCharacters: params.contextMaxCharacters
        }
      });
      const result = yield* McpExa.call(http, "web_search_exa", McpExa.SearchArgs, {
        query: params.query,
        type: params.type || "auto",
        numResults: params.numResults || 8,
        livecrawl: params.livecrawl || "fallback",
        contextMaxCharacters: params.contextMaxCharacters
      }, "25 seconds");
      return {
        output: result ?? "No search results found. Please try a different query.",
        title: `Web search: ${params.query}`,
        metadata: {}
      };
    }).pipe(Effect.orDie)
  };
}));