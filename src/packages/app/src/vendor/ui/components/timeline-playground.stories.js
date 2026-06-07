import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=padding:8px;color:var(--text-weak);font-size:13px>File viewer stub`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style=font-size:10px;color:var(--text-weaker);line-height:1.4> • <!> • <!> message`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div style=font-size:10px;color:var(--text-on-critical-base);line-height:1.4>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div style="padding:0 12px 12px;display:flex;flex-direction:column;gap:6px"><div>Import session</div><div style=font-size:10px;color:var(--text-weaker);margin-bottom:2px>Replaces the current timeline with a \`closedcode export\` JSON file</div><div style=display:flex;flex-wrap:wrap;gap:4px><button>Import session</button><input type=file accept=.json,application/json style=display:none></div><div>User messages</div><div style=font-size:10px;color:var(--text-weaker);margin-bottom:2px>Creates a new turn (user + empty assistant)</div><div style=display:flex;flex-wrap:wrap;gap:4px></div><div style=display:flex;flex-wrap:wrap;gap:4px><button>Interrupt last</button></div><div style=margin-top:8px>Text and reasoning blocks</div><div style=font-size:10px;color:var(--text-weaker);margin-bottom:2px>Appends to the last turn's assistant parts</div><div style=display:flex;flex-wrap:wrap;gap:4px><button>reasoning</button></div><div style=margin-top:8px>Tool calls</div><div style=font-size:10px;color:var(--text-weaker);margin-bottom:2px>Appends to the last turn's assistant parts</div><div style=display:flex;flex-wrap:wrap;gap:4px></div><div style=margin-top:8px>Composite turns</div><div style=font-size:10px;color:var(--text-weaker);margin-bottom:2px>Creates complete user + assistant turns</div><div style=display:flex;flex-wrap:wrap;gap:4px><button>context group</button><button>full turn</button><button>kitchen sink</button></div><div style=margin-top:8px><button>Clear all`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div style="padding:0 12px 12px"><button style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-weak-base);background:var(--surface-base);cursor:pointer;font-size:11px;color:var(--text-base);margin-bottom:8px">Reset all`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div style=font-size:10px;color:var(--text-weaker);line-height:1.4>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<pre style="padding:8px;border-radius:4px;background:var(--surface-inset-base);border:1px solid var(--border-weak-base);font-size:11px;font-family:var(--font-family-mono);line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;color:var(--text-base)">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<pre style="padding:8px;border-radius:4px;background:var(--surface-inset-base);border:1px solid var(--border-weak-base);font-size:11px;font-family:var(--font-family-mono);line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;color:var(--text-base)">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div style="padding:0 12px 12px;display:flex;flex-direction:column;gap:8px"><button>Copy CSS to clipboard</button><button>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div role=log data-slot=session-turn-list style="display:flex;flex-direction:column;width:100%;padding:0 20px">`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div style="max-width:800px;margin:0 auto;padding:16px 0">`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div style="display:flex;height:calc(100vh - 48px);gap:0;overflow:hidden;margin:-24px"><style></style><div style="width:320px;min-width:320px;border-right:1px solid var(--border-weak-base);overflow:auto;background-color:var(--background-stronger);scrollbar-width:none"><div style="border-bottom:1px solid var(--border-weak-base)"><button style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:none;border:none;cursor:pointer;font-weight:500;font-size:13px;color:var(--text-strong)">Generate Messages<span></span></button></div><div style="border-bottom:1px solid var(--border-weak-base)"><button style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:none;border:none;cursor:pointer;font-weight:500;font-size:13px;color:var(--text-strong)">CSS Controls<span></span></button></div><div style="border-bottom:1px solid var(--border-weak-base)"><button style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:none;border:none;cursor:pointer;font-weight:500;font-size:13px;color:var(--text-strong)">Export CSS<span></span></button></div></div><div style=flex:1;overflow:auto;min-width:0;background-color:var(--background-stronger)>`),
  _tmpl$11 = /*#__PURE__*/_$template(`<button>`),
  _tmpl$12 = /*#__PURE__*/_$template(`<div style="padding:6px 0;display:flex;flex-direction:column;gap:8px">`),
  _tmpl$13 = /*#__PURE__*/_$template(`<div style=margin-bottom:4px><button style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:6px 0;background:none;border:none;border-bottom:1px solid var(--border-weaker-base);cursor:pointer;font-size:11px;font-weight:500;color:var(--text-base);text-transform:uppercase;letter-spacing:0.5px"><span style=font-size:10px>`),
  _tmpl$14 = /*#__PURE__*/_$template(`<div style=display:flex;flex-direction:column;gap:2px><div style=display:flex;justify-content:space-between;align-items:center><label style=font-size:11px;color:var(--text-base)></label><span style=font-size:11px;font-family:var(--font-family-mono);min-width:40px;text-align:right></span></div><input type=range style=width:100%;height:4px;accent-color:var(--text-interactive-base);cursor:pointer>`),
  _tmpl$15 = /*#__PURE__*/_$template(`<div>: <!> = `),
  _tmpl$16 = /*#__PURE__*/_$template(`<div style=display:flex;align-items:center;justify-content:center;height:400px;color:var(--text-weak);font-size:14px>Click a generator button or import a session`),
  _tmpl$17 = /*#__PURE__*/_$template(`<div style=width:100%>`);
import { createSignal, createMemo, createEffect, on, For, Show, batch } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { DataProvider } from "../context/data.js";
import { FileComponentProvider } from "../context/file.js";
import { SessionTurn } from "./session-turn.js";

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------
let seq = 0;
const uid = () => `pg-${++seq}-${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------
// Lorem ipsum content
// ---------------------------------------------------------------------------
const LOREM = ["Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.", "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.", "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.", "Cras justo odio, dapibus ut facilisis in, egestas eget quam. Vestibulum id ligula porta felis euismod semper."];

// ---------------------------------------------------------------------------
// User message variants
// ---------------------------------------------------------------------------
const USER_VARIANTS = {
  short: {
    label: "short",
    text: "Fix the bug in the login form",
    parts: []
  },
  medium: {
    label: "medium",
    text: "Can you update the session timeline component to support lazy loading? The current implementation loads everything eagerly which causes jank on large sessions.",
    parts: []
  },
  long: {
    label: "long",
    text: `I need you to refactor the message rendering pipeline. Currently the timeline renders all messages synchronously which blocks first paint. Here's what I want:

1. Implement virtual scrolling for the message list
2. Defer-mount older messages using requestAnimationFrame batching
3. Add content-visibility: auto to each turn container
4. Make sure the scroll-to-bottom behavior still works correctly after these changes

Please also add appropriate CSS containment hints and make sure we don't break the sticky header behavior for the session title.`,
    parts: []
  },
  "with @file": {
    label: "with @file",
    text: "Update @src/components/session-turn.js to fix the spacing issue between parts",
    parts: (() => {
      const id = `static-file-${Date.now()}`;
      return [{
        id,
        type: "file",
        mime: "text/plain",
        filename: "session-turn.js",
        url: "src/components/session-turn.js",
        source: {
          type: "file",
          path: "src/components/session-turn.js",
          text: {
            value: "@src/components/session-turn.js",
            start: 7,
            end: 38
          }
        }
      }];
    })()
  },
  "with @agent": {
    label: "with @agent",
    text: "Use @explore to find all CSS files related to the timeline, then fix the spacing",
    parts: (() => {
      return [{
        id: `static-agent-${Date.now()}`,
        type: "agent",
        name: "explore",
        source: {
          start: 4,
          end: 12
        }
      }];
    })()
  },
  "with image": {
    label: "with image",
    text: "Here's a screenshot of the bug I'm seeing",
    parts: (() => {
      // 1x1 blue pixel PNG as data URI for a realistic attachment
      const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      return [{
        id: `static-img-${Date.now()}`,
        type: "file",
        mime: "image/png",
        filename: "screenshot.png",
        url: pixel
      }];
    })()
  },
  "with file attachment": {
    label: "with file attachment",
    text: "Check this config file for issues",
    parts: (() => {
      return [{
        id: `static-attach-${Date.now()}`,
        type: "file",
        mime: "application/json",
        filename: "tsconfig.json",
        url: "data:application/json;base64,e30="
      }];
    })()
  },
  "multi attachment": {
    label: "multi attachment",
    text: "Look at these files and the screenshot, then fix the layout",
    parts: (() => {
      const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      return [{
        id: `static-multi-img-${Date.now()}`,
        type: "file",
        mime: "image/png",
        filename: "layout-bug.png",
        url: pixel
      }, {
        id: `static-multi-file-${Date.now()}`,
        type: "file",
        mime: "text/css",
        filename: "session-turn.css",
        url: "data:text/css;base64,LyogZW1wdHkgKi8="
      }, {
        id: `static-multi-ref-${Date.now()}`,
        type: "file",
        mime: "text/plain",
        filename: "session-turn.js",
        url: "src/components/session-turn.js",
        source: {
          type: "file",
          path: "src/components/session-turn.js",
          text: {
            value: "@src/components/session-turn.js",
            start: 0,
            end: 0
          }
        }
      }];
    })()
  }
};
const MARKDOWN_SAMPLES = {
  headings: `# Heading 1
## Heading 2
### Heading 3
#### Heading 4

Some paragraph text after headings.`,
  lists: `Here's a list of changes:

- First item with some explanation
- Second item that is a bit longer and wraps to the next line when the viewport is narrow
- Third item
  - Nested item A
  - Nested item B

1. Numbered first
2. Numbered second
3. Numbered third`,
  code: `Here's an inline \`variable\` reference and a code block:

\`\`\`typescript
export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

export function average(values: number[]) {
  if (values.length === 0) return 0
  return sum(values) / values.length
}
\`\`\`

And some text after the code block.`,
  mixed: `## Implementation Plan

I'll make the following changes:

1. **Update the schema** - Add new fields to the database model
2. **Create the API endpoint** - Handle validation and persistence
3. **Add frontend components** - Build the form and display views

Here's the key change:

\`\`\`typescript
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})
\`\`\`

> Note: This is a breaking change that requires a migration.

The migration will handle existing data by setting \`project_id\` to the default workspace.

---

For more details, see the [documentation](https://example.com/docs).`,
  table: `## Comparison

| Feature | Before | After |
|---------|--------|-------|
| Speed | 120ms | 45ms |
| Memory | 256MB | 128MB |
| Bundle | 1.2MB | 890KB |

The improvements are significant across all metrics.`,
  blockquote: `## Summary

> This is a blockquote that contains important information about the implementation approach.
>
> It spans multiple lines and contains **bold** and \`code\` elements.

The approach above was chosen for its simplicity.`,
  links: `Check out these resources:

- [SolidJS docs](https://solidjs.com)
- [TypeScript handbook](https://www.typescriptlang.org/docs/handbook)
- The API is at \`https://api.example.com/v2\`

You can also visit https://example.com/docs for more info.`,
  images: `## Screenshot

Here's what the output looks like:

![Alt text](https://via.placeholder.com/400x200)

And below is the final result.`
};
const REASONING_SAMPLES = [`**Analyzing the request**

The user wants to add a new feature to the session timeline. I need to understand the existing component structure first.

Let me look at the key files involved:
- \`session-turn.js\` handles individual turns
- \`message-part.js\` renders different part types
- The data flows through the \`DataProvider\` context`, `**Considering approaches**

I could either modify the existing SessionTurn component or create a wrapper. The wrapper approach is cleaner because it doesn't touch the core rendering logic.

The trade-off is that we'd need to pass additional props through, but that's acceptable for this use case.`, `**Planning the implementation**

I'll need to:
1. Create the data generators
2. Wire up the context providers
3. Add CSS variable controls
4. Implement the export functionality

This should be straightforward given the existing component architecture.`];
const TOOL_SAMPLES = {
  read: {
    tool: "read",
    input: {
      filePath: "src/components/session-turn.js",
      offset: 1,
      limit: 50
    },
    output: "export function SessionTurn(props) {\n  // component implementation\n  return <div>...</div>\n}",
    title: "Read src/components/session-turn.js",
    metadata: {}
  },
  glob: {
    tool: "glob",
    input: {
      pattern: "**/*.js",
      path: "src/components"
    },
    output: "src/components/button.js\nsrc/components/card.js\nsrc/components/session-turn.js",
    title: "Found 3 files",
    metadata: {}
  },
  grep: {
    tool: "grep",
    input: {
      pattern: "SessionTurn",
      path: "src",
      include: "*.js"
    },
    output: "src/components/session-turn.js:141\nsrc/pages/session/timeline.js:987",
    title: "Found 2 matches",
    metadata: {}
  },
  bash: {
    tool: "bash",
    input: {
      command: "npm test -- --filter session",
      description: "Run session tests"
    },
    output: "npm test\n\n✓ session-turn.test.js (3 tests) 45ms\n✓ message-part.test.js (7 tests) 120ms\n\nTest Suites: 2 passed, 2 total\nTests:       10 passed, 10 total\nTime:        0.89s",
    title: "Run session tests",
    metadata: {
      command: "npm test -- --filter session"
    }
  },
  edit: {
    tool: "edit",
    input: {
      filePath: "src/components/session-turn.js",
      oldString: "gap: 12px",
      newString: "gap: 18px"
    },
    output: "File edited successfully",
    title: "Edit src/components/session-turn.js",
    metadata: {
      filediff: {
        file: "src/components/session-turn.js",
        before: "  gap: 12px;\n  display: flex;",
        after: "  gap: 18px;\n  display: flex;",
        additions: 1,
        deletions: 1
      }
    }
  },
  write: {
    tool: "write",
    input: {
      filePath: "src/utils/helpers.ts",
      content: "export function clamp(value: number, min: number, max: number) {\n  return Math.min(Math.max(value, min), max)\n}\n"
    },
    output: "File written successfully",
    title: "Write src/utils/helpers.ts",
    metadata: {}
  },
  task: {
    tool: "task",
    input: {
      description: "Explore components",
      subagent_type: "explore",
      prompt: "Find all session components"
    },
    output: "Found 12 session-related components across 3 directories.",
    title: "Agent (Explore)",
    metadata: {
      sessionId: "sub-session-1"
    }
  },
  webfetch: {
    tool: "webfetch",
    input: {
      url: "https://solidjs.com/docs/latest/api"
    },
    output: "# SolidJS API Reference\n\nCore primitives for building reactive applications...",
    title: "Fetch https://solidjs.com/docs/latest/api",
    metadata: {}
  },
  websearch: {
    tool: "websearch",
    input: {
      query: "SolidJS createStore performance"
    },
    output: "https://solidjs.com/docs/latest/api#createstore\nhttps://dev.to/solidjs/understanding-solid-reactivity\nhttps://github.com/solidjs/solid/discussions/1234",
    title: "Search: SolidJS createStore performance",
    metadata: {}
  },
  question: {
    tool: "question",
    input: {
      questions: [{
        question: "Which approach do you prefer?",
        header: "Approach",
        options: [{
          label: "Wrapper component",
          description: "Create a new wrapper around SessionTurn"
        }, {
          label: "Direct modification",
          description: "Modify SessionTurn directly"
        }]
      }]
    },
    output: "",
    title: "Question",
    metadata: {
      answers: [["Wrapper component"]]
    }
  },
  skill: {
    tool: "skill",
    input: {
      name: "playwriter"
    },
    output: "Skill loaded successfully",
    title: "playwriter",
    metadata: {}
  },
  todowrite: {
    tool: "todowrite",
    input: {
      todos: [{
        content: "Create data generators",
        status: "completed",
        priority: "high"
      }, {
        content: "Build UI controls",
        status: "in_progress",
        priority: "high"
      }, {
        content: "Add CSS export",
        status: "pending",
        priority: "medium"
      }]
    },
    output: "",
    title: "Todos",
    metadata: {
      todos: [{
        content: "Create data generators",
        status: "completed",
        priority: "high"
      }, {
        content: "Build UI controls",
        status: "in_progress",
        priority: "high"
      }, {
        content: "Add CSS export",
        status: "pending",
        priority: "medium"
      }]
    }
  }
};

// ---------------------------------------------------------------------------
// Fake data generators
// ---------------------------------------------------------------------------
const SESSION_ID = "playground-session";
const DEFAULT_SESSION = {
  id: SESSION_ID,
  title: "Timeline Playground"
};
function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalize(raw) {
  if (Array.isArray(raw)) {
    const info = raw.find(row => record(row) && row.type === "session" && record(row.data))?.data;
    if (!record(info) || typeof info.id !== "string") {
      throw new Error("No session found in JSON");
    }
    const part = new Map();
    const messages = raw.flatMap(row => {
      if (!record(row) || !record(row.data)) return [];
      if (row.type === "part" && typeof row.data.messageID === "string") {
        const list = part.get(row.data.messageID) ?? [];
        list.push(row.data);
        part.set(row.data.messageID, list);
        return [];
      }
      if (row.type !== "message" || typeof row.data.id !== "string") return [];
      return [{
        info: row.data,
        parts: []
      }];
    });
    return {
      info,
      messages: messages.map(msg => ({
        info: msg.info,
        parts: part.get(msg.info.id) ?? []
      }))
    };
  }
  if (!record(raw) || !record(raw.info) || typeof raw.info.id !== "string" || !Array.isArray(raw.messages)) {
    throw new Error("Expected a `closedcode export` JSON file");
  }
  return {
    info: raw.info,
    messages: raw.messages.flatMap(row => {
      if (!record(row) || !record(row.info) || typeof row.info.id !== "string") return [];
      return [{
        info: row.info,
        parts: Array.isArray(row.parts) ? row.parts : []
      }];
    })
  };
}
function mkUser(text, extra = [], sessionID = SESSION_ID) {
  const id = uid();
  return {
    message: {
      id,
      sessionID,
      role: "user",
      time: {
        created: Date.now()
      },
      agent: "code",
      model: {
        providerID: "anthropic",
        modelID: "claude-sonnet-4-20250514"
      }
    },
    parts: [{
      id: uid(),
      type: "text",
      text,
      time: {
        created: Date.now()
      }
    },
    // Clone extra parts with fresh ids so each user message owns unique part instances
    ...extra.map(p => ({
      ...p,
      id: uid()
    }))]
  };
}
function mkAssistant(parentID, sessionID = SESSION_ID) {
  return {
    id: uid(),
    sessionID,
    role: "assistant",
    time: {
      created: Date.now(),
      completed: Date.now() + 3000
    },
    parentID,
    modelID: "claude-sonnet-4-20250514",
    providerID: "anthropic",
    mode: "default",
    agent: "code",
    path: {
      cwd: "/project",
      root: "/project"
    },
    cost: 0.003,
    tokens: {
      input: 1200,
      output: 800,
      reasoning: 200,
      cache: {
        read: 0,
        write: 0
      }
    }
  };
}
function textPart(text) {
  return {
    id: uid(),
    type: "text",
    text,
    time: {
      created: Date.now()
    }
  };
}
function reasoningPart(text) {
  return {
    id: uid(),
    type: "reasoning",
    text,
    time: {
      start: Date.now(),
      end: Date.now() + 500
    }
  };
}
function toolPart(sample, status = "completed") {
  const base = {
    id: uid(),
    type: "tool",
    callID: uid(),
    tool: sample.tool
  };
  if (status === "completed") {
    return {
      ...base,
      state: {
        status: "completed",
        input: sample.input,
        output: sample.output,
        title: sample.title,
        metadata: sample.metadata ?? {},
        time: {
          start: Date.now(),
          end: Date.now() + 1000
        }
      }
    };
  }
  if (status === "running") {
    return {
      ...base,
      state: {
        status: "running",
        input: sample.input,
        title: sample.title,
        metadata: sample.metadata ?? {},
        time: {
          start: Date.now()
        }
      }
    };
  }
  return {
    ...base,
    state: {
      status: "pending",
      input: sample.input,
      raw: ""
    }
  };
}

// ---------------------------------------------------------------------------
// CSS Controls definition
// ---------------------------------------------------------------------------

// Source file basenames inside packages/ui/src/components/
const MD = "markdown.css";
const MP = "message-part.css";
const ST = "session-turn.css";
const CL = "collapsible.css";
const BT = "basic-tool.css";

/**
 * Source mapping for a CSS control.
 * - `anchor`: immutable text near the property (comment, selector, etc.) that
 *   won't change when values change — used to locate the right rule block.
 * - `prop`: the CSS property name whose value gets replaced.
 * - `format`: turns the slider number into a CSS value string.
 */

const px = v => `${v}px`;
const pxZero = v => `${v}px 0`;
const pct = v => `${v}%`;
const CSS_CONTROLS = [
// --- Timeline spacing ---
{
  key: "turn-gap",
  label: "Above user messages",
  group: "Timeline Spacing",
  type: "range",
  initial: "32",
  selector: '[data-slot="session-turn-list"]',
  property: "gap",
  min: "0",
  max: "80",
  step: "1",
  unit: "px",
  source: {
    file: ST,
    anchor: '[data-slot="session-turn-list"]',
    prop: "gap",
    format: px
  }
}, {
  key: "container-gap",
  label: "Below user messages",
  group: "Timeline Spacing",
  type: "range",
  initial: "0",
  selector: '[data-slot="session-turn-message-container"]',
  property: "gap",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: ST,
    anchor: '[data-slot="session-turn-message-container"]',
    prop: "gap",
    format: px
  }
}, {
  key: "assistant-gap",
  label: "Assistant parts gap",
  group: "Timeline Spacing",
  type: "range",
  initial: "12",
  selector: '[data-slot="session-turn-assistant-content"]',
  property: "gap",
  min: "0",
  max: "40",
  step: "1",
  unit: "px",
  source: {
    file: ST,
    anchor: '[data-slot="session-turn-assistant-content"]',
    prop: "gap",
    format: px
  }
}, {
  key: "text-part-margin",
  label: "Text part margin-top",
  group: "Timeline Spacing",
  type: "range",
  initial: "24",
  selector: '[data-component="text-part"]',
  property: "margin-top",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-component="text-part"]',
    prop: "margin-top",
    format: px
  }
},
// --- Markdown typography ---
{
  key: "md-font-size",
  label: "Font size",
  group: "Markdown Typography",
  type: "range",
  initial: "14",
  selector: '[data-component="markdown"]',
  property: "font-size",
  min: "10",
  max: "22",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Reset & Base Typography */",
    prop: "font-size",
    format: px
  }
}, {
  key: "md-line-height",
  label: "Line height",
  group: "Markdown Typography",
  type: "range",
  initial: "180",
  selector: '[data-component="markdown"]',
  property: "line-height",
  min: "100",
  max: "300",
  step: "5",
  unit: "%",
  source: {
    file: MD,
    anchor: "/* Reset & Base Typography */",
    prop: "line-height",
    format: pct
  }
},
// --- Markdown headings ---
{
  key: "md-heading-margin-top",
  label: "Heading margin-top",
  group: "Markdown Headings",
  type: "range",
  initial: "32",
  selector: '[data-component="markdown"] :is(h1,h2,h3,h4,h5,h6)',
  property: "margin-top",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Headings:",
    prop: "margin-top",
    format: px
  }
}, {
  key: "md-heading-margin-bottom",
  label: "Heading margin-bottom",
  group: "Markdown Headings",
  type: "range",
  initial: "12",
  selector: '[data-component="markdown"] :is(h1,h2,h3,h4,h5,h6)',
  property: "margin-bottom",
  min: "0",
  max: "40",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Headings:",
    prop: "margin-bottom",
    format: px
  }
}, {
  key: "md-heading-font-size",
  label: "Heading font size",
  group: "Markdown Headings",
  type: "range",
  initial: "14",
  selector: '[data-component="markdown"] :is(h1,h2,h3,h4,h5,h6)',
  property: "font-size",
  min: "12",
  max: "28",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Headings:",
    prop: "font-size",
    format: px
  }
},
// --- Markdown paragraphs ---
{
  key: "md-p-margin-bottom",
  label: "Paragraph margin-bottom",
  group: "Markdown Paragraphs",
  type: "range",
  initial: "16",
  selector: '[data-component="markdown"] p',
  property: "margin-bottom",
  min: "0",
  max: "40",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Paragraphs */",
    prop: "margin-bottom",
    format: px
  }
},
// --- Markdown lists ---
{
  key: "md-list-margin-top",
  label: "List margin-top",
  group: "Markdown Lists",
  type: "range",
  initial: "8",
  selector: '[data-component="markdown"] :is(ul,ol)',
  property: "margin-top",
  min: "0",
  max: "40",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Lists */",
    prop: "margin-top",
    format: px
  }
}, {
  key: "md-list-margin-bottom",
  label: "List margin-bottom",
  group: "Markdown Lists",
  type: "range",
  initial: "16",
  selector: '[data-component="markdown"] :is(ul,ol)',
  property: "margin-bottom",
  min: "0",
  max: "40",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Lists */",
    prop: "margin-bottom",
    format: px
  }
}, {
  key: "md-list-padding-left",
  label: "List padding-left",
  group: "Markdown Lists",
  type: "range",
  initial: "24",
  selector: '[data-component="markdown"] :is(ul,ol)',
  property: "padding-left",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Lists */",
    prop: "padding-left",
    format: px
  }
}, {
  key: "md-li-margin-bottom",
  label: "List item margin-bottom",
  group: "Markdown Lists",
  type: "range",
  initial: "8",
  selector: '[data-component="markdown"] li',
  property: "margin-bottom",
  min: "0",
  max: "20",
  step: "1",
  unit: "px",
  // Anchor on `li {` to skip the `ul,ol` margin-bottom above
  source: {
    file: MD,
    anchor: "\n  li {",
    prop: "margin-bottom",
    format: px
  }
},
// --- Markdown code blocks ---
{
  key: "md-pre-margin-top",
  label: "Code block margin-top",
  group: "Markdown Code",
  type: "range",
  initial: "32",
  selector: '[data-component="markdown"] pre',
  property: "margin-top",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "\n  pre {",
    prop: "margin-top",
    format: px
  }
}, {
  key: "md-pre-margin-bottom",
  label: "Code block margin-bottom",
  group: "Markdown Code",
  type: "range",
  initial: "32",
  selector: '[data-component="markdown"] pre',
  property: "margin-bottom",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "\n  pre {",
    prop: "margin-bottom",
    format: px
  }
}, {
  key: "md-shiki-font-size",
  label: "Code font size",
  group: "Markdown Code",
  type: "range",
  initial: "13",
  selector: '[data-component="markdown"] .shiki',
  property: "font-size",
  min: "10",
  max: "20",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: ".shiki {",
    prop: "font-size",
    format: px
  }
}, {
  key: "md-shiki-padding",
  label: "Code padding",
  group: "Markdown Code",
  type: "range",
  initial: "12",
  selector: '[data-component="markdown"] .shiki',
  property: "padding",
  min: "0",
  max: "32",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: ".shiki {",
    prop: "padding",
    format: px
  }
}, {
  key: "md-shiki-radius",
  label: "Code border-radius",
  group: "Markdown Code",
  type: "range",
  initial: "6",
  selector: '[data-component="markdown"] .shiki',
  property: "border-radius",
  min: "0",
  max: "16",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: ".shiki {",
    prop: "border-radius",
    format: px
  }
},
// --- Markdown blockquotes ---
{
  key: "md-blockquote-margin",
  label: "Blockquote margin",
  group: "Markdown Blockquotes",
  type: "range",
  initial: "24",
  selector: '[data-component="markdown"] blockquote',
  property: "margin-block",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Blockquotes */",
    prop: "margin",
    format: pxZero
  }
}, {
  key: "md-blockquote-padding-left",
  label: "Blockquote padding-left",
  group: "Markdown Blockquotes",
  type: "range",
  initial: "8",
  selector: '[data-component="markdown"] blockquote',
  property: "padding-left",
  min: "0",
  max: "40",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Blockquotes */",
    prop: "padding-left",
    format: px
  }
}, {
  key: "md-blockquote-border-width",
  label: "Blockquote border width",
  group: "Markdown Blockquotes",
  type: "range",
  initial: "2",
  selector: '[data-component="markdown"] blockquote',
  property: "border-left-width",
  min: "0",
  max: "8",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Blockquotes */",
    prop: "border-left",
    format: v => `${v}px solid var(--border-weak-base)`
  }
},
// --- Markdown tables ---
{
  key: "md-table-margin",
  label: "Table margin",
  group: "Markdown Tables",
  type: "range",
  initial: "24",
  selector: '[data-component="markdown"] table',
  property: "margin-block",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Tables */",
    prop: "margin",
    format: pxZero
  }
}, {
  key: "md-td-padding",
  label: "Cell padding",
  group: "Markdown Tables",
  type: "range",
  initial: "12",
  selector: '[data-component="markdown"] :is(th,td)',
  property: "padding",
  min: "0",
  max: "24",
  step: "1",
  unit: "px",
  // Anchor on td selector to skip other padding rules
  source: {
    file: MD,
    anchor: "th,\n  td {",
    prop: "padding",
    format: px
  }
},
// --- Markdown HR ---
{
  key: "md-hr-margin",
  label: "HR margin",
  group: "Markdown HR",
  type: "range",
  initial: "40",
  selector: '[data-component="markdown"] hr',
  property: "margin-block",
  min: "0",
  max: "80",
  step: "1",
  unit: "px",
  source: {
    file: MD,
    anchor: "/* Horizontal Rule",
    prop: "margin",
    format: pxZero
  }
},
// --- Reasoning part ---
{
  key: "reasoning-md-font-size",
  label: "Reasoning font size",
  group: "Reasoning Part",
  type: "range",
  initial: "14",
  selector: '[data-component="reasoning-part"] [data-component="markdown"]',
  property: "font-size",
  min: "10",
  max: "22",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-component="reasoning-part"]',
    prop: "font-size",
    format: px
  }
}, {
  key: "reasoning-md-margin-top",
  label: "Reasoning markdown margin-top",
  group: "Reasoning Part",
  type: "range",
  initial: "24",
  selector: '[data-component="reasoning-part"] [data-component="markdown"]',
  property: "margin-top",
  min: "0",
  max: "60",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-component="reasoning-part"]',
    prop: "margin-top",
    format: px
  }
},
// --- User message ---
{
  key: "user-msg-padding",
  label: "User bubble padding",
  group: "User Message",
  type: "range",
  initial: "12",
  selector: '[data-slot="user-message-text"]',
  property: "padding",
  min: "0",
  max: "32",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-slot="user-message-text"]',
    prop: "padding",
    format: px
  }
}, {
  key: "user-msg-radius",
  label: "User bubble border-radius",
  group: "User Message",
  type: "range",
  initial: "6",
  selector: '[data-slot="user-message-text"]',
  property: "border-radius",
  min: "0",
  max: "24",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-slot="user-message-text"]',
    prop: "border-radius",
    format: px
  }
},
// --- Tool parts ---
{
  key: "tool-subtitle-font-size",
  label: "Subtitle font size",
  group: "Tool Parts",
  type: "range",
  initial: "14",
  selector: '[data-slot="basic-tool-tool-subtitle"]',
  property: "font-size",
  min: "10",
  max: "22",
  step: "1",
  unit: "px",
  source: {
    file: BT,
    anchor: '[data-slot="basic-tool-tool-subtitle"]',
    prop: "font-size",
    format: px
  }
}, {
  key: "exa-output-font-size",
  label: "Search output font size",
  group: "Tool Parts",
  type: "range",
  initial: "14",
  selector: '[data-component="exa-tool-output"]',
  property: "font-size",
  min: "10",
  max: "22",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-component="exa-tool-output"]',
    prop: "font-size",
    format: px
  }
}, {
  key: "tool-content-gap",
  label: "Trigger/content gap",
  group: "Tool Parts",
  type: "range",
  initial: "4",
  selector: '[data-component="collapsible"].tool-collapsible',
  property: "--tool-content-gap",
  min: "0",
  max: "24",
  step: "1",
  unit: "px",
  source: {
    file: CL,
    anchor: "&.tool-collapsible {",
    prop: "--tool-content-gap",
    format: px
  }
}, {
  key: "context-tool-gap",
  label: "Explored tool gap",
  group: "Explored Group",
  type: "range",
  initial: "4",
  selector: '[data-component="context-tool-group-list"]',
  property: "gap",
  min: "0",
  max: "40",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-component="context-tool-group-list"]',
    prop: "gap",
    format: px
  }
}, {
  key: "context-tool-indent",
  label: "Explored indent",
  group: "Explored Group",
  type: "range",
  initial: "0",
  selector: '[data-component="context-tool-group-list"]',
  property: "padding-left",
  min: "0",
  max: "48",
  step: "1",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-component="context-tool-group-list"]',
    prop: "padding-left",
    format: px
  }
}, {
  key: "bash-max-height",
  label: "Shell output max-height",
  group: "Tool Parts",
  type: "range",
  initial: "240",
  selector: '[data-slot="bash-scroll"]',
  property: "max-height",
  min: "100",
  max: "600",
  step: "10",
  unit: "px",
  source: {
    file: MP,
    anchor: '[data-slot="bash-scroll"]',
    prop: "max-height",
    format: px
  }
}];

// ---------------------------------------------------------------------------
// Playground component
// ---------------------------------------------------------------------------
function FileStub() {
  return _tmpl$();
}
function Playground() {
  // ---- Messages & parts state ----
  const [state, setState] = createStore({
    messages: [],
    parts: {}
  });
  const [session, setSession] = createSignal({
    ...DEFAULT_SESSION
  });
  const [loaded, setLoaded] = createSignal("");
  const [issue, setIssue] = createSignal("");

  // ---- CSS overrides ----
  const [css, setCss] = createStore({});
  const [defaults, setDefaults] = createStore({});
  let styleEl;
  let previewRef;
  let pick;
  const sample = ctrl => {
    if (!ctrl.group.startsWith("Markdown")) return ctrl.selector;
    return ctrl.selector.replace('[data-component="markdown"]', '[data-component="text-part"] [data-component="markdown"]');
  };

  /** Read computed styles from the DOM to seed slider defaults */
  const readDefaults = () => {
    const root = previewRef;
    if (!root) return;
    const next = {};
    for (const ctrl of CSS_CONTROLS) {
      const el = root.querySelector(sample(ctrl)) ?? root.querySelector(ctrl.selector);
      if (!el) continue;
      const styles = getComputedStyle(el);
      const raw = ctrl.property.startsWith("--") ? styles.getPropertyValue(ctrl.property).trim() : styles[ctrl.property];
      if (!raw) continue;
      // Shorthands may return "24px 0px" — take the first value
      const num = parseFloat(raw.split(" ")[0]);
      if (!Number.isFinite(num)) continue;
      // line-height returns px — convert back to % relative to font-size
      if (ctrl.unit === "%") {
        const fs = parseFloat(styles.fontSize);
        if (fs > 0) {
          next[ctrl.key] = String(Math.round(num / fs * 100));
          continue;
        }
      }
      next[ctrl.key] = String(Math.round(num));
    }
    setDefaults(next);
  };
  const updateStyle = () => {
    const rules = [];
    for (const ctrl of CSS_CONTROLS) {
      const val = css[ctrl.key];
      if (val === undefined) continue;
      const value = ctrl.unit ? `${val}${ctrl.unit}` : val;
      rules.push(`${ctrl.selector} { ${ctrl.property}: ${value} !important; }`);
    }
    if (styleEl) styleEl.textContent = rules.join("\n");
  };
  const setCssValue = (key, value) => {
    setCss(key, value);
    updateStyle();
  };
  const resetCss = () => {
    batch(() => {
      for (const ctrl of CSS_CONTROLS) {
        setCss(ctrl.key, undefined);
      }
    });
    if (styleEl) styleEl.textContent = "";
  };

  // ---- Derived ----
  const userMessages = createMemo(() => state.messages.filter(m => m.role === "user"));
  const data = createMemo(() => ({
    session: [session()],
    session_status: {},
    session_diff: {},
    message: {
      [session().id]: state.messages
    },
    part: state.parts,
    provider: {
      all: [{
        id: "anthropic",
        models: {
          "claude-sonnet-4-20250514": {
            name: "Claude Sonnet"
          }
        }
      }]
    }
  }));

  // Read computed defaults once DOM has turn elements to query
  createEffect(on(() => userMessages().length, len => {
    if (len === 0) return;
    // Wait a frame for the DOM to settle after render
    requestAnimationFrame(readDefaults);
  }));

  // ---- Find or create the last assistant message to append parts to ----
  const lastAssistantID = createMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "assistant") return state.messages[i].id;
    }
    return undefined;
  });

  /** Ensure a turn (user + assistant) exists and return the assistant message id */
  const ensureTurn = () => {
    const id = lastAssistantID();
    if (id) return id;
    // Create a minimal placeholder turn
    const user = mkUser("...", [], session().id);
    const asst = mkAssistant(user.message.id, session().id);
    setState(produce(draft => {
      draft.messages.push(user.message);
      draft.messages.push(asst);
      draft.parts[user.message.id] = user.parts;
      draft.parts[asst.id] = [];
    }));
    return asst.id;
  };

  /** Append parts to the last assistant message */
  const appendParts = parts => {
    const id = ensureTurn();
    setState(produce(draft => {
      const existing = draft.parts[id] ?? [];
      draft.parts[id] = [...existing, ...parts];
    }));
  };

  // ---- User message helpers ----
  const addUser = variant => {
    const v = USER_VARIANTS[variant];
    const user = mkUser(v.text, v.parts, session().id);
    const asst = mkAssistant(user.message.id, session().id);
    setState(produce(draft => {
      draft.messages.push(user.message);
      draft.messages.push(asst);
      draft.parts[user.message.id] = user.parts;
      draft.parts[asst.id] = [];
    }));
  };

  // ---- Part helpers (append to last turn) ----
  const addText = variant => {
    appendParts([textPart(MARKDOWN_SAMPLES[variant])]);
  };
  const addReasoning = () => {
    const idx = Math.floor(Math.random() * REASONING_SAMPLES.length);
    appendParts([reasoningPart(REASONING_SAMPLES[idx])]);
  };
  const addTool = name => {
    appendParts([toolPart(TOOL_SAMPLES[name])]);
  };

  // ---- Composite helpers (create full turns with user + assistant) ----
  const addFullTurn = (userText, parts) => {
    const user = mkUser(userText, [], session().id);
    const asst = mkAssistant(user.message.id, session().id);
    setState(produce(draft => {
      draft.messages.push(user.message);
      draft.messages.push(asst);
      draft.parts[user.message.id] = user.parts;
      draft.parts[asst.id] = parts;
    }));
  };
  const addContextGroupTurn = () => {
    addFullTurn("Read some files", [toolPart(TOOL_SAMPLES.read), toolPart(TOOL_SAMPLES.glob), toolPart(TOOL_SAMPLES.grep), textPart("After gathering context, here's what I found:\n\n" + LOREM[2])]);
  };
  const addReasoningFullTurn = () => {
    addFullTurn("Make the changes described above", [reasoningPart(REASONING_SAMPLES[0]), toolPart(TOOL_SAMPLES.read), toolPart(TOOL_SAMPLES.glob), toolPart(TOOL_SAMPLES.grep), toolPart(TOOL_SAMPLES.edit), toolPart(TOOL_SAMPLES.bash), textPart(MARKDOWN_SAMPLES.mixed)]);
  };
  const addKitchenSink = () => {
    // User message variants
    addUser("short");
    appendParts([textPart(MARKDOWN_SAMPLES.headings)]);
    addUser("medium");
    appendParts([textPart(MARKDOWN_SAMPLES.lists)]);
    addUser("long");
    appendParts([textPart(MARKDOWN_SAMPLES.code)]);
    addUser("with @file");
    appendParts([textPart(MARKDOWN_SAMPLES.mixed)]);
    addUser("with image");
    appendParts([reasoningPart(REASONING_SAMPLES[0]), textPart(MARKDOWN_SAMPLES.table)]);
    addUser("multi attachment");
    appendParts([toolPart(TOOL_SAMPLES.read), toolPart(TOOL_SAMPLES.glob), toolPart(TOOL_SAMPLES.grep), toolPart(TOOL_SAMPLES.edit), toolPart(TOOL_SAMPLES.bash), textPart(MARKDOWN_SAMPLES.blockquote)]);
    addContextGroupTurn();
    addReasoningFullTurn();
  };
  const interrupt = () => {
    const user = userMessages().at(-1);
    if (!user) return;
    const now = Date.now();
    setState(produce(draft => {
      const msg = draft.messages.findLast(item => item.role === "assistant" && item.parentID === user.id);
      if (msg) {
        const time = msg.time ?? {
          created: now
        };
        msg.time = {
          ...time,
          completed: time.completed ?? now
        };
        msg.error = {
          name: "MessageAbortedError",
          message: "Interrupted"
        };
        return;
      }
      const asst = mkAssistant(user.id, session().id);
      asst.time = {
        created: now,
        completed: now
      };
      asst.error = {
        name: "MessageAbortedError",
        message: "Interrupted"
      };
      draft.messages.push(asst);
      draft.parts[asst.id] = [];
    }));
  };
  const load = (raw, name) => {
    const next = normalize(raw);
    const id = typeof next.info.id === "string" && next.info.id ? next.info.id : SESSION_ID;
    const messages = next.messages.map(msg => ({
      ...msg.info,
      sessionID: typeof msg.info.sessionID === "string" ? msg.info.sessionID : id
    }));
    const parts = Object.fromEntries(next.messages.map((msg, idx) => {
      const info = messages[idx];
      return [info.id, msg.parts.map(part => ({
        ...part,
        messageID: typeof part.messageID === "string" ? part.messageID : info.id,
        sessionID: typeof part.sessionID === "string" ? part.sessionID : info.sessionID
      }))];
    }));
    batch(() => {
      setSession({
        ...DEFAULT_SESSION,
        ...next.info,
        id,
        title: typeof next.info.title === "string" && next.info.title ? next.info.title : name
      });
      setState({
        messages,
        parts
      });
      setLoaded(name);
      setIssue("");
    });
  };
  const importFile = async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setIssue("");
    try {
      load(JSON.parse(await file.text()), file.name);
    } catch (err) {
      setIssue(err instanceof Error ? err.message : String(err));
    } finally {
      input.value = "";
    }
  };
  const clearAll = () => {
    batch(() => {
      setState({
        messages: [],
        parts: {}
      });
      setSession({
        ...DEFAULT_SESSION
      });
      setLoaded("");
      setIssue("");
      seq = 0;
    });
  };

  // ---- CSS export ----
  const exportCss = () => {
    const lines = ["/* Timeline Playground CSS Overrides */", ""];
    const groups = new Map();
    for (const ctrl of CSS_CONTROLS) {
      const val = css[ctrl.key];
      if (val === undefined) continue;
      const value = ctrl.unit ? `${val}${ctrl.unit}` : val;
      const group = ctrl.group;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(`/* ${ctrl.label}: ${value} */`);
      groups.get(group).push(`${ctrl.selector} { ${ctrl.property}: ${value}; }`);
    }
    if (groups.size === 0) {
      lines.push("/* No overrides applied */");
    } else {
      for (const [group, rules] of groups) {
        lines.push(`/* --- ${group} --- */`);
        lines.push(...rules);
        lines.push("");
      }
    }
    const text = lines.join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    return text;
  };
  const [exported, setExported] = createSignal("");

  // ---- Apply to source files ----
  const [applying, setApplying] = createSignal(false);
  const [applyResult, setApplyResult] = createSignal("");
  const changedControls = createMemo(() => CSS_CONTROLS.filter(ctrl => css[ctrl.key] !== undefined && ctrl.source));
  const applyToSource = async () => {
    const controls = changedControls();
    if (controls.length === 0) return;
    setApplying(true);
    setApplyResult("");
    const edits = controls.map(ctrl => {
      const src = ctrl.source;
      return {
        file: src.file,
        anchor: src.anchor,
        prop: src.prop,
        value: src.format(css[ctrl.key])
      };
    });
    try {
      const resp = await fetch("/__playground/apply-css", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          edits
        })
      });
      const data = await resp.json();
      const ok = data.results?.filter(r => r.ok).length ?? 0;
      const fail = data.results?.filter(r => !r.ok) ?? [];
      const lines = [`Applied ${ok}/${edits.length} edits`];
      for (const f of fail) {
        lines.push(`  FAIL ${f.file} ${f.prop}: ${f.error}`);
      }
      setApplyResult(lines.join("\n"));
      if (ok === edits.length) {
        batch(() => {
          for (const ctrl of controls) {
            setDefaults(ctrl.key, css[ctrl.key]);
            setCss(ctrl.key, undefined);
          }
        });
        updateStyle();
        // Wait for Vite HMR then re-read computed defaults
        setTimeout(readDefaults, 500);
      }
    } catch (err) {
      setApplyResult(`Error: ${err}`);
    } finally {
      setApplying(false);
    }
  };

  // ---- Panel collapse state ----
  const [panels, setPanels] = createStore({
    generators: true,
    css: true,
    export: false
  });

  // ---- Group collapse state for CSS ----
  const [collapsed, setCollapsed] = createStore({});
  const groups = createMemo(() => {
    const result = new Map();
    for (const ctrl of CSS_CONTROLS) {
      if (!result.has(ctrl.group)) result.set(ctrl.group, []);
      result.get(ctrl.group).push(ctrl);
    }
    return result;
  });

  // ---- Shared button styles ----
  const sectionLabel = {
    "font-size": "11px",
    color: "var(--text-weak)",
    "margin-bottom": "4px",
    "text-transform": "uppercase",
    "letter-spacing": "0.5px"
  };
  const btnStyle = {
    padding: "4px 8px",
    "border-radius": "4px",
    border: "1px solid var(--border-weak-base)",
    background: "var(--surface-base)",
    cursor: "pointer",
    "font-size": "12px",
    color: "var(--text-base)"
  };
  const btnAccent = {
    ...btnStyle,
    border: "1px solid var(--border-interactive-base)",
    background: "var(--surface-interactive-weak)",
    "font-weight": "500",
    color: "var(--text-interactive-base)"
  };
  const btnDanger = {
    ...btnStyle,
    border: "1px solid var(--border-critical-base)",
    background: "transparent",
    color: "var(--text-on-critical-base)"
  };
  return (() => {
    var _el$2 = _tmpl$10(),
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.nextSibling,
      _el$5 = _el$4.firstChild,
      _el$6 = _el$5.firstChild,
      _el$7 = _el$6.firstChild,
      _el$8 = _el$7.nextSibling,
      _el$40 = _el$5.nextSibling,
      _el$41 = _el$40.firstChild,
      _el$42 = _el$41.firstChild,
      _el$43 = _el$42.nextSibling,
      _el$46 = _el$40.nextSibling,
      _el$47 = _el$46.firstChild,
      _el$48 = _el$47.firstChild,
      _el$49 = _el$48.nextSibling,
      _el$56 = _el$4.nextSibling;
    var _ref$ = styleEl;
    typeof _ref$ === "function" ? _$use(_ref$, _el$3) : styleEl = _el$3;
    _el$6.$$click = () => setPanels("generators", v => !v);
    _$insert(_el$8, () => panels.generators ? "−" : "+");
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return panels.generators;
      },
      get children() {
        var _el$9 = _tmpl$4(),
          _el$0 = _el$9.firstChild,
          _el$1 = _el$0.nextSibling,
          _el$10 = _el$1.nextSibling,
          _el$11 = _el$10.firstChild,
          _el$12 = _el$11.nextSibling,
          _el$20 = _el$10.nextSibling,
          _el$21 = _el$20.nextSibling,
          _el$22 = _el$21.nextSibling,
          _el$23 = _el$22.nextSibling,
          _el$24 = _el$23.firstChild,
          _el$25 = _el$23.nextSibling,
          _el$26 = _el$25.nextSibling,
          _el$27 = _el$26.nextSibling,
          _el$28 = _el$27.firstChild,
          _el$29 = _el$27.nextSibling,
          _el$30 = _el$29.nextSibling,
          _el$31 = _el$30.nextSibling,
          _el$32 = _el$31.nextSibling,
          _el$33 = _el$32.nextSibling,
          _el$34 = _el$33.nextSibling,
          _el$35 = _el$34.firstChild,
          _el$36 = _el$35.nextSibling,
          _el$37 = _el$36.nextSibling,
          _el$38 = _el$34.nextSibling,
          _el$39 = _el$38.firstChild;
        _el$11.$$click = () => pick?.click();
        _el$12.addEventListener("change", importFile);
        var _ref$2 = pick;
        typeof _ref$2 === "function" ? _$use(_ref$2, _el$12) : pick = _el$12;
        _$insert(_el$9, _$createComponent(Show, {
          get when() {
            return loaded();
          },
          get children() {
            var _el$13 = _tmpl$2(),
              _el$14 = _el$13.firstChild,
              _el$17 = _el$14.nextSibling,
              _el$15 = _el$17.nextSibling,
              _el$18 = _el$15.nextSibling,
              _el$16 = _el$18.nextSibling;
            _$insert(_el$13, loaded, _el$14);
            _$insert(_el$13, () => session().title || session().id, _el$17);
            _$insert(_el$13, () => state.messages.length, _el$18);
            _$insert(_el$13, () => state.messages.length === 1 ? "" : "s", null);
            return _el$13;
          }
        }), _el$20);
        _$insert(_el$9, _$createComponent(Show, {
          get when() {
            return issue();
          },
          get children() {
            var _el$19 = _tmpl$3();
            _$insert(_el$19, issue);
            return _el$19;
          }
        }), _el$20);
        _$insert(_el$22, _$createComponent(For, {
          get each() {
            return Object.keys(USER_VARIANTS);
          },
          children: key => (() => {
            var _el$59 = _tmpl$11();
            _el$59.$$click = () => addUser(key);
            _$insert(_el$59, () => USER_VARIANTS[key].label);
            _$effect(_$p => _$style(_el$59, btnStyle, _$p));
            return _el$59;
          })()
        }));
        _el$24.$$click = interrupt;
        _$insert(_el$27, _$createComponent(For, {
          get each() {
            return Object.keys(MARKDOWN_SAMPLES);
          },
          children: key => (() => {
            var _el$60 = _tmpl$11();
            _el$60.$$click = () => addText(key);
            _$insert(_el$60, key);
            _$effect(_$p => _$style(_el$60, btnStyle, _$p));
            return _el$60;
          })()
        }), _el$28);
        _el$28.$$click = addReasoning;
        _$insert(_el$31, _$createComponent(For, {
          get each() {
            return Object.keys(TOOL_SAMPLES);
          },
          children: key => (() => {
            var _el$61 = _tmpl$11();
            _el$61.$$click = () => addTool(key);
            _$insert(_el$61, key);
            _$effect(_$p => _$style(_el$61, btnStyle, _$p));
            return _el$61;
          })()
        }));
        _el$35.$$click = addContextGroupTurn;
        _el$36.$$click = addReasoningFullTurn;
        _el$37.$$click = addKitchenSink;
        _el$39.$$click = clearAll;
        _$effect(_p$ => {
          var _v$ = sectionLabel,
            _v$2 = btnAccent,
            _v$3 = sectionLabel,
            _v$4 = {
              ...btnDanger,
              opacity: userMessages().length === 0 ? "0.5" : "1",
              cursor: userMessages().length === 0 ? "not-allowed" : "pointer"
            },
            _v$5 = userMessages().length === 0,
            _v$6 = {
              ...sectionLabel
            },
            _v$7 = btnStyle,
            _v$8 = {
              ...sectionLabel
            },
            _v$9 = {
              ...sectionLabel
            },
            _v$0 = btnStyle,
            _v$1 = btnStyle,
            _v$10 = btnAccent,
            _v$11 = btnDanger;
          _p$.e = _$style(_el$0, _v$, _p$.e);
          _p$.t = _$style(_el$11, _v$2, _p$.t);
          _p$.a = _$style(_el$20, _v$3, _p$.a);
          _p$.o = _$style(_el$24, _v$4, _p$.o);
          _v$5 !== _p$.i && (_el$24.disabled = _p$.i = _v$5);
          _p$.n = _$style(_el$25, _v$6, _p$.n);
          _p$.s = _$style(_el$28, _v$7, _p$.s);
          _p$.h = _$style(_el$29, _v$8, _p$.h);
          _p$.r = _$style(_el$32, _v$9, _p$.r);
          _p$.d = _$style(_el$35, _v$0, _p$.d);
          _p$.l = _$style(_el$36, _v$1, _p$.l);
          _p$.u = _$style(_el$37, _v$10, _p$.u);
          _p$.c = _$style(_el$39, _v$11, _p$.c);
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined,
          i: undefined,
          n: undefined,
          s: undefined,
          h: undefined,
          r: undefined,
          d: undefined,
          l: undefined,
          u: undefined,
          c: undefined
        });
        return _el$9;
      }
    }), null);
    _el$41.$$click = () => setPanels("css", v => !v);
    _$insert(_el$43, () => panels.css ? "−" : "+");
    _$insert(_el$40, _$createComponent(Show, {
      get when() {
        return panels.css;
      },
      get children() {
        var _el$44 = _tmpl$5(),
          _el$45 = _el$44.firstChild;
        _el$45.$$click = resetCss;
        _$insert(_el$44, _$createComponent(For, {
          get each() {
            return [...groups().entries()];
          },
          children: ([group, controls]) => (() => {
            var _el$62 = _tmpl$13(),
              _el$63 = _el$62.firstChild,
              _el$64 = _el$63.firstChild;
            _el$63.$$click = () => setCollapsed(group, v => !v);
            _$insert(_el$63, group, _el$64);
            _$insert(_el$64, () => collapsed[group] ? "+" : "−");
            _$insert(_el$62, _$createComponent(Show, {
              get when() {
                return !collapsed[group];
              },
              get children() {
                var _el$65 = _tmpl$12();
                _$insert(_el$65, _$createComponent(For, {
                  each: controls,
                  children: ctrl => (() => {
                    var _el$66 = _tmpl$14(),
                      _el$67 = _el$66.firstChild,
                      _el$68 = _el$67.firstChild,
                      _el$69 = _el$68.nextSibling,
                      _el$70 = _el$67.nextSibling;
                    _$insert(_el$68, () => ctrl.label);
                    _$insert(_el$69, () => css[ctrl.key] ?? defaults[ctrl.key] ?? ctrl.initial, null);
                    _$insert(_el$69, () => ctrl.unit ?? "", null);
                    _el$70.$$input = e => setCssValue(ctrl.key, e.currentTarget.value);
                    _$effect(_p$ => {
                      var _v$15 = css[ctrl.key] !== undefined ? "var(--text-interactive-base)" : "var(--text-weak)",
                        _v$16 = ctrl.min ?? "0",
                        _v$17 = ctrl.max ?? "100",
                        _v$18 = ctrl.step ?? "1";
                      _v$15 !== _p$.e && _$setStyleProperty(_el$69, "color", _p$.e = _v$15);
                      _v$16 !== _p$.t && _$setAttribute(_el$70, "min", _p$.t = _v$16);
                      _v$17 !== _p$.a && _$setAttribute(_el$70, "max", _p$.a = _v$17);
                      _v$18 !== _p$.o && _$setAttribute(_el$70, "step", _p$.o = _v$18);
                      return _p$;
                    }, {
                      e: undefined,
                      t: undefined,
                      a: undefined,
                      o: undefined
                    });
                    _$effect(() => _el$70.value = css[ctrl.key] ?? defaults[ctrl.key] ?? ctrl.initial);
                    return _el$66;
                  })()
                }));
                return _el$65;
              }
            }), null);
            return _el$62;
          })()
        }), null);
        return _el$44;
      }
    }), null);
    _el$47.$$click = () => setPanels("export", v => !v);
    _$insert(_el$49, () => panels.export ? "−" : "+");
    _$insert(_el$46, _$createComponent(Show, {
      get when() {
        return panels.export;
      },
      get children() {
        var _el$50 = _tmpl$9(),
          _el$51 = _el$50.firstChild,
          _el$52 = _el$51.nextSibling;
        _el$51.$$click = () => setExported(exportCss());
        _el$52.$$click = applyToSource;
        _$insert(_el$52, (() => {
          var _c$ = _$memo(() => !!applying());
          return () => _c$() ? "Applying..." : `Apply ${changedControls().length} edit${changedControls().length === 1 ? "" : "s"} to source`;
        })());
        _$insert(_el$50, _$createComponent(Show, {
          get when() {
            return changedControls().length > 0;
          },
          get children() {
            var _el$53 = _tmpl$6();
            _$insert(_el$53, _$createComponent(For, {
              get each() {
                return changedControls();
              },
              children: ctrl => (() => {
                var _el$71 = _tmpl$15(),
                  _el$72 = _el$71.firstChild,
                  _el$74 = _el$72.nextSibling,
                  _el$73 = _el$74.nextSibling;
                _$insert(_el$71, () => ctrl.source.file, _el$72);
                _$insert(_el$71, () => ctrl.property, _el$74);
                _$insert(_el$71, () => css[ctrl.key], null);
                _$insert(_el$71, () => ctrl.unit, null);
                return _el$71;
              })()
            }));
            return _el$53;
          }
        }), null);
        _$insert(_el$50, _$createComponent(Show, {
          get when() {
            return applyResult();
          },
          get children() {
            var _el$54 = _tmpl$7();
            _$insert(_el$54, applyResult);
            return _el$54;
          }
        }), null);
        _$insert(_el$50, _$createComponent(Show, {
          get when() {
            return exported();
          },
          get children() {
            var _el$55 = _tmpl$8();
            _$insert(_el$55, exported);
            return _el$55;
          }
        }), null);
        _$effect(_p$ => {
          var _v$12 = btnAccent,
            _v$13 = {
              ...btnAccent,
              opacity: changedControls().length === 0 || applying() ? "0.5" : "1",
              cursor: changedControls().length === 0 || applying() ? "not-allowed" : "pointer"
            },
            _v$14 = changedControls().length === 0 || applying();
          _p$.e = _$style(_el$51, _v$12, _p$.e);
          _p$.t = _$style(_el$52, _v$13, _p$.t);
          _v$14 !== _p$.a && (_el$52.disabled = _p$.a = _v$14);
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$50;
      }
    }), null);
    var _ref$3 = previewRef;
    typeof _ref$3 === "function" ? _$use(_ref$3, _el$56) : previewRef = _el$56;
    _$insert(_el$56, _$createComponent(DataProvider, {
      get data() {
        return data();
      },
      directory: "/project",
      get children() {
        return _$createComponent(FileComponentProvider, {
          component: FileStub,
          get children() {
            var _el$57 = _tmpl$1();
            _$insert(_el$57, _$createComponent(Show, {
              get when() {
                return userMessages().length > 0;
              },
              get fallback() {
                return _tmpl$16();
              },
              get children() {
                var _el$58 = _tmpl$0();
                _$insert(_el$58, _$createComponent(For, {
                  get each() {
                    return userMessages();
                  },
                  children: msg => (() => {
                    var _el$76 = _tmpl$17();
                    _$insert(_el$76, _$createComponent(SessionTurn, {
                      get sessionID() {
                        return session().id;
                      },
                      get messageID() {
                        return msg.id;
                      },
                      get messages() {
                        return state.messages;
                      },
                      active: false,
                      showReasoningSummaries: true,
                      shellToolDefaultOpen: true,
                      editToolDefaultOpen: true,
                      classes: {
                        root: "min-w-0 w-full relative",
                        content: "flex flex-col justify-between !overflow-visible",
                        container: "w-full"
                      }
                    }));
                    return _el$76;
                  })()
                }));
                return _el$58;
              }
            }));
            return _el$57;
          }
        });
      }
    }));
    return _el$2;
  })();
}

// ---------------------------------------------------------------------------
// Story export
// ---------------------------------------------------------------------------
export default {
  title: "Playground/Timeline",
  id: "playground-timeline",
  parameters: {
    layout: "fullscreen"
  }
};
export const Basic = {
  render: () => _$createComponent(Playground, {})
};
_$delegateEvents(["click", "input"]);