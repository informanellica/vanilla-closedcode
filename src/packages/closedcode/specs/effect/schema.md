# Schema migration

Practical reference for migrating data types in `packages/closedcode` from
Zod-first definitions to Effect Schema with Zod compatibility shims.

## Goal

Use Effect Schema as the source of truth for domain models, IDs, inputs,
outputs, and typed errors. Keep Zod available at existing HTTP, tool, and
compatibility boundaries by exposing a `.zod` static derived from the Effect
schema via `@/util/effect-zod`.

The long-term driver is `specs/effect/http-api.md` — once the HTTP server
moves to `@effect/platform`, every Schema-first DTO can flow through
`HttpApi` / `HttpRouter` without a zod translation layer, and the entire
`effect-zod` walker plus every `.zod` static can be deleted.

## Preferred shapes

### Data objects

Use `Schema.Class` for structured data.

```js
export class Info extends Schema.Class("Foo.Info")({
  id: FooID,
  name: Schema.String,
  enabled: Schema.Boolean,
}) {
  static readonly zod = zod(Info)
}
```

If the class cannot reference itself cleanly during initialization, use the
two-step `withStatics` pattern:

```js
export const Info = Schema.Struct({
  id: FooID,
  name: Schema.String,
}).pipe(withStatics((s) => ({ zod: zod(s) })))
```

### Errors

Use `Schema.TaggedErrorClass` for domain errors.

```js
export class NotFoundError extends Schema.TaggedErrorClass()("FooNotFoundError", {
  id: FooID,
}) {}
```

### IDs and branded leaf types

Keep branded/schema-backed IDs as Effect schemas and expose
`static readonly zod` for compatibility when callers still expect Zod.

### Refinements

Reuse named refinements instead of re-spelling `z.number().int().positive()`
in every schema. The `effect-zod` walker translates the Effect versions into
the corresponding zod methods, so JSON Schema output (`type: integer`,
`exclusiveMinimum`, `pattern`, `format: uuid`, …) is preserved.

```js
const PositiveInt = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))
const NonNegativeInt = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0))
const HexColor = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/))
```

See `test/util/effect-zod.test.js` for the full set of translated checks.

## Compatibility rule

During migration, route validators, tool parameters, and any existing
Zod-based boundary should consume the derived `.zod` schema instead of
maintaining a second hand-written Zod schema.

The default should be:

- Effect Schema owns the type
- `.zod` exists only as a compatibility surface
- new domain models should not start Zod-first unless there is a concrete
  boundary-specific need

## When Zod can stay

It is fine to keep a Zod-native schema temporarily when:

- the type is only used at an HTTP or tool boundary and is not reused elsewhere
- the validator depends on Zod-only transforms or behavior not yet covered by `zod()`
- the migration would force unrelated churn across a large call graph

When this happens, prefer leaving a short note or TODO rather than silently
creating a parallel schema source of truth.

## Escape hatches

The walker in `@/util/effect-zod` exposes two explicit escape hatches for
cases the pure-Schema path cannot express. Each one stays in the codebase
only as long as its upstream or local dependency requires it — inline
comments document when each can be deleted.

### `ZodOverride` annotation

Replaces the entire derivation with a hand-crafted zod schema. Used when:

- the target carries external `$ref` metadata (e.g.
  `config/model-id.js` points at `https://models.dev/...`)
- the target is a zod-only schema that cannot yet be expressed as Schema
  (e.g. `ConfigAgent.Info`, `Log.Level`)

### Local `DeepMutable<T>` in `config/config.js`

`Schema.Struct` produces `readonly` types. Some consumer code (notably the
`Config` service) mutates `Info` objects directly, so a readonly-stripping
utility is needed when casting the derived zod schema's output type.

`Types.DeepMutable` from effect-smol would be a drop-in, but it widens
`unknown` to `{}` in the fallback branch — a bug that affects any schema
using `Schema.Record(String, Schema.Unknown)`.

Tracked upstream as `effect:core/x228my`: "Types.DeepMutable widens unknown
to `{}`." Once that lands, the local `DeepMutable` copy can be deleted and
`Types.DeepMutable` used directly.

## Ordering

Migrate in this order:

1. Shared leaf models and `schema.js` files
2. Exported `Info`, `Input`, `Output`, and DTO types
3. Tagged domain errors
4. Service-local internal models
5. Route and tool boundary validators that can switch to `.zod`

This keeps shared types canonical first and makes boundary updates mostly
mechanical.

## Progress tracker

### `src/config/` ✅ complete

All of `packages/closedcode/src/config/` has been migrated. Files that still
import `z` do so only for local `ZodOverride` bridges or for `z.ZodType`
type annotations — the `export const <Info|Spec>` values are all Effect
Schema at source.

A file is considered "done" when:

- its exported schema values (`Info`, `Input`, `Event`, `Definition`, etc.)
  are authored as Effect Schema
- any remaining zod is either a derived compat bridge (via `zod()` /
  `zodObject()`), a `z.ZodType` type annotation, or a documented
  `ZodOverride` escape hatch — never a hand-written parallel source of truth

Files that meet this bar but still carry a compat bridge are checked off
with an inline note describing the bridge and what unblocks its removal.

- [x] skills, formatter, console-state, mcp, lsp, permission (leaves), model-id, command, plugin, provider
- [x] server, layout
- [x] keybinds
- [x] permission#Info
- [x] agent
- [x] config.js root

### `src/*/schema.js` leaf modules

These are the highest-priority next targets. Each is a small, self-contained
schema module with a clear domain.

- [x] `src/account/schema.js`
- [x] `src/control-plane/schema.js`
- [x] `src/permission/schema.js`
- [x] `src/project/schema.js`
- [x] `src/provider/schema.js`
- [x] `src/pty/schema.js`
- [x] `src/question/schema.js`
- [x] `src/session/schema.js`
- [x] `src/storage/schema.js`
- [x] `src/sync/schema.js`
- [x] `src/tool/schema.js`
- [x] `src/util/schema.js`

### Session domain

Major cluster. Message + event types flow through the SSE API and every SDK
output, so byte-identical SDK surface is critical.

Suggested order for this cluster, starting from the leaves that `session.js`
and the SSE/event surface depend on:

1. `src/session/schema.js` ✅ already migrated
2. `src/provider/schema.js` if `message-v2.js` still relies on zod-first IDs
3. `src/lsp/*` schema leaves needed by `LSP.Range`
4. `src/snapshot/*` leaves used by `Snapshot.FileDiff`
5. `src/session/message-v2.js`
6. `src/session/message.js`
7. `src/session/prompt.js`
8. `src/session/revert.js`
9. `src/session/summary.js`
10. `src/session/status.js`
11. `src/session/todo.js`
12. `src/session/session.js`
13. `src/session/compaction.js`

Dependency sketch:

```text
session.js
|- project/schema.js
|- control-plane/schema.js
|- permission/schema.js
|- snapshot/*
|- message-v2.js
|  |- provider/schema.js
|  |- lsp/*
|  |- snapshot/*
|  |- sync/index.js
|  `- bus/bus-event.js
|- sync/index.js
|- bus/bus-event.js
`- util/update-schema.js
```

Working rule for this cluster:

- migrate reusable leaf schemas and nested payload objects first
- migrate aggregate DTOs like `Session.Info` after their nested pieces exist as
  named Schema values
- leave zod-only event/update helpers in place temporarily when converting
  them would force unrelated churn across sync/bus boundaries

`message-v2.js` first-pass outline:

1. Schema-backed imports already available
   - `SessionID`, `MessageID`, `PartID`
   - `ProviderID`, `ModelID`
2. Local leaf objects to extract and migrate first
   - output format payloads
   - common part bases like `PartBase`
   - timestamp/range helper objects like `time.start/end`
   - file/source helper objects
   - token/cost/model helper objects
3. Part variants built from those leaves
   - `SnapshotPart`, `PatchPart`, `TextPart`, `ReasoningPart`
   - `FilePart`, `AgentPart`, `CompactionPart`, `SubtaskPart`
   - retry/step/tool related parts
4. Higher-level unions and DTOs
   - `FilePartSource`
   - part unions
   - message unions and assistant/user payloads
5. Errors and event payloads last
   - `NamedError.create(...)` shapes can stay temporarily if converting them to
     `Schema.TaggedErrorClass` would force unrelated churn
   - `SyncEvent.define(...)` and `BusEvent.define(...)` payloads can use
     derived `.zod` at remaining zod-based HTTP/OpenAPI boundaries

Possible later tightening after the Schema-first migration is stable:

- promote repeated opaque strings and timestamp numbers into branded/newtype
  leaf schemas where that adds domain value without changing the wire format

- [x] `src/session/compaction.js`
- [x] `src/session/message-v2.js`
- [x] `src/session/message.js`
- [x] `src/session/prompt.js`
- [x] `src/session/revert.js`
- [x] `src/session/session.js`
- [x] `src/session/status.js`
- [x] `src/session/summary.js`
- [x] `src/session/todo.js`

### Provider domain

- [x] `src/provider/auth.js`
- [x] `src/provider/models.js`
- [x] `src/provider/provider.js`

### Tool schemas

Each tool declares its parameters via a zod schema. Tools are consumed by
both the in-process runtime and the AI SDK's tool-calling layer, so the
emitted JSON Schema must stay byte-identical.

- [x] `src/tool/apply_patch.js`
- [x] `src/tool/bash.js`
- [x] `src/tool/edit.js`
- [x] `src/tool/glob.js`
- [x] `src/tool/grep.js`
- [x] `src/tool/invalid.js`
- [x] `src/tool/lsp.js`
- [x] `src/tool/plan.js`
- [x] `src/tool/question.js`
- [x] `src/tool/read.js`
- [x] `src/tool/registry.js`
- [x] `src/tool/skill.js`
- [x] `src/tool/task.js`
- [x] `src/tool/todo.js`
- [x] `src/tool/tool.js`
- [x] `src/tool/webfetch.js`
- [x] `src/tool/websearch.js`
- [x] `src/tool/write.js`

### HTTP route boundaries

Every file in `src/server/routes/express/` uses zod validators for
route inputs/outputs. Migrating these individually is the last step; most
will switch to `.zod` derived from the Schema-migrated domain types above,
which means touching them is largely mechanical once the domain side is
done.

- [ ] `src/server/error.js`
- [x] `src/server/event.js`
- [x] `src/server/projectors.js`
- [ ] `src/server/routes/control/index.js`
- [ ] `src/server/routes/control/workspace.js`
- [ ] `src/server/routes/global.js`
- [ ] `src/server/routes/instance/index.js`
- [ ] `src/server/routes/instance/config.js`
- [ ] `src/server/routes/instance/event.js`
- [ ] `src/server/routes/instance/experimental.js`
- [ ] `src/server/routes/instance/file.js`
- [ ] `src/server/routes/instance/mcp.js`
- [ ] `src/server/routes/instance/permission.js`
- [ ] `src/server/routes/instance/project.js`
- [ ] `src/server/routes/instance/provider.js`
- [ ] `src/server/routes/instance/pty.js`
- [ ] `src/server/routes/instance/question.js`
- [ ] `src/server/routes/instance/session.js`
- [ ] `src/server/routes/instance/sync.js`
- [ ] `src/server/routes/instance/tui.js`

The bigger prize for this group is the `@effect/platform` HTTP migration
described in `specs/effect/http-api.md`. Once that lands, every one of
these files changes shape entirely (`HttpApi.endpoint(...)` and friends),
so the Schema-first domain types become a prerequisite rather than a
sibling task.

### Everything else

Small / shared / control-plane / CLI. Mostly independent; can be done
piecewise.

- [ ] `src/acp/agent.js`
- [ ] `src/agent/agent.js`
- [x] `src/bus/bus-event.js`
- [ ] `src/bus/index.js`
- [ ] `src/cli/cmd/tui/config/tui-migrate.js`
- [ ] `src/cli/cmd/tui/config/tui-schema.js`
- [ ] `src/cli/cmd/tui/config/tui.js`
- [ ] `src/cli/cmd/tui/event.js`
- [ ] `src/cli/ui.js`
- [ ] `src/command/index.js`
- [x] `src/control-plane/adapters/worktree.js`
- [x] `src/control-plane/types.js`
- [x] `src/control-plane/workspace.js`
- [ ] `src/file/index.js`
- [ ] `src/file/ripgrep.js`
- [ ] `src/file/watcher.js`
- [ ] `src/format/index.js`
- [ ] `src/id/id.js`
- [ ] `src/ide/index.js`
- [ ] `src/installation/index.js`
- [ ] `src/lsp/client.js`
- [ ] `src/lsp/lsp.js`
- [ ] `src/mcp/auth.js`
- [ ] `src/patch/index.js`
- [ ] `src/project/project.js`
- [ ] `src/project/vcs.js`
- [ ] `src/pty/index.js`
- [ ] `src/skill/index.js`
- [ ] `src/snapshot/index.js`
- [ ] `src/storage/db.js`
- [ ] `src/storage/storage.js`
- [x] `src/sync/index.js` — public API (`SyncEvent.define`) is Schema-first; `payloads()` still derives zod for the remaining HTTP/OpenAPI boundary
- [ ] `src/util/fn.js`
- [ ] `src/util/log.js`
- [ ] `src/util/update-schema.js`
- [ ] `src/worktree/index.js`

### Do-not-migrate

- `src/util/effect-zod.js` — the walker itself. Stays zod-importing forever
  (it's what emits zod from Schema). Goes away only when the `.zod`
  compatibility layer is no longer needed anywhere.

## Notes

- Use `@/util/effect-zod` for all Schema → Zod conversion.
- Prefer one canonical schema definition. Avoid maintaining parallel Zod and
  Effect definitions for the same domain type.
- Keep the migration incremental. Converting the domain model first is more
  valuable than converting every boundary in the same change.
- Every migrated file should leave the generated SDK output (`packages/sdk/
openapi.json` and `packages/sdk/js/src/v2/gen/types.gen.js`) byte-identical
  unless the change is deliberately user-visible.
