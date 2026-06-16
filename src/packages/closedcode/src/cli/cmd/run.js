/** @file CLI `run` command: sends a single message (or command) to closedcode, either against an in-process server or a remote one via --attach, and renders streamed tool/text/reasoning events to the terminal. */
import path from "path";
import { pathToFileURL } from "url";
import { Effect } from "effect";
import { UI } from "../ui.js";
import { readPipedStdin } from "../stdin.js";
import { effectCmd } from "../effect-cmd.js";
import { Flag } from "core/flag/flag";
import { EOL } from "os";
import { Filesystem } from "#util/filesystem.js";
import { createClosedcodeClient } from "sdk/v2";
import { Server } from "../../server/server.js";
import { Provider } from "#provider/provider.js";
import { Agent } from "../../agent/agent.js";
import { ShellID } from "../../tool/shell/id.js";
import { Locale } from "#util/locale.js";
import { AppRuntime } from "#effect/app-runtime.js";
/**
 * Builds the renderer info object from a tool message part.
 * @param {Object} part - The tool message part (has `state` and tool info).
 * @returns {Object} An object with the tool input, optional metadata, and the original part.
 */
function props(part) {
  const state = part.state;
  return {
    input: state.input,
    metadata: "metadata" in state ? state.metadata : {},
    part
  };
}
/**
 * Prints a single-line tool summary (icon + title, with an optional dimmed description suffix).
 * @param {Object} info - Render info with `icon`, `title`, and optional `description`.
 * @returns {void}
 */
function inline(info) {
  const suffix = info.description ? UI.Style.TEXT_DIM + ` ${info.description}` + UI.Style.TEXT_NORMAL : "";
  UI.println(UI.Style.TEXT_NORMAL + info.icon, UI.Style.TEXT_NORMAL + info.title + suffix);
}
/**
 * Prints a tool summary line followed by an indented output block.
 * @param {Object} info - Render info with `icon` and `title`.
 * @param {string} output - The output text to print below the title; skipped when empty/blank.
 * @returns {void}
 */
function block(info, output) {
  UI.empty();
  inline(info);
  if (!output?.trim()) return;
  UI.println(output);
  UI.empty();
}
/**
 * Generic renderer for tools without a dedicated formatter; shows the tool name plus a best-effort title.
 * @param {Object} part - The tool message part.
 * @returns {void}
 */
function fallback(part) {
  const state = part.state;
  const input = "input" in state ? state.input : undefined;
  const title = ("title" in state && state.title ? state.title : undefined) || (input && typeof input === "object" && Object.keys(input).length > 0 ? JSON.stringify(input) : "Unknown");
  inline({
    icon: "⚙",
    title: `${part.tool} ${title}`
  });
}
/**
 * Renders a `glob` tool invocation (pattern, optional search root, and match count).
 * @param {Object} info - Render info with `input` and `metadata`.
 * @returns {void}
 */
function glob(info) {
  const root = info.input.path ?? "";
  const title = `Glob "${info.input.pattern}"`;
  const suffix = root ? `in ${normalizePath(root)}` : "";
  const num = info.metadata.count;
  const description = num === undefined ? suffix : `${suffix}${suffix ? " · " : ""}${num} ${num === 1 ? "match" : "matches"}`;
  inline({
    icon: "✱",
    title,
    ...(description && {
      description
    })
  });
}
/**
 * Renders a `grep` tool invocation (pattern, optional search root, and match count).
 * @param {Object} info - Render info with `input` and `metadata`.
 * @returns {void}
 */
function grep(info) {
  const root = info.input.path ?? "";
  const title = `Grep "${info.input.pattern}"`;
  const suffix = root ? `in ${normalizePath(root)}` : "";
  const num = info.metadata.matches;
  const description = num === undefined ? suffix : `${suffix}${suffix ? " · " : ""}${num} ${num === 1 ? "match" : "matches"}`;
  inline({
    icon: "✱",
    title,
    ...(description && {
      description
    })
  });
}
/**
 * Renders a `read` tool invocation (file path plus any extra scalar input options).
 * @param {Object} info - Render info with `input`.
 * @returns {void}
 */
function read(info) {
  const file = normalizePath(info.input.filePath);
  const pairs = Object.entries(info.input).filter(([key, value]) => {
    if (key === "filePath") return false;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  });
  const description = pairs.length ? `[${pairs.map(([key, value]) => `${key}=${value}`).join(", ")}]` : undefined;
  inline({
    icon: "→",
    title: `Read ${file}`,
    ...(description && {
      description
    })
  });
}
/**
 * Renders a `write` tool invocation, including its output block when completed.
 * @param {Object} info - Render info with `input` and `part`.
 * @returns {void}
 */
function write(info) {
  block({
    icon: "←",
    title: `Write ${normalizePath(info.input.filePath)}`
  }, info.part.state.status === "completed" ? info.part.state.output : undefined);
}
/**
 * Renders a `webfetch` tool invocation (the fetched URL).
 * @param {Object} info - Render info with `input`.
 * @returns {void}
 */
function webfetch(info) {
  inline({
    icon: "%",
    title: `WebFetch ${info.input.url}`
  });
}
/**
 * Renders an `edit` tool invocation, including the diff block from metadata.
 * @param {Object} info - Render info with `input` and `metadata` (carries `diff`).
 * @returns {void}
 */
function edit(info) {
  const title = normalizePath(info.input.filePath);
  const diff = info.metadata.diff;
  block({
    icon: "←",
    title: `Edit ${title}`
  }, diff);
}
/**
 * Renders a `websearch` tool invocation (the search query).
 * @param {Object} info - Render info with `input`.
 * @returns {void}
 */
function websearch(info) {
  inline({
    icon: "◈",
    title: `Exa Web Search "${info.input.query}"`
  });
}
/**
 * Renders a `task` (subagent) invocation with a status-dependent icon and the subagent name/description.
 * @param {Object} info - Render info with `part` (carries the task state).
 * @returns {void}
 */
function task(info) {
  const input = info.part.state.input;
  const status = info.part.state.status;
  const subagent = typeof input.subagent_type === "string" && input.subagent_type.trim().length > 0 ? input.subagent_type : "unknown";
  const agent = Locale.titlecase(subagent);
  const desc = typeof input.description === "string" && input.description.trim().length > 0 ? input.description : undefined;
  const icon = status === "error" ? "✗" : status === "running" ? "•" : "✓";
  const name = desc ?? `${agent} Task`;
  inline({
    icon,
    title: name,
    description: desc ? `${agent} Agent` : undefined
  });
}
/**
 * Renders a `skill` tool invocation (the skill name).
 * @param {Object} info - Render info with `input`.
 * @returns {void}
 */
function skill(info) {
  inline({
    icon: "→",
    title: `Skill "${info.input.name}"`
  });
}
/**
 * Renders a shell tool invocation (the command), including its output block when completed.
 * @param {Object} info - Render info with `input` and `part`.
 * @returns {void}
 */
function shell(info) {
  const output = info.part.state.status === "completed" ? info.part.state.output?.trim() : undefined;
  block({
    icon: "$",
    title: `${info.input.command}`
  }, output);
}
/**
 * Renders a `todowrite` tool invocation as a checkbox list of todo items.
 * @param {Object} info - Render info with `input` (carries `todos`).
 * @returns {void}
 */
function todo(info) {
  block({
    icon: "#",
    title: "Todos"
  }, info.input.todos.map(item => `${item.status === "completed" ? "[x]" : "[ ]"} ${item.content}`).join("\n"));
}
/**
 * Converts an absolute path to a cwd-relative path for display; returns input unchanged if already relative.
 * @param {string} input - The path to normalize.
 * @returns {string} The cwd-relative path, "." for the cwd itself, or "" for empty input.
 */
function normalizePath(input) {
  if (!input) return "";
  if (path.isAbsolute(input)) return path.relative(process.cwd(), input) || ".";
  return input;
}
/**
 * The `run` CLI command: prompts closedcode with a one-off message or command and streams the result.
 * @type {Object}
 */
export const RunCommand = effectCmd({
  command: "run [message..]",
  describe: "run closedcode with a message",
  // --attach connects to a remote server (no local instance needed); the
  // default path runs an in-process server and needs the project instance.
  instance: args => !args.attach,
  // For --dir without --attach, load instance for the resolved target dir.
  // The handler also chdirs (preserving the legacy order: chdir → file resolution).
  directory: args => args.dir && !args.attach ? path.resolve(process.cwd(), args.dir) : process.cwd(),
  builder: yargs => yargs.positional("message", {
    describe: "message to send",
    type: "string",
    array: true,
    default: []
  }).option("command", {
    describe: "the command to run, use message for args",
    type: "string"
  }).option("continue", {
    alias: ["c"],
    describe: "continue the last session",
    type: "boolean"
  }).option("session", {
    alias: ["s"],
    describe: "session id to continue",
    type: "string"
  }).option("fork", {
    describe: "fork the session before continuing (requires --continue or --session)",
    type: "boolean"
  }).option("share", {
    type: "boolean",
    describe: "share the session"
  }).option("model", {
    type: "string",
    alias: ["m"],
    describe: "model to use in the format of provider/model"
  }).option("agent", {
    type: "string",
    describe: "agent to use"
  }).option("format", {
    type: "string",
    choices: ["default", "json"],
    default: "default",
    describe: "format: default (formatted) or json (raw JSON events)"
  }).option("file", {
    alias: ["f"],
    type: "string",
    array: true,
    describe: "file(s) to attach to message"
  }).option("title", {
    type: "string",
    describe: "title for the session (uses truncated prompt if no value provided)"
  }).option("attach", {
    type: "string",
    describe: "attach to a running closedcode server (e.g., http://localhost:4096)"
  }).option("password", {
    alias: ["p"],
    type: "string",
    describe: "basic auth password (defaults to CLOSEDCODE_SERVER_PASSWORD)"
  }).option("dir", {
    type: "string",
    describe: "directory to run in, path on remote server if attaching"
  }).option("port", {
    type: "number",
    describe: "port for the local server (defaults to random port if no value provided)"
  }).option("variant", {
    type: "string",
    describe: "model variant (provider-specific reasoning effort, e.g., high, max, minimal)"
  }).option("thinking", {
    type: "boolean",
    describe: "show thinking blocks",
    default: false
  }).option("dangerously-skip-permissions", {
    type: "boolean",
    describe: "auto-approve permissions that are not explicitly denied (dangerous!)",
    default: false
  }),
  handler: Effect.fn("Cli.run")(function* (args) {
    yield* Effect.promise(async () => {
      let message = [...args.message, ...(args["--"] || [])].map(arg => arg.includes(" ") ? `"${arg.replace(/"/g, '\\"')}"` : arg).join(" ");
      const directory = (() => {
        if (!args.dir) return undefined;
        if (args.attach) return args.dir;
        try {
          process.chdir(args.dir);
          return process.cwd();
        } catch {
          UI.error("Failed to change directory to " + args.dir);
          process.exit(1);
        }
      })();
      const files = [];
      if (args.file) {
        const list = Array.isArray(args.file) ? args.file : [args.file];
        for (const filePath of list) {
          const resolvedPath = path.resolve(process.cwd(), filePath);
          if (!(await Filesystem.exists(resolvedPath))) {
            UI.error(`File not found: ${filePath}`);
            process.exit(1);
          }
          const mime = (await Filesystem.isDir(resolvedPath)) ? "application/x-directory" : "text/plain";
          files.push({
            type: "file",
            url: pathToFileURL(resolvedPath).href,
            filename: path.basename(resolvedPath),
            mime
          });
        }
      }
      if (!process.stdin.isTTY) {
        // With an argv message stdin is auxiliary and may be an inherited pipe
        // that never reaches EOF (background runs) — use the first-byte grace
        // window. Without one, stdin is the only input source: wait for real
        // EOF however slow the producer's first byte is.
        const stdinText = await readPipedStdin(message.trim().length > 0 ? undefined : Infinity);
        if (stdinText) message += "\n" + stdinText;
      }
      if (message.trim().length === 0 && !args.command) {
        UI.error("You must provide a message or a command");
        process.exit(1);
      }
      if (args.fork && !args.continue && !args.session) {
        UI.error("--fork requires --continue or --session");
        process.exit(1);
      }
      const rules = [{
        permission: "question",
        action: "deny",
        pattern: "*"
      }, {
        permission: "plan_enter",
        action: "deny",
        pattern: "*"
      }, {
        permission: "plan_exit",
        action: "deny",
        pattern: "*"
      }];
      /**
       * Resolves the session title from --title, falling back to a truncated prompt when the flag is passed without a value.
       * @returns {string} The session title, or undefined when --title was not provided.
       */
      function title() {
        if (args.title === undefined) return;
        if (args.title !== "") return args.title;
        return message.slice(0, 50) + (message.length > 50 ? "..." : "");
      }
      /**
       * Resolves the target session id: continues/forks an existing session or creates a new one.
       * @param {Object} sdk - The closedcode SDK client.
       * @returns {Promise<string>} The session id to prompt against (may be undefined if creation failed).
       */
      async function session(sdk) {
        const baseID = args.continue ? (await sdk.session.list()).data?.find(s => !s.parentID)?.id : args.session;
        if (baseID && args.fork) {
          const forked = await sdk.session.fork({
            sessionID: baseID
          });
          return forked.data?.id;
        }
        if (baseID) return baseID;
        const name = title();
        const result = await sdk.session.create({
          title: name,
          permission: rules
        });
        return result.data?.id;
      }
      /**
       * Shares the session when sharing is enabled (config `share: "auto"`, the auto-share flag, or --share) and prints the share URL.
       * @param {Object} sdk - The closedcode SDK client.
       * @param {string} sessionID - The session id to share.
       * @returns {Promise<void>}
       */
      async function share(sdk, sessionID) {
        const cfg = await sdk.config.get();
        if (!cfg.data) return;
        if (cfg.data.share !== "auto" && !Flag.CLOSEDCODE_AUTO_SHARE && !args.share) return;
        const res = await sdk.session.share({
          sessionID
        }).catch(error => {
          if (error instanceof Error && error.message.includes("disabled")) {
            UI.println(UI.Style.TEXT_DANGER_BOLD + "!  " + error.message);
          }
          return {
            error
          };
        });
        if (!res.error && "data" in res && res.data?.share?.url) {
          UI.println(UI.Style.TEXT_INFO_BOLD + "~  " + res.data.share.url);
        }
      }
      /**
       * Runs the full prompt lifecycle against the given SDK: resolves the agent and session, optionally shares it,
       * subscribes to the event stream, and dispatches either a command or a prompt with the message and attached files.
       * @param {Object} sdk - The closedcode SDK client (in-process or remote).
       * @returns {Promise<void>}
       */
      async function execute(sdk) {
        /**
         * Routes a completed tool part to its dedicated renderer, falling back to the generic one on error.
         * @param {Object} part - The tool message part.
         * @returns {void}
         */
        function tool(part) {
          try {
            if (part.tool === ShellID.ToolID) return shell(props(part));
            if (part.tool === "glob") return glob(props(part));
            if (part.tool === "grep") return grep(props(part));
            if (part.tool === "read") return read(props(part));
            if (part.tool === "write") return write(props(part));
            if (part.tool === "webfetch") return webfetch(props(part));
            if (part.tool === "edit") return edit(props(part));
            if (part.tool === "websearch") return websearch(props(part));
            if (part.tool === "task") return task(props(part));
            if (part.tool === "todowrite") return todo(props(part));
            if (part.tool === "skill") return skill(props(part));
            return fallback(part);
          } catch {
            return fallback(part);
          }
        }
        /**
         * Emits a raw JSON event line to stdout when --format json is set.
         * @param {string} type - The event type label.
         * @param {Object} data - Extra fields to merge into the emitted JSON object.
         * @returns {boolean} True if JSON was emitted (caller should skip formatted output), false otherwise.
         */
        function emit(type, data) {
          if (args.format === "json") {
            process.stdout.write(JSON.stringify({
              type,
              timestamp: Date.now(),
              sessionID,
              ...data
            }) + EOL);
            return true;
          }
          return false;
        }
        const events = await sdk.event.subscribe();
        let error;
        /**
         * Consumes the event stream for this session until it goes idle, rendering tool/text/reasoning parts,
         * surfacing errors, and auto-replying to permission prompts.
         * @returns {Promise<void>}
         */
        async function loop() {
          const toggles = new Map();
          for await (const event of events.stream) {
            if (event.type === "message.updated" && event.properties.info.role === "assistant" && args.format !== "json" && toggles.get("start") !== true) {
              UI.empty();
              UI.println(`> ${event.properties.info.agent} · ${event.properties.info.modelID}`);
              UI.empty();
              toggles.set("start", true);
            }
            if (event.type === "message.part.updated") {
              const part = event.properties.part;
              if (part.sessionID !== sessionID) continue;
              if (part.type === "tool" && (part.state.status === "completed" || part.state.status === "error")) {
                if (emit("tool_use", {
                  part
                })) continue;
                if (part.state.status === "completed") {
                  tool(part);
                  continue;
                }
                inline({
                  icon: "✗",
                  title: `${part.tool} failed`
                });
                UI.error(part.state.error);
              }
              if (part.type === "tool" && part.tool === "task" && part.state.status === "running" && args.format !== "json") {
                if (toggles.get(part.id) === true) continue;
                task(props(part));
                toggles.set(part.id, true);
              }
              if (part.type === "step-start") {
                if (emit("step_start", {
                  part
                })) continue;
              }
              if (part.type === "step-finish") {
                if (emit("step_finish", {
                  part
                })) continue;
              }
              if (part.type === "text" && part.time?.end) {
                if (emit("text", {
                  part
                })) continue;
                const text = part.text.trim();
                if (!text) continue;
                if (!process.stdout.isTTY) {
                  process.stdout.write(text + EOL);
                  continue;
                }
                UI.empty();
                UI.println(text);
                UI.empty();
              }
              if (part.type === "reasoning" && part.time?.end && args.thinking) {
                if (emit("reasoning", {
                  part
                })) continue;
                const text = part.text.trim();
                if (!text) continue;
                const line = `Thinking: ${text}`;
                if (process.stdout.isTTY) {
                  UI.empty();
                  UI.println(`${UI.Style.TEXT_DIM}\u001b[3m${line}\u001b[0m${UI.Style.TEXT_NORMAL}`);
                  UI.empty();
                  continue;
                }
                process.stdout.write(line + EOL);
              }
            }
            if (event.type === "session.error") {
              const props = event.properties;
              if (props.sessionID !== sessionID || !props.error) continue;
              let err = String(props.error.name);
              if ("data" in props.error && props.error.data && "message" in props.error.data) {
                err = String(props.error.data.message);
              }
              error = error ? error + EOL + err : err;
              if (emit("error", {
                error: props.error
              })) continue;
              UI.error(err);
            }
            if (event.type === "session.status" && event.properties.sessionID === sessionID && event.properties.status.type === "idle") {
              break;
            }
            if (event.type === "permission.asked") {
              const permission = event.properties;
              if (permission.sessionID !== sessionID) continue;
              if (args["dangerously-skip-permissions"]) {
                await sdk.permission.reply({
                  requestID: permission.id,
                  reply: "once"
                });
              } else {
                UI.println(UI.Style.TEXT_WARNING_BOLD + "!", UI.Style.TEXT_NORMAL + `permission requested: ${permission.permission} (${permission.patterns.join(", ")}); auto-rejecting`);
                await sdk.permission.reply({
                  requestID: permission.id,
                  reply: "reject"
                });
              }
            }
          }
        }

        // Validate agent if specified
        const agent = await (async () => {
          if (!args.agent) return undefined;
          const name = args.agent;

          // When attaching, validate against the running server instead of local Instance state.
          if (args.attach) {
            const modes = await sdk.app.agents(undefined, {
              throwOnError: true
            }).then(x => x.data ?? []).catch(() => undefined);
            if (!modes) {
              UI.println(UI.Style.TEXT_WARNING_BOLD + "!", UI.Style.TEXT_NORMAL, `failed to list agents from ${args.attach}. Falling back to default agent`);
              return undefined;
            }
            const agent = modes.find(a => a.name === name);
            if (!agent) {
              UI.println(UI.Style.TEXT_WARNING_BOLD + "!", UI.Style.TEXT_NORMAL, `agent "${name}" not found. Falling back to default agent`);
              return undefined;
            }
            if (agent.mode === "subagent") {
              UI.println(UI.Style.TEXT_WARNING_BOLD + "!", UI.Style.TEXT_NORMAL, `agent "${name}" is a subagent, not a primary agent. Falling back to default agent`);
              return undefined;
            }
            return name;
          }
          const entry = await AppRuntime.runPromise(Agent.Service.use(svc => svc.get(name)));
          if (!entry) {
            UI.println(UI.Style.TEXT_WARNING_BOLD + "!", UI.Style.TEXT_NORMAL, `agent "${name}" not found. Falling back to default agent`);
            return undefined;
          }
          if (entry.mode === "subagent") {
            UI.println(UI.Style.TEXT_WARNING_BOLD + "!", UI.Style.TEXT_NORMAL, `agent "${name}" is a subagent, not a primary agent. Falling back to default agent`);
            return undefined;
          }
          return name;
        })();
        const sessionID = await session(sdk);
        if (!sessionID) {
          UI.error("Session not found");
          process.exit(1);
        }
        await share(sdk, sessionID);
        loop().catch(e => {
          console.error(e);
          process.exit(1);
        });
        if (args.command) {
          await sdk.session.command({
            sessionID,
            agent,
            model: args.model,
            command: args.command,
            arguments: message,
            variant: args.variant
          });
        } else {
          const model = args.model ? Provider.parseModel(args.model) : undefined;
          await sdk.session.prompt({
            sessionID,
            agent,
            model,
            variant: args.variant,
            parts: [...files, {
              type: "text",
              text: message
            }]
          });
        }
      }
      if (args.attach) {
        const headers = (() => {
          const password = args.password ?? process.env.CLOSEDCODE_SERVER_PASSWORD;
          if (!password) return undefined;
          const username = process.env.CLOSEDCODE_SERVER_USERNAME ?? "closedcode";
          const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
          return {
            Authorization: auth
          };
        })();
        const sdk = createClosedcodeClient({
          baseUrl: args.attach,
          directory,
          headers
        });
        return await execute(sdk);
      }
      const fetchFn = async (input, init) => {
        const request = new Request(input, init);
        return Server.Default().app.fetch(request);
      };
      const sdk = createClosedcodeClient({
        baseUrl: "http://closedcode.internal",
        fetch: fetchFn
      });
      await execute(sdk);
    });
  })
});