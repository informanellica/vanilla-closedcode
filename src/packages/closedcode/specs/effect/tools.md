# Tool migration

Practical reference for the current tool-migration state in `packages/closedcode`.

## Status

`Tool.Def.execute` and `Tool.Info.init` already return `Effect` on this branch, and the built-in tool surface is now largely on the target shape.

The current exported tools in `src/tool` all use `Tool.define(...)` with Effect-based initialization, and nearly all of them already build their tool body with `Effect.gen(...)` and `Effect.fn(...)`.

So the remaining work is no longer "convert tools to Effect at all". The remaining work is mostly:

1. remove Promise and raw platform bridges inside individual tool bodies
2. swap tool internals to Effect-native services like `AppFileSystem`, `HttpClient`, and `ChildProcessSpawner`
3. keep tests and callers aligned with `yield* info.init()` and real service graphs

## Current shape

`Tool.define(...)` is already the Effect-native helper here.

- `init` is an `Effect`
- `info.init()` returns an `Effect`
- `execute(...)` returns an `Effect`

That means a tool does not need a separate `Tool.defineEffect(...)` helper to count as migrated. A tool is effectively migrated when its init and execute path stay Effect-native, even if some internals still bridge to Promise-based or raw APIs.

## Tests

Tool tests should use the existing Effect helpers in `packages/closedcode/test/lib/effect.js`:

- Use `testEffect(...)` / `it.live(...)` instead of creating fake local wrappers around effectful tools.
- Yield the real tool export, then initialize it: `const info = yield* ReadTool`, `const tool = yield* info.init()`.
- Run tests inside a real instance with `provideTmpdirInstance(...)` or `provideInstance(tmpdirScoped(...))` so instance-scoped services resolve exactly as they do in production.

This keeps tool tests aligned with the production service graph and makes follow-up cleanup mostly mechanical.

## Exported tools

These exported tool definitions currently use `Tool.define(...)` in `src/tool`:

- [x] `apply_patch.js`
- [x] `bash.js`
- [x] `edit.js`
- [x] `glob.js`
- [x] `grep.js`
- [x] `invalid.js`
- [x] `lsp.js`
- [x] `plan.js`
- [x] `question.js`
- [x] `read.js`
- [x] `skill.js`
- [x] `task.js`
- [x] `todo.js`
- [x] `webfetch.js`
- [x] `websearch.js`
- [x] `write.js`

Notes:

- There is no current `ls.js` tool file on this branch.
- `truncate.js` is an Effect service used by tools, not a tool definition itself.
- `mcp-exa.js`, `external-directory.js`, and `schema.js` are support modules, not standalone tool definitions.

## Follow-up cleanup

Most exported tools are already on the intended Effect-native shape. The remaining cleanup is narrower than the old checklist implied.

Current spot cleanups worth tracking:

- [ ] `read.js` — still bridges to Node stream / `readline` helpers and Promise-based binary detection
- [ ] `bash.js` — already uses Effect child-process primitives; only keep tracking shell-specific platform bridges and parser/loading details as they come up
- [ ] `webfetch.js` — already uses `HttpClient`; remaining work is limited to smaller boundary helpers like HTML text extraction
- [ ] `file/ripgrep.js` — adjacent to tool migration; still has raw fs/process usage that affects `grep.js` and file-search routes
- [ ] `patch/index.js` — adjacent to tool migration; still has raw fs usage behind patch application

Notable items that are already effectively on the target path and do not need separate migration bullets right now:

- `apply_patch.js`
- `grep.js`
- `write.js`
- `websearch.js`
- `edit.js`

## Filesystem notes

Current raw fs users that still appear relevant here:

- `tool/read.js` — `fs.createReadStream`, `readline`
- `file/ripgrep.js` — `fs/promises`
- `patch/index.js` — `fs`, `fs/promises`
