# Message Shape

Problem:

- stored messages need enough data to replay and resume a session later
- prompt hooks often just want to append a synthetic user/assistant message
- today that means faking ids, timestamps, and request metadata

## Option 1: Two Message Shapes

Keep `User` / `Assistant` for stored history, but clean them up.

User shape:

| Field | Type | Required |
|-------|------|----------|
| `role` | `"user"` | yes |
| `time.created` | number | yes |
| `request.agent` | string | yes |
| `request.model` | ModelRef | yes |
| `request.variant` | string | no |
| `request.format` | OutputFormat | no |
| `request.system` | string | no |
| `request.tools` | `{ [name]: boolean }` | no |

Assistant shape:

| Field | Type | Required |
|-------|------|----------|
| `role` | `"assistant"` | yes |
| `run.agent` | string | yes |
| `run.model` | ModelRef | yes |
| `run.path.cwd` | string | yes |
| `run.path.root` | string | yes |
| `usage.cost` | number | yes |
| `usage.tokens` | Tokens | yes |
| `result.finish` | string | no |
| `result.error` | Error | no |
| `result.structured` | any | no |
| `result.kind` | `"reply"` or `"summary"` | yes |

Add a separate transient `PromptMessage` for prompt surgery.

PromptMessage shape:

| Field | Type | Required |
|-------|------|----------|
| `role` | `"user"` or `"assistant"` | yes |
| `parts` | array of PromptPart | yes |

Plugin hook example:

```js
prompt.push({
  role: "user",
  parts: [{ type: "text", text: "Summarize the tool output above and continue." }],
})
```

Tradeoff: prompt hooks get easy lightweight messages, but there are now two message shapes.

## Option 2: Prompt Mutators

Keep `User` / `Assistant` as the stored history model.

Prompt hooks do not build messages directly. The runtime gives them prompt mutators.

PromptEditor methods:

| Method | Parameters |
|--------|-----------|
| `append(input)` | `input: { role, parts }` |
| `prepend(input)` | `input: { role, parts }` |
| `appendTo(target, parts)` | `target: "last-user"` or `"last-assistant"`, `parts: [PromptPart]` |
| `insertAfter(messageID, input)` | `messageID: string`, `input: { role, parts }` |
| `insertBefore(messageID, input)` | `messageID: string`, `input: { role, parts }` |

Plugin hook examples:

```js
prompt.append({
  role: "user",
  parts: [{ type: "text", text: "Summarize the tool output above and continue." }],
})
```

```js
prompt.appendTo("last-user", [{ type: "text", text: BUILD_SWITCH }])
```

Tradeoff: avoids a second full message type and avoids fake ids/timestamps, but moves more magic into the hook API.

## Option 3: Separate Turn State

Move execution settings out of `User` and into a separate turn/request object.

Turn shape:

| Field | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `request.agent` | string | yes |
| `request.model` | ModelRef | yes |
| `request.variant` | string | no |
| `request.format` | OutputFormat | no |
| `request.system` | string | no |
| `request.tools` | `{ [name]: boolean }` | no |

User shape (option 3):

| Field | Type | Required |
|-------|------|----------|
| `role` | `"user"` | yes |
| `turnID` | string | yes |
| `time.created` | number | yes |

Assistant shape (option 3):

| Field | Type | Required |
|-------|------|----------|
| `role` | `"assistant"` | yes |
| `turnID` | string | yes |
| `usage.cost` | number | yes |
| `usage.tokens` | Tokens | yes |
| `result.finish` | string | no |
| `result.error` | Error | no |
| `result.structured` | any | no |
| `result.kind` | `"reply"` or `"summary"` | yes |

Examples:

```js
const turn = {
  request: {
    agent: "build",
    model: { providerID: "openai", modelID: "gpt-5" },
  },
}
```

```js
const msg = {
  role: "user",
  turnID: turn.id,
  parts: [{ type: "text", text: "Summarize the tool output above and continue." }],
}
```

Tradeoff: stored messages get much smaller and cleaner, but replay now has to join messages with turn state and prompt hooks still need a way to pick which turn they belong to.
