/** @file HTTP API handlers for the "experimental" group: console org info/switching, tool listing, worktree management, global session listing, and MCP resources. */
import { Account } from "#account/account.js";
import { Agent } from "#agent/agent.js";
import { Config } from "#config/config.js";
import { InstanceState } from "#effect/instance-state.js";
import { MCP } from "#mcp/index.js";
import { Project } from "#project/project.js";
import { Session } from "#session/session.js";
import { ToolRegistry } from "#tool/registry.js";
import * as EffectZod from "#util/effect-zod.js";
import { Worktree } from "#worktree/index.js";
import { Effect, Option } from "effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
/**
 * Registers the handlers for the "experimental" HTTP API group on the instance API.
 * @type {Object}
 */
export const experimentalHandlers = HttpApiBuilder.group(InstanceHttpApi, "experimental", handlers => Effect.gen(function* () {
  const account = yield* Account.Service;
  const agents = yield* Agent.Service;
  const config = yield* Config.Service;
  const mcp = yield* MCP.Service;
  const project = yield* Project.Service;
  const registry = yield* ToolRegistry.Service;
  const worktreeSvc = yield* Worktree.Service;
  /**
   * Returns a summary of the current console state: managed providers, optional active org name, and the number of orgs the user can switch to.
   * @returns {Effect} Effect yielding an object with `consoleManagedProviders`, optional `activeOrgName`, and `switchableOrgCount`.
   */
  const getConsole = Effect.fn("ExperimentalHttpApi.console")(function* () {
    const [state, groups] = yield* Effect.all([config.getConsoleState(), account.orgsByAccount().pipe(Effect.orDie)], {
      concurrency: "unbounded"
    });
    return {
      consoleManagedProviders: state.consoleManagedProviders,
      ...(state.activeOrgName ? {
        activeOrgName: state.activeOrgName
      } : {}),
      switchableOrgCount: groups.reduce((count, group) => count + group.orgs.length, 0)
    };
  });
  /**
   * Lists every org across all accounts, flagging the one that is currently active.
   * @returns {Effect} Effect yielding an object with an `orgs` array of `{accountID, accountEmail, accountUrl, orgID, orgName, active}` entries.
   */
  const listConsoleOrgs = Effect.fn("ExperimentalHttpApi.consoleOrgs")(function* () {
    const [groups, active] = yield* Effect.all([account.orgsByAccount().pipe(Effect.orDie), account.active().pipe(Effect.orDie)], {
      concurrency: "unbounded"
    });
    const info = Option.getOrUndefined(active);
    return {
      orgs: groups.flatMap(group => group.orgs.map(org => ({
        accountID: group.account.id,
        accountEmail: group.account.email,
        accountUrl: group.account.url,
        orgID: org.id,
        orgName: org.name,
        active: !!info && info.id === group.account.id && info.active_org_id === org.id
      })))
    };
  });
  /**
   * Switches the active account/org to the requested pair, failing with BadRequest if the switch is rejected.
   * @param {Object} ctx - Handler context; `payload` carries `accountID` and `orgID`.
   * @returns {Effect} Effect yielding `true` on success or failing with HttpApiError.BadRequest.
   */
  const switchConsole = Effect.fn("ExperimentalHttpApi.consoleSwitch")(function* (ctx) {
    yield* account.use(ctx.payload.accountID, Option.some(ctx.payload.orgID)).pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))));
    return true;
  });
  /**
   * Lists the tools available for the requested provider/model under the default agent, with their JSON-schema parameters.
   * @param {Object} ctx - Handler context; `query.provider` and `query.model` select the provider and model.
   * @returns {Effect} Effect yielding an array of `{id, description, parameters}` tool descriptors.
   */
  const tool = Effect.fn("ExperimentalHttpApi.tool")(function* (ctx) {
    const list = yield* registry.tools({
      providerID: ctx.query.provider,
      modelID: ctx.query.model,
      agent: yield* agents.get(yield* agents.defaultAgent())
    });
    return list.map(item => ({
      id: item.id,
      description: item.description,
      parameters: EffectZod.toJsonSchema(item.parameters)
    }));
  });
  /**
   * Returns the list of all registered tool IDs.
   * @returns {Effect} Effect yielding an array of tool ID strings.
   */
  const toolIDs = Effect.fn("ExperimentalHttpApi.toolIDs")(function* () {
    return yield* registry.ids();
  });
  /**
   * Lists the worktree sandboxes belonging to the current instance's project.
   * @returns {Effect} Effect yielding the project's sandbox list.
   */
  const worktree = Effect.fn("ExperimentalHttpApi.worktree")(function* () {
    const ctx = yield* InstanceState.context;
    return yield* project.sandboxes(ctx.project.id);
  });
  /**
   * Creates a new worktree from the request payload.
   * @param {Object} ctx - Handler context; `payload` describes the worktree to create.
   * @returns {Effect} Effect yielding the created worktree.
   */
  const worktreeCreate = Effect.fn("ExperimentalHttpApi.worktreeCreate")(function* (ctx) {
    return yield* worktreeSvc.create(ctx.payload);
  });
  /**
   * Removes a worktree and deregisters its sandbox from the current project.
   * @param {Object} input - Handler context; `payload` carries the worktree spec including `directory`.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const worktreeRemove = Effect.fn("ExperimentalHttpApi.worktreeRemove")(function* (input) {
    const ctx = yield* InstanceState.context;
    yield* worktreeSvc.remove(input.payload);
    yield* project.removeSandbox(ctx.project.id, input.payload.directory);
    return true;
  });
  /**
   * Resets a worktree to a clean state from the request payload.
   * @param {Object} ctx - Handler context; `payload` identifies the worktree to reset.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const worktreeReset = Effect.fn("ExperimentalHttpApi.worktreeReset")(function* (ctx) {
    yield* worktreeSvc.reset(ctx.payload);
    return true;
  });
  /**
   * Lists sessions across all projects with pagination, emitting an `x-next-cursor` header when more results exist.
   * @param {Object} ctx - Handler context; `query` carries `limit` (default 100), `directory`, `roots`, `start`, `cursor`, `search`, and `archived` filters.
   * @returns {Effect} Effect yielding an HTTP JSON response with the page of sessions.
   */
  const session = Effect.fn("ExperimentalHttpApi.session")(function* (ctx) {
    const limit = ctx.query.limit ?? 100;
    const sessions = yield* Effect.promise(() => Array.fromAsync(Session.listGlobal({
      directory: ctx.query.directory,
      roots: ctx.query.roots,
      start: ctx.query.start,
      cursor: ctx.query.cursor,
      search: ctx.query.search,
      limit: limit + 1,
      archived: ctx.query.archived
    })));
    const list = sessions.length > limit ? sessions.slice(0, limit) : sessions;
    return HttpServerResponse.jsonUnsafe(list, {
      headers: sessions.length > limit && list.length > 0 ? {
        "x-next-cursor": String(list[list.length - 1].time.updated)
      } : undefined
    });
  });
  /**
   * Lists the resources exposed by the connected MCP servers.
   * @returns {Effect} Effect yielding the available MCP resources.
   */
  const resource = Effect.fn("ExperimentalHttpApi.resource")(function* () {
    return yield* mcp.resources();
  });
  return handlers.handle("console", getConsole).handle("consoleOrgs", listConsoleOrgs).handle("consoleSwitch", switchConsole).handle("tool", tool).handle("toolIDs", toolIDs).handle("worktree", worktree).handle("worktreeCreate", worktreeCreate).handle("worktreeRemove", worktreeRemove).handle("worktreeReset", worktreeReset).handle("session", session).handle("resource", resource);
}));