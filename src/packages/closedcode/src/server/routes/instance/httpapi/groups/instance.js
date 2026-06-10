import { Agent } from "#agent/agent.js";
import { Command } from "#command/index.js";
import { Format } from "#format/index.js";
import { LSP } from "#lsp/lsp.js";
import { Vcs } from "#project/vcs.js";
import { Skill } from "#skill/index.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization.js";
import { InstanceContextMiddleware } from "../middleware/instance-context.js";
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing.js";
import { described } from "./metadata.js";
const PathInfo = Schema.Struct({
  home: Schema.String,
  state: Schema.String,
  config: Schema.String,
  worktree: Schema.String,
  directory: Schema.String
}).annotate({
  identifier: "Path"
});
export const VcsDiffQuery = Schema.Struct({
  mode: Vcs.Mode
});
export const InstancePaths = {
  dispose: "/instance/dispose",
  path: "/path",
  vcs: "/vcs",
  vcsDiff: "/vcs/diff",
  command: "/command",
  agent: "/agent",
  skill: "/skill",
  lsp: "/lsp",
  formatter: "/formatter"
};
export const InstanceApi = HttpApi.make("instance").add(HttpApiGroup.make("instance").add(HttpApiEndpoint.post("dispose", InstancePaths.dispose, {
  success: described(Schema.Boolean, "Instance disposed")
}).annotateMerge(OpenApi.annotations({
  identifier: "instance.dispose",
  summary: "Dispose instance",
  description: "Clean up and dispose the current ClosedCode instance, releasing all resources."
})), HttpApiEndpoint.get("path", InstancePaths.path, {
  success: PathInfo
}).annotateMerge(OpenApi.annotations({
  identifier: "path.get",
  summary: "Get paths",
  description: "Retrieve the current working directory and related path information for the ClosedCode instance."
})), HttpApiEndpoint.get("vcs", InstancePaths.vcs, {
  success: described(Vcs.Info, "VCS info")
}).annotateMerge(OpenApi.annotations({
  identifier: "vcs.get",
  summary: "Get VCS info",
  description: "Retrieve version control system (VCS) information for the current project, such as git branch."
})), HttpApiEndpoint.get("vcsDiff", InstancePaths.vcsDiff, {
  query: VcsDiffQuery,
  success: described(Schema.Array(Vcs.FileDiff), "VCS diff")
}).annotateMerge(OpenApi.annotations({
  identifier: "vcs.diff",
  summary: "Get VCS diff",
  description: "Retrieve the current git diff for the working tree or against the default branch."
})), HttpApiEndpoint.get("command", InstancePaths.command, {
  success: described(Schema.Array(Command.Info), "List of commands")
}).annotateMerge(OpenApi.annotations({
  identifier: "command.list",
  summary: "List commands",
  description: "Get a list of all available commands in the ClosedCode system."
})), HttpApiEndpoint.get("agent", InstancePaths.agent, {
  success: described(Schema.Array(Agent.Info), "List of agents")
}).annotateMerge(OpenApi.annotations({
  identifier: "app.agents",
  summary: "List agents",
  description: "Get a list of all available AI agents in the ClosedCode system."
})), HttpApiEndpoint.get("skill", InstancePaths.skill, {
  success: described(Schema.Array(Skill.Info), "List of skills")
}).annotateMerge(OpenApi.annotations({
  identifier: "app.skills",
  summary: "List skills",
  description: "Get a list of all available skills in the ClosedCode system."
})), HttpApiEndpoint.get("lsp", InstancePaths.lsp, {
  success: described(Schema.Array(LSP.Status), "LSP server status")
}).annotateMerge(OpenApi.annotations({
  identifier: "lsp.status",
  summary: "Get LSP status",
  description: "Get LSP server status"
})), HttpApiEndpoint.get("formatter", InstancePaths.formatter, {
  success: described(Schema.Array(Format.Status), "Formatter status")
}).annotateMerge(OpenApi.annotations({
  identifier: "formatter.status",
  summary: "Get formatter status",
  description: "Get formatter status"
}))).annotateMerge(OpenApi.annotations({
  title: "instance",
  description: "Experimental HttpApi instance read routes."
})).middleware(InstanceContextMiddleware).middleware(WorkspaceRoutingMiddleware).middleware(Authorization)).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));