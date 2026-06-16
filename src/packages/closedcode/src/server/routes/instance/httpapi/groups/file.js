/** @file Experimental HttpApi route definitions for file operations (find text/files/symbols, list, read, git status). */
import { File } from "#file/index.js";
import { Ripgrep } from "#file/ripgrep.js";
import { LSP } from "#lsp/lsp.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization.js";
import { InstanceContextMiddleware } from "../middleware/instance-context.js";
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing.js";
import { described } from "./metadata.js";
/** Query schema for endpoints that target a single file by path. */
export const FileQuery = Schema.Struct({
  path: Schema.String
});
/** Query schema for the find-text endpoint: a ripgrep search pattern. */
export const FindTextQuery = Schema.Struct({
  pattern: Schema.String
});
/** Query schema for the find-file endpoint: search query plus optional dir/type filters and a result limit. */
export const FindFileQuery = Schema.Struct({
  query: Schema.String,
  dirs: Schema.optional(Schema.Literals(["true", "false"])),
  type: Schema.optional(Schema.Literals(["file", "directory"])),
  limit: Schema.optional(Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)))
});
/** Query schema for the find-symbol endpoint: a workspace symbol search query. */
export const FindSymbolQuery = Schema.Struct({
  query: Schema.String
});
/** URL path constants for each file route, keyed by endpoint name. */
export const FilePaths = {
  findText: "/find",
  findFile: "/find/file",
  findSymbol: "/find/symbol",
  list: "/file",
  content: "/file/content",
  status: "/file/status"
};
/**
 * HttpApi definition for the experimental file route group.
 * Bundles the find/list/read/status endpoints under instance-context, workspace-routing, and authorization middleware.
 */
export const FileApi = HttpApi.make("file").add(HttpApiGroup.make("file").add(HttpApiEndpoint.get("findText", FilePaths.findText, {
  query: FindTextQuery,
  success: described(Schema.Array(Ripgrep.SearchMatch), "Matches")
}).annotateMerge(OpenApi.annotations({
  identifier: "find.text",
  summary: "Find text",
  description: "Search for text patterns across files in the project using ripgrep."
})), HttpApiEndpoint.get("findFile", FilePaths.findFile, {
  query: FindFileQuery,
  success: described(Schema.Array(Schema.String), "File paths")
}).annotateMerge(OpenApi.annotations({
  identifier: "find.files",
  summary: "Find files",
  description: "Search for files or directories by name or pattern in the project directory."
})), HttpApiEndpoint.get("findSymbol", FilePaths.findSymbol, {
  query: FindSymbolQuery,
  success: described(Schema.Array(LSP.Symbol), "Symbols")
}).annotateMerge(OpenApi.annotations({
  identifier: "find.symbols",
  summary: "Find symbols",
  description: "Search for workspace symbols like functions, classes, and variables using LSP."
})), HttpApiEndpoint.get("list", FilePaths.list, {
  query: FileQuery,
  success: described(Schema.Array(File.Node), "Files and directories")
}).annotateMerge(OpenApi.annotations({
  identifier: "file.list",
  summary: "List files",
  description: "List files and directories in a specified path."
})), HttpApiEndpoint.get("content", FilePaths.content, {
  query: FileQuery,
  success: described(File.Content, "File content")
}).annotateMerge(OpenApi.annotations({
  identifier: "file.read",
  summary: "Read file",
  description: "Read the content of a specified file."
})), HttpApiEndpoint.get("status", FilePaths.status, {
  success: described(Schema.Array(File.Info), "File status")
}).annotateMerge(OpenApi.annotations({
  identifier: "file.status",
  summary: "Get file status",
  description: "Get the git status of all files in the project."
}))).annotateMerge(OpenApi.annotations({
  title: "file",
  description: "Experimental HttpApi file routes."
})).middleware(InstanceContextMiddleware).middleware(WorkspaceRoutingMiddleware).middleware(Authorization)).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));