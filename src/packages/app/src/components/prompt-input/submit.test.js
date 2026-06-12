import { beforeAll, beforeEach, describe, expect, mock, test } from "@jest/globals";
let createPromptSubmit;
const createdClients = [];
const createdSessions = [];
const enabledAutoAccept = [];
const optimistic = [];
const optimisticSeeded = [];
const storedSessions = {};
const promoted = [];
const sentShell = [];
const syncedDirectories = [];
let params = {};
let selected = "/repo/worktree-a";
let variant;
const promptValue = [{
  type: "text",
  content: "ls",
  start: 0,
  end: 2
}];
const clientFor = directory => {
  createdClients.push(directory);
  return {
    session: {
      create: async () => {
        createdSessions.push(directory);
        return {
          data: {
            id: `session-${createdSessions.length}`,
            title: `New session ${createdSessions.length}`
          }
        };
      },
      shell: async () => {
        sentShell.push(directory);
        return {
          data: undefined
        };
      },
      prompt: async () => ({
        data: undefined
      }),
      promptAsync: async () => ({
        data: undefined
      }),
      command: async () => ({
        data: undefined
      }),
      abort: async () => ({
        data: undefined
      })
    },
    worktree: {
      create: async () => ({
        data: {
          directory: `${directory}/new`
        }
      })
    }
  };
};
beforeAll(async () => {
  const rootClient = clientFor("/repo/main");
  mock.module("../../lib/router/index.js", () => ({
    useNavigate: () => () => undefined,
    useParams: () => params
  }));
  mock.module("sdk/v2/client", () => ({
    createOpencodeClient: input => {
      createdClients.push(input.directory);
      return clientFor(input.directory);
    }
  }));
  mock.module("ui/toast", () => ({
    showToast: () => 0
  }));
  mock.module("core/util/encode", () => ({
    base64Encode: value => value
  }));
  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: {
        current: () => ({
          id: "model",
          provider: {
            id: "provider"
          }
        }),
        variant: {
          current: () => variant
        }
      },
      agent: {
        current: () => ({
          name: "agent"
        })
      },
      session: {
        promote(directory, sessionID) {
          promoted.push({
            directory,
            sessionID
          });
        }
      }
    })
  }));
  mock.module("@/context/permission", () => ({
    usePermission: () => ({
      enableAutoAccept(sessionID, directory) {
        enabledAutoAccept.push({
          sessionID,
          directory
        });
      }
    })
  }));
  mock.module("@/context/prompt", () => ({
    usePrompt: () => ({
      current: () => promptValue,
      reset: () => undefined,
      set: () => undefined,
      context: {
        add: () => undefined,
        remove: () => undefined,
        items: () => []
      }
    })
  }));
  mock.module("@/context/layout", () => ({
    useLayout: () => ({
      handoff: {
        setTabs: () => undefined
      }
    })
  }));
  mock.module("@/context/sdk", () => ({
    useSDK: () => {
      const sdk = {
        directory: "/repo/main",
        client: rootClient,
        url: "http://localhost:4096",
        createClient(opts) {
          return clientFor(opts.directory);
        }
      };
      return sdk;
    }
  }));
  mock.module("@/context/sync", () => ({
    useSync: () => ({
      data: {
        command: []
      },
      session: {
        optimistic: {
          add: value => {
            optimistic.push(value);
            optimisticSeeded.push(!!value.directory && !!value.sessionID && !!storedSessions[value.directory]?.find(item => item.id === value.sessionID)?.title);
          },
          remove: () => undefined
        }
      },
      set: () => undefined
    })
  }));
  mock.module("@/context/global-sync", () => ({
    useGlobalSync: () => ({
      child: directory => {
        syncedDirectories.push(directory);
        storedSessions[directory] ??= [];
        return [{
          session: storedSessions[directory]
        }, (...args) => {
          if (args[0] !== "session") return;
          const next = args[1];
          if (typeof next === "function") {
            storedSessions[directory] = next(storedSessions[directory]);
            return;
          }
          if (Array.isArray(next)) {
            storedSessions[directory] = next;
          }
        }];
      }
    })
  }));
  mock.module("@/context/platform", () => ({
    usePlatform: () => ({
      fetch: fetch
    })
  }));
  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: key => key
    })
  }));
  const mod = await import("./submit.js");
  createPromptSubmit = mod.createPromptSubmit;
});
beforeEach(() => {
  createdClients.length = 0;
  createdSessions.length = 0;
  enabledAutoAccept.length = 0;
  optimistic.length = 0;
  optimisticSeeded.length = 0;
  promoted.length = 0;
  params = {};
  sentShell.length = 0;
  syncedDirectories.length = 0;
  selected = "/repo/worktree-a";
  variant = undefined;
  for (const key of Object.keys(storedSessions)) delete storedSessions[key];
});
describe("prompt submit worktree selection", () => {
  test("reads the latest worktree accessor value per submit", async () => {
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: value => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined
    });
    const event = {
      preventDefault: () => undefined
    };
    await submit.handleSubmit(event);
    selected = "/repo/worktree-b";
    await submit.handleSubmit(event);
    expect(createdClients).toEqual(["/repo/worktree-a", "/repo/worktree-b"]);
    expect(createdSessions).toEqual(["/repo/worktree-a", "/repo/worktree-b"]);
    expect(sentShell).toEqual(["/repo/worktree-a", "/repo/worktree-b"]);
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"]);
    expect(promoted).toEqual([{
      directory: "/repo/worktree-a",
      sessionID: "session-1"
    }, {
      directory: "/repo/worktree-b",
      sessionID: "session-2"
    }]);
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"]);
  });
  test("applies auto-accept to newly created sessions", async () => {
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: value => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined
    });
    const event = {
      preventDefault: () => undefined
    };
    await submit.handleSubmit(event);
    expect(enabledAutoAccept).toEqual([{
      sessionID: "session-1",
      directory: "/repo/worktree-a"
    }]);
  });
  test("includes the selected variant on optimistic prompts", async () => {
    params = {
      id: "session-1"
    };
    variant = "high";
    const submit = createPromptSubmit({
      info: () => ({
        id: "session-1"
      }),
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: value => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      onSubmit: () => undefined
    });
    const event = {
      preventDefault: () => undefined
    };
    await submit.handleSubmit(event);
    expect(optimistic).toHaveLength(1);
    expect(optimistic[0]).toMatchObject({
      message: {
        agent: "agent",
        model: {
          providerID: "provider",
          modelID: "model",
          variant: "high"
        }
      }
    });
  });
  test("seeds new sessions before optimistic prompts are added", async () => {
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: value => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined
    });
    const event = {
      preventDefault: () => undefined
    };
    await submit.handleSubmit(event);
    expect(storedSessions["/repo/worktree-a"]).toEqual([{
      id: "session-1",
      title: "New session 1"
    }]);
    expect(optimisticSeeded).toEqual([true]);
  });
});