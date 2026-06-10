import { Provider } from "#provider/provider.js";
import * as Log from "core/util/log";
import { Context, Effect, Layer, Record } from "effect";
import * as Stream from "effect/Stream";
import { streamText, wrapLanguageModel, tool, jsonSchema } from "ai";
import { mergeDeep } from "remeda";
import { ProviderTransform } from "#provider/transform.js";
import { Config } from "#config/config.js";
import { InstanceState } from "#effect/instance-state.js";
import { Plugin } from "#plugin/index.js";
import { SystemPrompt } from "./system.js";
import { Flag } from "core/flag/flag";
import { Permission } from "#permission/index.js";
import { InstallationVersion } from "core/installation/version";
import * as Option from "effect/Option";
import * as OtelTracer from "@effect/opentelemetry/Tracer";
const log = Log.create({
  service: "llm"
});
export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX;
// Avoid re-instantiating remeda's deep merge types in this hot LLM path; the runtime behavior is still mergeDeep.
const mergeOptions = (target, source) => mergeDeep(target, source ?? {});
export class Service extends Context.Service()("@closedcode/LLM") {}
const live = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service;
  const provider = yield* Provider.Service;
  const plugin = yield* Plugin.Service;
  const perm = yield* Permission.Service;
  const run = Effect.fn("LLM.run")(function* (input) {
    const l = log.clone().tag("providerID", input.model.providerID).tag("modelID", input.model.id).tag("session.id", input.sessionID).tag("small", (input.small ?? false).toString()).tag("agent", input.agent.name).tag("mode", input.agent.mode);
    l.info("stream", {
      modelID: input.model.id,
      providerID: input.model.providerID
    });
    const [language, cfg, item] = yield* Effect.all([provider.getLanguage(input.model), config.get(), provider.getProvider(input.model.providerID)], {
      concurrency: "unbounded"
    });
    const system = [];
    system.push([
    // use agent prompt otherwise provider prompt
    ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
    // any custom prompt passed into this call
    ...input.system,
    // any custom prompt from last user message
    ...(input.user.system ? [input.user.system] : [])].filter(x => x).join("\n"));
    const header = system[0];
    yield* plugin.trigger("experimental.chat.system.transform", {
      sessionID: input.sessionID,
      model: input.model
    }, {
      system
    });
    // rejoin to maintain 2-part structure for caching if header unchanged
    if (system.length > 2 && system[0] === header) {
      const rest = system.slice(1);
      system.length = 0;
      system.push(header, rest.join("\n"));
    }
    const variant = !input.small && input.model.variants && input.user.model.variant ? input.model.variants[input.user.model.variant] : {};
    const base = input.small ? ProviderTransform.smallOptions(input.model) : ProviderTransform.options({
      model: input.model,
      sessionID: input.sessionID,
      providerOptions: item.options
    });
    const options = mergeOptions(mergeOptions(mergeOptions(base, input.model.options), input.agent.options), variant);
    const messages = [...system.map(x => ({
      role: "system",
      content: x
    })), ...input.messages];
    const params = yield* plugin.trigger("chat.params", {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: item,
      message: input.user
    }, {
      temperature: input.model.capabilities.temperature ? input.agent.temperature ?? ProviderTransform.temperature(input.model) : undefined,
      topP: input.agent.topP ?? ProviderTransform.topP(input.model),
      topK: ProviderTransform.topK(input.model),
      maxOutputTokens: ProviderTransform.maxOutputTokens(input.model),
      options
    });
    const {
      headers
    } = yield* plugin.trigger("chat.headers", {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: item,
      message: input.user
    }, {
      headers: {}
    });
    const tools = resolveTools(input);

    // LiteLLM and some Anthropic proxies require the tools parameter to be present
    // when message history contains tool calls, even if no tools are being used.
    // Add a dummy tool that is never called to satisfy this validation.
    // This is enabled for:
    // 1. Providers with "litellm" in their ID or API ID (auto-detected)
    // 2. Providers with explicit "litellmProxy: true" option (opt-in for custom gateways)
    const isLiteLLMProxy = item.options?.["litellmProxy"] === true || input.model.providerID.toLowerCase().includes("litellm") || input.model.api.id.toLowerCase().includes("litellm");

    // LiteLLM/Bedrock rejects requests where the message history contains tool
    // calls but no tools param is present. When there are no active tools (e.g.
    // during compaction), inject a stub tool to satisfy the validation requirement.
    // The stub description explicitly tells the model not to call it.
    if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
      tools["_noop"] = tool({
        description: "Do not call this tool. It exists only for API compatibility and must never be invoked.",
        inputSchema: jsonSchema({
          type: "object",
          properties: {
            reason: {
              type: "string",
              description: "Unused"
            }
          }
        }),
        execute: async () => ({
          output: "",
          title: "",
          metadata: {}
        })
      });
    }
    const tracer = cfg.experimental?.openTelemetry ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer)) : undefined;
    const telemetryTracer = tracer ? new Proxy(tracer, {
      get(target, prop, receiver) {
        if (prop !== "startSpan") return Reflect.get(target, prop, receiver);
        return (...args) => {
          const span = target.startSpan(...args);
          span.setAttribute("session.id", input.sessionID);
          return span;
        };
      }
    }) : undefined;
    const opencodeProjectID = input.model.providerID.startsWith("opencode") ? (yield* InstanceState.context).project.id : undefined;
    return streamText({
      onError(error) {
        l.error("stream error", {
          error
        });
        // Diagnostic file logging: uncomment to capture full APICallError
        // structure to /tmp/cc-llm.log when launch-via-Finder discards
        // stdout/stderr. Useful for triaging intermittent network errors
        // without re-launching with CLOSEDCODE_REMOTE_DEBUG.
        // try {
        //   const fs = require("node:fs");
        //   const raw = error?.error ?? error;
        //   const detail = {
        //     ts: new Date().toISOString(),
        //     model: input.model?.id,
        //     providerID: input.model?.providerID,
        //     sessionID: input.sessionID,
        //     wrapperMessage: typeof error?.message === "string" ? error.message : undefined,
        //     errorName: raw?.name ?? raw?.constructor?.name,
        //     errorMessage: typeof raw?.message === "string" ? raw.message : undefined,
        //     url: raw?.url,
        //     statusCode: raw?.statusCode,
        //     responseHeaders: raw?.responseHeaders,
        //     responseBody: typeof raw?.responseBody === "string" ? raw.responseBody.slice(0, 800) : undefined,
        //     isRetryable: raw?.isRetryable,
        //     data: raw?.data,
        //     code: raw?.code ?? raw?.cause?.code,
        //     causeName: raw?.cause?.name ?? raw?.cause?.constructor?.name,
        //     causeMessage: typeof raw?.cause?.message === "string" ? raw.cause.message : undefined,
        //     causeErrno: raw?.cause?.errno,
        //     causeSyscall: raw?.cause?.syscall,
        //     causeAddress: raw?.cause?.address,
        //     causePort: raw?.cause?.port,
        //     causeStack: raw?.cause?.stack?.split("\n").slice(0, 6).join("\n"),
        //     stack: raw?.stack?.split("\n").slice(0, 8).join("\n"),
        //     inspectFallback: (() => {
        //       try { return require("node:util").inspect(error, { depth: 4, maxStringLength: 600 }).slice(0, 2000); }
        //       catch { return undefined; }
        //     })(),
        //   };
        //   fs.appendFileSync("/tmp/cc-llm.log", JSON.stringify(detail) + "\n");
        // } catch {}
      },
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase();
        if (lower !== failed.toolCall.toolName && tools[lower]) {
          l.info("repairing tool call", {
            tool: failed.toolCall.toolName,
            repaired: lower
          });
          return {
            ...failed.toolCall,
            toolName: lower
          };
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message
          }),
          toolName: "invalid"
        };
      },
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      providerOptions: ProviderTransform.providerOptions(input.model, params.options),
      activeTools: Object.keys(tools).filter(x => x !== "invalid"),
      tools,
      toolChoice: input.toolChoice,
      maxOutputTokens: params.maxOutputTokens,
      abortSignal: input.abort,
      headers: {
        ...(input.model.providerID.startsWith("opencode") ? {
          "x-closedcode-project": opencodeProjectID,
          "x-closedcode-session": input.sessionID,
          "x-closedcode-request": input.user.id,
          "x-closedcode-client": Flag.CLOSEDCODE_CLIENT,
          "User-Agent": `opencode/${InstallationVersion}`
        } : {
          "x-session-affinity": input.sessionID,
          ...(input.parentSessionID ? {
            "x-parent-session-id": input.parentSessionID
          } : {}),
          "User-Agent": `closedcode/${InstallationVersion}`
        }),
        ...input.model.headers,
        ...headers
      },
      // ai-sdk retries any error wrapped with isRetryable (which covers
      // fetch failures including EHOSTUNREACH / ECONNRESET). Default to 2
      // attempts so transient network blips like Wi-Fi reassociation, sleep
      // wake, or macOS Local Network Privacy intermittently re-asking don't
      // surface to the user as a fatal "Cannot connect to API".
      maxRetries: input.retries ?? 2,
      messages,
      model: wrapLanguageModel({
        model: language,
        middleware: [{
          specificationVersion: "v3",
          async transformParams(args) {
            if (args.type === "stream") {
              args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options);
            }
            return args.params;
          }
        }]
      }),
      experimental_telemetry: {
        isEnabled: cfg.experimental?.openTelemetry,
        functionId: "session.llm",
        tracer: telemetryTracer,
        metadata: {
          userId: cfg.username ?? "unknown",
          sessionId: input.sessionID
        }
      }
    });
  });
  const stream = input => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
    const ctrl = yield* Effect.acquireRelease(Effect.sync(() => new AbortController()), ctrl => Effect.sync(() => ctrl.abort()));
    const result = yield* run({
      ...input,
      abort: ctrl.signal
    });
    return Stream.fromAsyncIterable(result.fullStream, e => e instanceof Error ? e : new Error(String(e)));
  })));
  return Service.of({
    stream
  });
}));
export const layer = live.pipe(Layer.provide(Permission.defaultLayer));
export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(Config.defaultLayer), Layer.provide(Provider.defaultLayer), Layer.provide(Plugin.defaultLayer)));
function resolveTools(input) {
  const disabled = Permission.disabled(Object.keys(input.tools), Permission.merge(input.agent.permission, input.permission ?? []));
  return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k));
}

// Check if messages contain any tool-call content
// Used to determine if a dummy tool should be added for LiteLLM proxy compatibility
export function hasToolCalls(messages) {
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type === "tool-call" || part.type === "tool-result") return true;
    }
  }
  return false;
}
export * as LLM from "./llm.js";
