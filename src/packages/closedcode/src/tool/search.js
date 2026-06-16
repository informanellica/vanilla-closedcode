/** @file Registers the grep implementation under the tool id "search" as an alias. */
import { GrepDefinition } from "./grep.js";
import * as Tool from "./tool.js";

// Some models (notably gpt-oss) keep calling a `search` tool for code search
// and spin on "unavailable tool 'search'" when it doesn't exist — the `search`
// registry slot used to point at the Exa websearch tool (id "websearch",
// disabled without CLOSEDCODE_ENABLE_EXA), so no tool with id "search" was
// ever exposed. Register the grep implementation under that id as a plain
// alias so those calls succeed instead of erroring.
/**
 * The "search" tool: a plain alias that exposes the grep implementation under
 * the id "search" so models that insist on calling a `search` tool succeed.
 * @type {Object}
 */
export const SearchTool = Tool.define("search", GrepDefinition);
