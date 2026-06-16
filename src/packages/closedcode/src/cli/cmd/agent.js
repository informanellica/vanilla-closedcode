/** @file CLI `agent` command and subcommands: interactively create a new agent (LLM-generated config + frontmatter) and list existing agents. */
import { cmd } from "./cmd.js";
import * as prompts from "@clack/prompts";
import { UI } from "../ui.js";
import { Global } from "core/global";
import { Agent } from "../../agent/agent.js";
import { Provider } from "#provider/provider.js";
import path from "path";
import fs from "fs/promises";
import { Filesystem } from "#util/filesystem.js";
import matter from "gray-matter";
import { InstanceRef } from "#effect/instance-ref.js";
import { EOL } from "os";
import { Effect } from "effect";
import { effectCmd } from "../effect-cmd.js";
// Permission keys (not raw tool names). Multiple tools can map to a single
// permission — e.g. write/edit/apply_patch all gate on `edit` — so we configure
// agents at the permission level to match how the runtime actually enforces it.
const AVAILABLE_PERMISSIONS = ["bash", "read", "edit", "glob", "grep", "webfetch", "task", "todowrite", "websearch", "lsp", "skill"];
/**
 * CLI command: `agent create` — generates an agent file, prompting for scope/description/permissions/mode
 * unless all are supplied via flags (fully non-interactive mode). Writes a Markdown file with frontmatter.
 */
const AgentCreateCommand = effectCmd({
  command: "create",
  describe: "create a new agent",
  builder: yargs => yargs.option("path", {
    type: "string",
    describe: "directory path to generate the agent file"
  }).option("description", {
    type: "string",
    describe: "what the agent should do"
  }).option("mode", {
    type: "string",
    describe: "agent mode",
    choices: ["all", "primary", "subagent"]
  }).option("permissions", {
    type: "string",
    alias: ["tools"],
    describe: `comma-separated list of permissions to allow (default: all). Available: "${AVAILABLE_PERMISSIONS.join(", ")}"`
  }).option("model", {
    type: "string",
    alias: ["m"],
    describe: "model to use in the format of provider/model"
  }),
  handler: Effect.fn("Cli.agent.create")(function* (args) {
    const maybeCtx = yield* InstanceRef;
    if (!maybeCtx) return yield* Effect.die("InstanceRef not provided");
    const ctx = maybeCtx;
    const agentSvc = yield* Agent.Service;
    yield* Effect.promise(async () => {
      const cliPath = args.path;
      const cliDescription = args.description;
      const cliMode = args.mode;
      const perms = args.permissions;
      const isFullyNonInteractive = cliPath && cliDescription && cliMode && perms !== undefined;
      if (!isFullyNonInteractive) {
        UI.empty();
        prompts.intro("Create agent");
      }
      const project = ctx.project;

      // Determine scope/path
      let targetPath;
      if (cliPath) {
        targetPath = path.join(cliPath, "agent");
      } else {
        let scope = "global";
        if (project.vcs === "git") {
          const scopeResult = await prompts.select({
            message: "Location",
            options: [{
              label: "Current project",
              value: "project",
              hint: ctx.worktree
            }, {
              label: "Global",
              value: "global",
              hint: Global.Path.config
            }]
          });
          if (prompts.isCancel(scopeResult)) throw new UI.CancelledError();
          scope = scopeResult;
        }
        targetPath = path.join(scope === "global" ? Global.Path.config : path.join(ctx.worktree, ".closedcode"), "agent");
      }

      // Get description
      let description;
      if (cliDescription) {
        description = cliDescription;
      } else {
        const query = await prompts.text({
          message: "Description",
          placeholder: "What should this agent do?",
          validate: x => x && x.length > 0 ? undefined : "Required"
        });
        if (prompts.isCancel(query)) throw new UI.CancelledError();
        description = query;
      }

      // Generate agent
      const spinner = prompts.spinner();
      spinner.start("Generating agent configuration...");
      const model = args.model ? Provider.parseModel(args.model) : undefined;
      const generated = await Effect.runPromise(agentSvc.generate({
        description,
        model
      })).catch(error => {
        spinner.stop(`LLM failed to generate agent: ${error.message}`, 1);
        if (isFullyNonInteractive) process.exit(1);
        throw new UI.CancelledError();
      });
      spinner.stop(`Agent ${generated.identifier} generated`);

      // Select permissions to allow
      let selected;
      if (perms !== undefined) {
        selected = perms ? perms.split(",").map(t => t.trim()) : AVAILABLE_PERMISSIONS;
      } else {
        const result = await prompts.multiselect({
          message: "Select permissions to allow (Space to toggle)",
          options: AVAILABLE_PERMISSIONS.map(permission => ({
            label: permission,
            value: permission
          })),
          initialValues: AVAILABLE_PERMISSIONS
        });
        if (prompts.isCancel(result)) throw new UI.CancelledError();
        selected = result;
      }

      // Get mode
      let mode;
      if (cliMode) {
        mode = cliMode;
      } else {
        const modeResult = await prompts.select({
          message: "Agent mode",
          options: [{
            label: "All",
            value: "all",
            hint: "Can function in both primary and subagent roles"
          }, {
            label: "Primary",
            value: "primary",
            hint: "Acts as a primary/main agent"
          }, {
            label: "Subagent",
            value: "subagent",
            hint: "Can be used as a subagent by other agents"
          }],
          initialValue: "all"
        });
        if (prompts.isCancel(modeResult)) throw new UI.CancelledError();
        mode = modeResult;
      }

      // Build permissions config — deny anything not explicitly selected.
      const permissions = {};
      for (const permission of AVAILABLE_PERMISSIONS) {
        if (!selected.includes(permission)) {
          permissions[permission] = "deny";
        }
      }

      // Build frontmatter
      const frontmatter = {
        description: generated.whenToUse,
        mode
      };
      if (Object.keys(permissions).length > 0) {
        frontmatter.permission = permissions;
      }

      // Write file
      const content = matter.stringify(generated.systemPrompt, frontmatter);
      const filePath = path.join(targetPath, `${generated.identifier}.md`);
      await fs.mkdir(targetPath, {
        recursive: true
      });
      if (await Filesystem.exists(filePath)) {
        if (isFullyNonInteractive) {
          console.error(`Error: Agent file already exists: ${filePath}`);
          process.exit(1);
        }
        prompts.log.error(`Agent file already exists: ${filePath}`);
        throw new UI.CancelledError();
      }
      await Filesystem.write(filePath, content);
      if (isFullyNonInteractive) {
        console.log(filePath);
      } else {
        prompts.log.success(`Agent created: ${filePath}`);
        prompts.outro("Done");
      }
    });
  })
});
/** CLI command: `agent list` — prints all available agents (native first, then alphabetical) with their permissions. */
const AgentListCommand = effectCmd({
  command: "list",
  describe: "list all available agents",
  handler: Effect.fn("Cli.agent.list")(function* () {
    const agents = yield* Agent.Service.use(svc => svc.list());
    const sortedAgents = agents.sort((a, b) => {
      if (a.native !== b.native) {
        return a.native ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const agent of sortedAgents) {
      process.stdout.write(`${agent.name} (${agent.mode})` + EOL);
      process.stdout.write(`  ${JSON.stringify(agent.permission, null, 2)}` + EOL);
    }
  })
});
/** CLI command: `agent` — parent command grouping the `create` and `list` subcommands. */
export const AgentCommand = cmd({
  command: "agent",
  describe: "manage agents",
  builder: yargs => yargs.command(AgentCreateCommand).command(AgentListCommand).demandCommand(),
  async handler() {}
});