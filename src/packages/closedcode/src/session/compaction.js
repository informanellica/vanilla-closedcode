/**
 * @file Session compaction: summarizes older conversation turns into an anchored
 * Markdown summary, prunes stale tool output to reclaim context space, and
 * (optionally) auto-continues the session after compacting on overflow.
 */
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import * as Session from "./session.js";
import { SessionID, MessageID, PartID } from "./schema.js";
import { Provider } from "#provider/provider.js";
import { MessageV2 } from "./message-v2.js";
import z from "zod";
import { Token } from "#util/token.js";
import * as Log from "core/util/log";
import { SessionProcessor } from "./processor.js";
import { Agent } from "#agent/agent.js";
import { Plugin } from "#plugin/index.js";
import { Config } from "#config/config.js";
import { NotFoundError } from "#storage/storage.js";
import { ModelID, ProviderID } from "#provider/schema.js";
import { Effect, Layer, Context, Schema } from "effect";
import * as DateTime from "effect/DateTime";
import { InstanceState } from "#effect/instance-state.js";
import { isOverflow as overflow, usable } from "./overflow.js";
import { makeRuntime } from "#effect/run-service.js";
import { fn } from "#util/fn.js";
import { EventV2 } from "#v2/event.js";
import { SessionEvent } from "#v2/session-event.js";
const log = Log.create({
  service: "session.compaction"
});
export const Event = {
  Compacted: BusEvent.define("session.compacted", Schema.Struct({
    sessionID: SessionID
  }))
};
export const PRUNE_MINIMUM = 20_000;
export const PRUNE_PROTECT = 40_000;
const TOOL_OUTPUT_MAX_CHARS = 2_000;
const PRUNE_PROTECTED_TOOLS = ["skill"];
const DEFAULT_TAIL_TURNS = 2;
const MIN_PRESERVE_RECENT_TOKENS = 2_000;
const MAX_PRESERVE_RECENT_TOKENS = 8_000;
const SUMMARY_TEMPLATE = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;
/**
 * Concatenate the trimmed text parts of a message into a single summary string.
 * @param {Object} message - A message with a `parts` array.
 * @returns {string} The joined non-empty text, or undefined when there is none.
 */
function summaryText(message) {
  const text = message.parts.filter(part => part.type === "text").map(part => part.text.trim()).filter(Boolean).join("\n\n").trim();
  return text || undefined;
}
/**
 * Find the prior completed compactions in a message list: each is an assistant
 * summary message that finished without error, paired with the index of the
 * user (compaction) message that triggered it.
 * @param {Array} messages - Ordered session messages, each `{ info, parts }`.
 * @returns {Array} Items `{ userIndex, assistantIndex, summary }` for every completed compaction.
 */
function completedCompactions(messages) {
  const users = new Map();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.info.role !== "user") continue;
    if (!msg.parts.some(part => part.type === "compaction")) continue;
    users.set(msg.info.id, i);
  }
  return messages.flatMap((msg, assistantIndex) => {
    if (msg.info.role !== "assistant") return [];
    if (!msg.info.summary || !msg.info.finish || msg.info.error) return [];
    const userIndex = users.get(msg.info.parentID);
    if (userIndex === undefined) return [];
    return [{
      userIndex,
      assistantIndex,
      summary: summaryText(msg)
    }];
  });
}
/**
 * Compose the compaction prompt: an anchor instruction (create-new vs
 * update-existing), the fixed summary template, and any plugin-supplied context.
 * @param {Object} input - `{ previousSummary, context }` where previousSummary may be undefined and context is an array of extra strings.
 * @returns {string} The full prompt text sent to the compaction model.
 */
function buildPrompt(input) {
  const anchor = input.previousSummary ? ["Update the anchored summary below using the conversation history above.", "Preserve still-true details, remove stale details, and merge in the new facts.", "<previous-summary>", input.previousSummary, "</previous-summary>"].join("\n") : "Create a new anchored summary from the conversation history above.";
  return [anchor, SUMMARY_TEMPLATE, ...input.context].join("\n\n");
}
/**
 * Compute the token budget reserved for preserving recent turns: the configured
 * value if set, otherwise 25% of usable context clamped to the min/max bounds.
 * @param {Object} input - `{ cfg, model }` config and model used to size the budget.
 * @returns {number} The token budget for recent-turn preservation.
 */
function preserveRecentBudget(input) {
  return input.cfg.compaction?.preserve_recent_tokens ?? Math.min(MAX_PRESERVE_RECENT_TOKENS, Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)));
}
/**
 * Split a message list into conversational turns, where each turn starts at a
 * non-compaction user message and ends at the next turn's start (or list end).
 * @param {Array} messages - Ordered session messages, each `{ info, parts }`.
 * @returns {Array} Turn descriptors `{ start, end, id }` (half-open [start, end) indices).
 */
function turns(messages) {
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.info.role !== "user") continue;
    if (msg.parts.some(part => part.type === "compaction")) continue;
    result.push({
      start: i,
      end: messages.length,
      id: msg.info.id
    });
  }
  for (let i = 0; i < result.length - 1; i++) {
    result[i].end = result[i + 1].start;
  }
  return result;
}
/**
 * Find the earliest split point inside a single turn whose suffix
 * `[start, turn.end)` fits within the remaining token budget, so part of an
 * oversized turn can still be preserved in the tail.
 * @param {Object} input - `{ turn, messages, model, budget, estimate }` with the turn to split, full message list, model, remaining token budget, and an estimate Effect-fn.
 * @returns {Effect} An Effect yielding `{ start, id }` for the chosen split, or undefined if none fits.
 */
function splitTurn(input) {
  return Effect.gen(function* () {
    if (input.budget <= 0) return undefined;
    if (input.turn.end - input.turn.start <= 1) return undefined;
    for (let start = input.turn.start + 1; start < input.turn.end; start++) {
      const size = yield* input.estimate({
        messages: input.messages.slice(start, input.turn.end),
        model: input.model
      });
      if (size > input.budget) continue;
      return {
        start,
        id: input.messages[start].info.id
      };
    }
    return undefined;
  });
}
/** Effect service tag for the session-compaction API (isOverflow/prune/process/create). */
export class Service extends Context.Service()("@closedcode/SessionCompaction") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const config = yield* Config.Service;
  const session = yield* Session.Service;
  const agents = yield* Agent.Service;
  const plugin = yield* Plugin.Service;
  const processors = yield* SessionProcessor.Service;
  const provider = yield* Provider.Service;
  /**
   * Determine whether the given token usage overflows the model's usable
   * context, using the current config.
   * @param {Object} input - `{ tokens, model }` token counts and target model.
   * @returns {Effect} An Effect yielding a boolean (true when over the limit).
   */
  const isOverflow = Effect.fn("SessionCompaction.isOverflow")(function* (input) {
    return overflow({
      cfg: yield* config.get(),
      tokens: input.tokens,
      model: input.model
    });
  });
  /**
   * Estimate the token size of a set of messages by converting them to model
   * messages and measuring the serialized JSON.
   * @param {Object} input - `{ messages, model }` messages and target model.
   * @returns {Effect} An Effect yielding the estimated token count.
   */
  const estimate = Effect.fn("SessionCompaction.estimate")(function* (input) {
    const msgs = yield* MessageV2.toModelMessagesEffect(input.messages, input.model);
    return Token.estimate(JSON.stringify(msgs));
  });
  /**
   * Choose which recent turns to keep verbatim as the "tail" (within the
   * preserve-recent budget) and which prefix becomes the "head" to summarize.
   * Walks recent turns newest-first, fitting whole turns and splitting the
   * boundary turn when only part of it fits.
   * @param {Object} input - `{ messages, cfg, model }` filtered messages, config, and target model.
   * @returns {Effect} An Effect yielding `{ head, tail_start_id }` where head is the prefix to compact and tail_start_id is the first kept message id (or undefined when nothing is split off).
   */
  const select = Effect.fn("SessionCompaction.select")(function* (input) {
    const limit = input.cfg.compaction?.tail_turns ?? DEFAULT_TAIL_TURNS;
    if (limit <= 0) return {
      head: input.messages,
      tail_start_id: undefined
    };
    const budget = preserveRecentBudget({
      cfg: input.cfg,
      model: input.model
    });
    const all = turns(input.messages);
    if (!all.length) return {
      head: input.messages,
      tail_start_id: undefined
    };
    const recent = all.slice(-limit);
    const sizes = yield* Effect.forEach(recent, turn => estimate({
      messages: input.messages.slice(turn.start, turn.end),
      model: input.model
    }), {
      concurrency: 1
    });
    let total = 0;
    let keep;
    for (let i = recent.length - 1; i >= 0; i--) {
      const turn = recent[i];
      const size = sizes[i];
      if (total + size <= budget) {
        total += size;
        keep = {
          start: turn.start,
          id: turn.id
        };
        continue;
      }
      const remaining = budget - total;
      const split = yield* splitTurn({
        messages: input.messages,
        turn,
        model: input.model,
        budget: remaining,
        estimate
      });
      if (split) keep = split;else if (!keep) log.info("tail fallback", {
        budget,
        size,
        total
      });
      break;
    }
    if (!keep || keep.start === 0) return {
      head: input.messages,
      tail_start_id: undefined
    };
    return {
      head: input.messages.slice(0, keep.start),
      tail_start_id: keep.id
    };
  });

  /**
   * Reclaim context space by marking the output of older completed tool calls
   * as compacted. Walks the session's messages newest-first, protects the most
   * recent PRUNE_PROTECT tokens of tool output (and protected tool types), and
   * only prunes when at least PRUNE_MINIMUM tokens can be freed. No-op when
   * pruning is disabled in config.
   * @param {Object} input - `{ sessionID }` the session to prune.
   * @returns {Effect} An Effect that performs the pruning side effects (no value).
   */
  // goes backwards through parts until there are PRUNE_PROTECT tokens worth of tool
  // calls, then erases output of older tool calls to free context space
  const prune = Effect.fn("SessionCompaction.prune")(function* (input) {
    const cfg = yield* config.get();
    if (!cfg.compaction?.prune) return;
    log.info("pruning");
    const msgs = yield* session.messages({
      sessionID: input.sessionID
    }).pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed(undefined)));
    if (!msgs) return;
    let total = 0;
    let pruned = 0;
    const toPrune = [];
    let turns = 0;
    loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
      const msg = msgs[msgIndex];
      if (msg.info.role === "user") turns++;
      if (turns < 2) continue;
      if (msg.info.role === "assistant" && msg.info.summary) break loop;
      for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
        const part = msg.parts[partIndex];
        if (part.type !== "tool") continue;
        if (part.state.status !== "completed") continue;
        if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue;
        if (part.state.time.compacted) break loop;
        const estimate = Token.estimate(part.state.output);
        total += estimate;
        if (total <= PRUNE_PROTECT) continue;
        pruned += estimate;
        toPrune.push(part);
      }
    }
    log.info("found", {
      pruned,
      total
    });
    if (pruned > PRUNE_MINIMUM) {
      for (const part of toPrune) {
        if (part.state.status === "completed") {
          part.state.time.compacted = Date.now();
          yield* session.updatePart(part);
        }
      }
      log.info("pruned", {
        count: toPrune.length
      });
    }
  });
  /**
   * Run a compaction pass for a pending compaction (user) message: select the
   * head to summarize, build the prompt, stream the summary from the compaction
   * model, persist the resulting assistant summary message, and on overflow
   * optionally rewind to replay the last real user turn. When auto and the
   * model returns "continue", appends a follow-up/replay user message so the
   * session resumes. Publishes Event.Compacted on success.
   * @param {Object} input - `{ sessionID, parentID, messages, auto, overflow }` describing the compaction request and current message list.
   * @returns {Effect} An Effect yielding the processor result ("continue"/"stop"/"compact"-derived terminal value).
   */
  const processCompaction = Effect.fn("SessionCompaction.process")(function* (input) {
    const parent = input.messages.findLast(m => m.info.id === input.parentID);
    if (!parent || parent.info.role !== "user") {
      throw new Error(`Compaction parent must be a user message: ${input.parentID}`);
    }
    const userMessage = parent.info;
    const compactionPart = parent.parts.find(part => part.type === "compaction");
    let messages = input.messages;
    let replay;
    if (input.overflow) {
      const idx = input.messages.findIndex(m => m.info.id === input.parentID);
      for (let i = idx - 1; i >= 0; i--) {
        const msg = input.messages[i];
        if (msg.info.role === "user" && !msg.parts.some(p => p.type === "compaction")) {
          replay = {
            info: msg.info,
            parts: msg.parts
          };
          messages = input.messages.slice(0, i);
          break;
        }
      }
      const hasContent = replay && messages.some(m => m.info.role === "user" && !m.parts.some(p => p.type === "compaction"));
      if (!hasContent) {
        replay = undefined;
        messages = input.messages;
      }
    }
    const agent = yield* agents.get("compaction");
    const model = agent.model ? yield* provider.getModel(agent.model.providerID, agent.model.modelID) : yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID);
    const cfg = yield* config.get();
    const history = compactionPart && messages.at(-1)?.info.id === input.parentID ? messages.slice(0, -1) : messages;
    const prior = completedCompactions(history);
    const hidden = new Set(prior.flatMap(item => [item.userIndex, item.assistantIndex]));
    const previousSummary = prior.at(-1)?.summary;
    const selected = yield* select({
      messages: history.filter((_, index) => !hidden.has(index)),
      cfg,
      model
    });
    // Allow plugins to inject context or replace compaction prompt.
    const compacting = yield* plugin.trigger("experimental.session.compacting", {
      sessionID: input.sessionID
    }, {
      context: [],
      prompt: undefined
    });
    const nextPrompt = compacting.prompt ?? buildPrompt({
      previousSummary,
      context: compacting.context
    });
    const msgs = structuredClone(selected.head);
    yield* plugin.trigger("experimental.chat.messages.transform", {}, {
      messages: msgs
    });
    const modelMessages = yield* MessageV2.toModelMessagesEffect(msgs, model, {
      stripMedia: true,
      toolOutputMaxChars: TOOL_OUTPUT_MAX_CHARS
    });
    const ctx = yield* InstanceState.context;
    const msg = {
      id: MessageID.ascending(),
      role: "assistant",
      parentID: input.parentID,
      sessionID: input.sessionID,
      mode: "compaction",
      agent: "compaction",
      variant: userMessage.model.variant,
      summary: true,
      path: {
        cwd: ctx.directory,
        root: ctx.worktree
      },
      cost: 0,
      tokens: {
        output: 0,
        input: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0
        }
      },
      modelID: model.id,
      providerID: model.providerID,
      time: {
        created: Date.now()
      }
    };
    yield* session.updateMessage(msg);
    const processor = yield* processors.create({
      assistantMessage: msg,
      sessionID: input.sessionID,
      model
    });
    const result = yield* processor.process({
      user: userMessage,
      agent,
      sessionID: input.sessionID,
      tools: {},
      system: [],
      messages: [...modelMessages, {
        role: "user",
        content: [{
          type: "text",
          text: nextPrompt
        }]
      }],
      model
    });
    if (result === "compact") {
      processor.message.error = new MessageV2.ContextOverflowError({
        message: replay ? "Conversation history too large to compact - exceeds model context limit" : "Session too large to compact - context exceeds model limit even after stripping media"
      }).toObject();
      processor.message.finish = "error";
      yield* session.updateMessage(processor.message);
      return "stop";
    }
    if (compactionPart && selected.tail_start_id && compactionPart.tail_start_id !== selected.tail_start_id) {
      yield* session.updatePart({
        ...compactionPart,
        tail_start_id: selected.tail_start_id
      });
    }
    if (result === "continue" && input.auto) {
      if (replay) {
        const original = replay.info;
        const replayMsg = yield* session.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: input.sessionID,
          time: {
            created: Date.now()
          },
          agent: original.agent,
          model: original.model,
          format: original.format,
          tools: original.tools,
          system: original.system
        });
        for (const part of replay.parts) {
          if (part.type === "compaction") continue;
          const replayPart = part.type === "file" && MessageV2.isMedia(part.mime) ? {
            type: "text",
            text: `[Attached ${part.mime}: ${part.filename ?? "file"}]`
          } : part;
          yield* session.updatePart({
            ...replayPart,
            id: PartID.ascending(),
            messageID: replayMsg.id,
            sessionID: input.sessionID
          });
        }
      }
      if (!replay) {
        const info = yield* provider.getProvider(userMessage.model.providerID);
        if ((yield* plugin.trigger("experimental.compaction.autocontinue", {
          sessionID: input.sessionID,
          agent: userMessage.agent,
          model: yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID),
          provider: {
            source: info.source,
            info,
            options: info.options
          },
          message: userMessage,
          overflow: input.overflow === true
        }, {
          enabled: true
        })).enabled) {
          const continueMsg = yield* session.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID: input.sessionID,
            time: {
              created: Date.now()
            },
            agent: userMessage.agent,
            model: userMessage.model
          });
          const text = (input.overflow ? "The previous request exceeded the provider's size limit due to large media attachments. The conversation was compacted and media files were removed from context. If the user was asking about attached images or files, explain that the attachments were too large to process and suggest they try again with smaller or fewer files.\n\n" : "") + "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.";
          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: continueMsg.id,
            sessionID: input.sessionID,
            type: "text",
            // Internal marker for auto-compaction followups so provider plugins
            // can distinguish them from manual post-compaction user prompts.
            // This is not a stable plugin contract and may change or disappear.
            metadata: {
              compaction_continue: true
            },
            synthetic: true,
            text,
            time: {
              start: Date.now(),
              end: Date.now()
            }
          });
        }
      }
    }
    if (processor.message.error) return "stop";
    if (result === "continue") {
      const summary = summaryText((yield* session.messages({
        sessionID: input.sessionID
      })).find(item => item.info.id === msg.id) ?? {
        info: msg,
        parts: []
      });
      EventV2.run(SessionEvent.Compaction.Ended.Sync, {
        sessionID: input.sessionID,
        timestamp: DateTime.makeUnsafe(Date.now()),
        text: summary ?? "",
        include: selected.tail_start_id
      });
      yield* bus.publish(Event.Compacted, {
        sessionID: input.sessionID
      });
    }
    return result;
  });
  /**
   * Begin a compaction by writing a new user message that carries a compaction
   * part (recording auto/overflow), and emit the Compaction.Started event. The
   * actual summarization happens later when this message is processed.
   * @param {Object} input - `{ sessionID, agent, model, auto, overflow }` for the new compaction message.
   * @returns {Effect} An Effect that performs the message/part writes and event emission.
   */
  const create = Effect.fn("SessionCompaction.create")(function* (input) {
    const msg = yield* session.updateMessage({
      id: MessageID.ascending(),
      role: "user",
      model: input.model,
      sessionID: input.sessionID,
      agent: input.agent,
      time: {
        created: Date.now()
      }
    });
    yield* session.updatePart({
      id: PartID.ascending(),
      messageID: msg.id,
      sessionID: msg.sessionID,
      type: "compaction",
      auto: input.auto,
      overflow: input.overflow
    });
    EventV2.run(SessionEvent.Compaction.Started.Sync, {
      sessionID: input.sessionID,
      timestamp: DateTime.makeUnsafe(Date.now()),
      reason: input.auto ? "auto" : "manual"
    });
  });
  return Service.of({
    isOverflow,
    prune,
    process: processCompaction,
    create
  });
}));
export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(Provider.defaultLayer), Layer.provide(Session.defaultLayer), Layer.provide(SessionProcessor.defaultLayer), Layer.provide(Agent.defaultLayer), Layer.provide(Plugin.defaultLayer), Layer.provide(Bus.layer), Layer.provide(Config.defaultLayer)));
const {
  runPromise
} = makeRuntime(Service, defaultLayer);
/**
 * Promise wrapper around the compaction service's overflow check.
 * @param {Object} input - `{ tokens, model }` token counts and target model.
 * @returns {Promise<boolean>} Resolves true when token usage overflows usable context.
 */
export async function isOverflow(input) {
  return runPromise(svc => svc.isOverflow(input));
}
/**
 * Promise wrapper around the compaction service's prune operation.
 * @param {Object} input - `{ sessionID }` the session to prune.
 * @returns {Promise<void>} Resolves when pruning completes.
 */
export async function prune(input) {
  return runPromise(svc => svc.prune(input));
}
/**
 * Validated entry point that starts a new compaction for a session.
 * Validates input against the schema, then runs the service's create method.
 * @param {Object} input - `{ sessionID, agent, model: { providerID, modelID }, auto, overflow? }`.
 * @returns {Promise<void>} Resolves when the compaction message is created.
 */
export const create = fn(z.object({
  sessionID: SessionID.zod,
  agent: z.string(),
  model: z.object({
    providerID: ProviderID.zod,
    modelID: ModelID.zod
  }),
  auto: z.boolean(),
  overflow: z.boolean().optional()
}), input => runPromise(svc => svc.create(input)));
export * as SessionCompaction from "./compaction.js";