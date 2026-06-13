import {  Effect, Layer, Option  } from "effect"
import {  NodeFileSystem, NodePath  } from "@effect/platform-node"
import {  provideTestInstance, provideTmpdirInstance  } from "../fixture/fixture.js"
import {  tmpdir  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  Config  } from "#config/config.js"
import {  ConfigManaged  } from "#config/managed.js"
import {  ConfigParse  } from "../../src/config/parse.js"
import {  EffectFlock  } from "core/util/effect-flock"
import {  Instance  } from "../../src/project/instance.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Auth  } from "../../src/auth/index.js"
import {  Account  } from "../../src/account/account.js"
import {  AccessToken, AccountID, OrgID  } from "../../src/account/schema.js"
import {  AppFileSystem  } from "core/filesystem"
import {  Env  } from "../../src/env/index.js"
import {  InstanceRuntime  } from "#project/instance-runtime.js"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  Global  } from "core/global"
import {  ProjectID  } from "../../src/project/schema.js"
import {  Filesystem  } from "#util/filesystem.js"
import {  ConfigPlugin  } from "#config/plugin.js"
import {  Npm  } from "core/npm"
import {  test, expect, describe, afterEach, beforeEach, beforeAll, jest  } from "@jest/globals"
/** Infra layer that provides FileSystem, Path, ChildProcessSpawner for test fixtures */
const infra = CrossSpawnSpawner.defaultLayer.pipe(Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)));
import path from "path";
import fs from "fs/promises";
import {  pathToFileURL  } from "url"
const emptyAccount = Layer.mock(Account.Service)({
  active: () => Effect.succeed(Option.none()),
  activeOrg: () => Effect.succeed(Option.none())
});
const emptyAuth = Layer.mock(Auth.Service)({
  all: () => Effect.succeed({})
});
const testFlock = EffectFlock.defaultLayer;
const noopNpm = Layer.mock(Npm.Service)({
  install: () => Effect.void,
  add: () => Effect.die("not implemented"),
  which: () => Effect.succeed(Option.none())
});
const layer = Config.layer.pipe(Layer.provide(testFlock), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Env.defaultLayer), Layer.provide(emptyAuth), Layer.provide(emptyAccount), Layer.provideMerge(infra), Layer.provide(noopNpm));
const it = testEffect(layer);
const load = () => Effect.runPromise(Config.Service.use(svc => svc.get()).pipe(Effect.scoped, Effect.provide(layer)));
const save = config => Effect.runPromise(Config.Service.use(svc => svc.update(config)).pipe(Effect.scoped, Effect.provide(layer)));
const saveGlobal = config => Effect.runPromise(Config.Service.use(svc => svc.updateGlobal(config)).pipe(Effect.map(result => result.info), Effect.scoped, Effect.provide(layer)));
const clear = async (wait = false) => {
  await Effect.runPromise(Config.Service.use(svc => svc.invalidate()).pipe(Effect.scoped, Effect.provide(layer)));
  if (wait) await InstanceRuntime.disposeAllInstances();
};
const listDirs = () => Effect.runPromise(Config.Service.use(svc => svc.directories()).pipe(Effect.scoped, Effect.provide(layer)));
const ready = () => Effect.runPromise(Config.Service.use(svc => svc.waitForDependencies()).pipe(Effect.scoped, Effect.provide(layer)));

// Get managed config directory from environment (set in preload.ts)
const managedConfigDir = process.env.CLOSEDCODE_TEST_MANAGED_CONFIG_DIR;
beforeEach(async () => {
  await clear(true);
});
afterEach(async () => {
  await fs.rm(managedConfigDir, {
    force: true,
    recursive: true
  }).catch(() => {});
  await clear(true);
});
async function writeManagedSettings(settings, filename = "closedcode.json") {
  await fs.mkdir(managedConfigDir, {
    recursive: true
  });
  await Filesystem.write(path.join(managedConfigDir, filename), JSON.stringify(settings));
}
async function writeConfig(dir, config, name = "closedcode.json") {
  await Filesystem.write(path.join(dir, name), JSON.stringify(config));
}
async function check(map) {
  if (process.platform !== "win32") return;
  await using globalTmp = await tmpdir();
  await using tmp = await tmpdir({
    git: true,
    config: {
      snapshot: true
    }
  });
  const prev = Global.Path.config;
  Global.Path.config = globalTmp.path;
  await clear();
  try {
    await writeConfig(globalTmp.path, {
      snapshot: false
    }, "closedcode.json");
    await WithInstance.provide({
      directory: map(tmp.path),
      fn: async () => {
        const cfg = await load();
        expect(cfg.snapshot).toBe(true);
        expect(Instance.directory).toBe(Filesystem.resolve(tmp.path));
        expect(Instance.project.id).not.toBe(ProjectID.global);
      }
    });
  } finally {
    await InstanceRuntime.disposeAllInstances();
    Global.Path.config = prev;
    await clear();
  }
}
test("loads config with defaults when no files exist", async () => {
  await using tmp = await tmpdir();
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.username).toBeDefined();
    }
  });
});
test("loads JSON config file", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        model: "test/model",
        username: "testuser"
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.model).toBe("test/model");
      expect(config.username).toBe("testuser");
    }
  });
});
test("loads shell config field", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        shell: "bash"
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.shell).toBe("bash");
    }
  });
});
test("updates config and preserves empty shell sentinel", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        shell: "bash"
      }, "config.json");
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      await save({
        shell: ""
      });
      const writtenConfig = await Filesystem.readJson(path.join(tmp.path, "config.json"));
      expect(writtenConfig.shell).toBe("");
    }
  });
});
test("updates global config and omits empty shell key in json", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        shell: "bash"
      }, "closedcode.json");
    }
  });
  const prev = Global.Path.config;
  Global.Path.config = tmp.path;
  await clear(true);
  try {
    await saveGlobal({
      shell: ""
    });
    const writtenConfig = await Filesystem.readJson(path.join(tmp.path, "closedcode.json"));
    expect("shell" in writtenConfig).toBe(false);
  } finally {
    ;
    Global.Path.config = prev;
    await clear(true);
  }
});
test("updates global config and omits empty shell key in jsonc", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.jsonc"), JSON.stringify({
        shell: "bash",
        model: "test/model"
      }));
    }
  });
  const prev = Global.Path.config;
  Global.Path.config = tmp.path;
  await clear(true);
  try {
    await saveGlobal({
      shell: ""
    });
    const file = path.join(tmp.path, "closedcode.jsonc");
    const writtenConfig = await Filesystem.readText(file);
    const parsed = ConfigParse.schema(Config.Info.zod, ConfigParse.jsonc(writtenConfig, file), file);
    expect(writtenConfig).not.toContain('"shell"');
    expect(parsed.shell).toBeUndefined();
    expect(parsed.model).toBe("test/model");
  } finally {
    ;
    Global.Path.config = prev;
    await clear(true);
  }
});
test("loads formatter boolean config", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        formatter: true
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.formatter).toBe(true);
    }
  });
});
test("loads lsp boolean config", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        lsp: true
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.lsp).toBe(true);
    }
  });
});
test("loads project config from Git Bash and MSYS2 paths on Windows", async () => {
  // Git Bash and MSYS2 both use /<drive>/... paths on Windows.
  await check(dir => {
    const drive = dir[0].toLowerCase();
    const rest = dir.slice(2).replaceAll("\\", "/");
    return `/${drive}${rest}`;
  });
});
test("loads project config from Cygwin paths on Windows", async () => {
  await check(dir => {
    const drive = dir[0].toLowerCase();
    const rest = dir.slice(2).replaceAll("\\", "/");
    return `/cygdrive/${drive}${rest}`;
  });
});
test("ignores legacy tui keys in opencode config", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        model: "test/model",
        theme: "legacy",
        tui: {
          scroll_speed: 4
        }
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.model).toBe("test/model");
      expect(config.theme).toBeUndefined();
      expect(config.tui).toBeUndefined();
    }
  });
});
test("loads JSONC config file", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.jsonc"), `{
        // This is a comment
        "model": "test/model",
        "username": "testuser"
      }`);
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.model).toBe("test/model");
      expect(config.username).toBe("testuser");
    }
  });
});
test("jsonc overrides json in the same directory", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        model: "base",
        username: "base"
      }, "closedcode.jsonc");
      await writeConfig(dir, {
        model: "override"
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.model).toBe("base");
      expect(config.username).toBe("base");
    }
  });
});
test("handles environment variable substitution", async () => {
  const originalEnv = process.env["TEST_VAR"];
  process.env["TEST_VAR"] = "test-user";
  try {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeConfig(dir, {
          username: "{env:TEST_VAR}"
        });
      }
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await load();
        expect(config.username).toBe("test-user");
      }
    });
  } finally {
    if (originalEnv !== undefined) {
      process.env["TEST_VAR"] = originalEnv;
    } else {
      delete process.env["TEST_VAR"];
    }
  }
});
test("does not rewrite config file or leak resolved env variables on load", async () => {
  const originalEnv = process.env["PRESERVE_VAR"];
  process.env["PRESERVE_VAR"] = "secret_value";
  try {
    await using tmp = await tmpdir({
      init: async dir => {
        // Config without $schema - loading must not rewrite the file
        await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
          username: "{env:PRESERVE_VAR}"
        }));
      }
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = await load();
        expect(config.username).toBe("secret_value");

        // Read the file to verify the env variable was preserved
        const content = await Filesystem.readText(path.join(tmp.path, "closedcode.json"));
        expect(content).toContain("{env:PRESERVE_VAR}");
        expect(content).not.toContain("secret_value");
        // No $schema auto-injection: closedcode does not host a public config schema.
        expect(content).not.toContain("$schema");
      }
    });
  } finally {
    if (originalEnv !== undefined) {
      process.env["PRESERVE_VAR"] = originalEnv;
    } else {
      delete process.env["PRESERVE_VAR"];
    }
  }
});
test("resolves env templates in account config with account token", async () => {
  const originalControlToken = process.env["CLOSEDCODE_CONSOLE_TOKEN"];
  const fakeAccount = Layer.mock(Account.Service)({
    active: () => Effect.succeed(Option.some({
      id: AccountID.make("account-1"),
      email: "user@example.com",
      url: "https://control.example.com",
      active_org_id: OrgID.make("org-1")
    })),
    activeOrg: () => Effect.succeed(Option.some({
      account: {
        id: AccountID.make("account-1"),
        email: "user@example.com",
        url: "https://control.example.com",
        active_org_id: OrgID.make("org-1")
      },
      org: {
        id: OrgID.make("org-1"),
        name: "Example Org"
      }
    })),
    config: () => Effect.succeed(Option.some({
      provider: {
        opencode: {
          options: {
            apiKey: "{env:CLOSEDCODE_CONSOLE_TOKEN}"
          }
        }
      }
    })),
    token: () => Effect.succeed(Option.some(AccessToken.make("st_test_token")))
  });
  const layer = Config.layer.pipe(Layer.provide(testFlock), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Env.defaultLayer), Layer.provide(emptyAuth), Layer.provide(fakeAccount), Layer.provideMerge(infra), Layer.provide(noopNpm));
  try {
    await provideTmpdirInstance(() => Config.Service.use(svc => Effect.gen(function* () {
      const config = yield* svc.get();
      expect(config.provider?.["opencode"]?.options?.apiKey).toBe("st_test_token");
    }))).pipe(Effect.scoped, Effect.provide(layer), Effect.runPromise);
  } finally {
    if (originalControlToken !== undefined) {
      process.env["CLOSEDCODE_CONSOLE_TOKEN"] = originalControlToken;
    } else {
      delete process.env["CLOSEDCODE_CONSOLE_TOKEN"];
    }
  }
});
test("handles file inclusion substitution", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "included.txt"), "test-user");
      await writeConfig(dir, {
        username: "{file:included.txt}"
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.username).toBe("test-user");
    }
  });
});
test("handles file inclusion with replacement tokens", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "included.md"), "const out = await Bun.$`echo hi`");
      await writeConfig(dir, {
        username: "{file:included.md}"
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.username).toBe("const out = await Bun.$`echo hi`");
    }
  });
});
test("validates config schema and throws on invalid fields", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        invalid_field: "should cause error"
      });
    }
  });
  await provideTestInstance({
    directory: tmp.path,
    fn: async () => {
      // Strict schema should throw an error for invalid fields
      await expect(load()).rejects.toThrow();
    }
  });
});
test("throws error for invalid JSON", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), "{ invalid json }");
    }
  });
  await provideTestInstance({
    directory: tmp.path,
    fn: async () => {
      await expect(load()).rejects.toThrow();
    }
  });
});
test("handles agent configuration", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        agent: {
          test_agent: {
            model: "test/model",
            temperature: 0.7,
            description: "test agent"
          }
        }
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test_agent"]).toEqual(expect.objectContaining({
        model: "test/model",
        temperature: 0.7,
        description: "test agent"
      }));
    }
  });
});
test("treats agent variant as model-scoped setting (not provider option)", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        agent: {
          test_agent: {
            model: "openai/gpt-5.2",
            variant: "xhigh",
            max_tokens: 123
          }
        }
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      const agent = config.agent?.["test_agent"];
      expect(agent?.variant).toBe("xhigh");
      expect(agent?.options).toMatchObject({
        max_tokens: 123
      });
      expect(agent?.options).not.toHaveProperty("variant");
    }
  });
});
test("handles command configuration", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        command: {
          test_command: {
            template: "test template",
            description: "test command",
            agent: "test_agent"
          }
        }
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.command?.["test_command"]).toEqual({
        template: "test template",
        description: "test command",
        agent: "test_agent"
      });
    }
  });
});
test("migrates autoshare to share field", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        autoshare: true
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.share).toBe("auto");
      expect(config.autoshare).toBe(true);
    }
  });
});
test("migrates mode field to agent field", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        mode: {
          test_mode: {
            model: "test/model",
            temperature: 0.5
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test_mode"]).toEqual({
        model: "test/model",
        temperature: 0.5,
        mode: "primary",
        options: {},
        permission: {}
      });
    }
  });
});
test("loads config from .closedcode directory", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const closedcodeDir = path.join(dir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      const agentDir = path.join(closedcodeDir, "agent");
      await fs.mkdir(agentDir, {
        recursive: true
      });
      await Filesystem.write(path.join(agentDir, "test.md"), `---
model: test/model
---
Test agent prompt`);
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]).toEqual(expect.objectContaining({
        name: "test",
        model: "test/model",
        prompt: "Test agent prompt"
      }));
    }
  });
});
test("agent markdown permission config preserves user key order", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const agentDir = path.join(dir, ".closedcode", "agent");
      await fs.mkdir(agentDir, {
        recursive: true
      });
      await Filesystem.write(path.join(agentDir, "ordered.md"), `---
permission:
  bash: allow
  "*": deny
  edit: ask
---
Ordered permissions`);
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(Object.keys(config.agent?.ordered?.permission ?? {})).toEqual(["bash", "*", "edit"]);
    }
  });
});
test("loads agents from .closedcode/agents (plural)", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const closedcodeDir = path.join(dir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      const agentsDir = path.join(closedcodeDir, "agents");
      await fs.mkdir(path.join(agentsDir, "nested"), {
        recursive: true
      });
      await Filesystem.write(path.join(agentsDir, "helper.md"), `---
model: test/model
mode: subagent
---
Helper agent prompt`);
      await Filesystem.write(path.join(agentsDir, "nested", "child.md"), `---
model: test/model
mode: subagent
---
Nested agent prompt`);
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["helper"]).toMatchObject({
        name: "helper",
        model: "test/model",
        mode: "subagent",
        prompt: "Helper agent prompt"
      });
      expect(config.agent?.["nested/child"]).toMatchObject({
        name: "nested/child",
        model: "test/model",
        mode: "subagent",
        prompt: "Nested agent prompt"
      });
    }
  });
});
test("loads commands from .closedcode/command (singular)", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const closedcodeDir = path.join(dir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      const commandDir = path.join(closedcodeDir, "command");
      await fs.mkdir(path.join(commandDir, "nested"), {
        recursive: true
      });
      await Filesystem.write(path.join(commandDir, "hello.md"), `---
description: Test command
---
Hello from singular command`);
      await Filesystem.write(path.join(commandDir, "nested", "child.md"), `---
description: Nested command
---
Nested command template`);
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.command?.["hello"]).toEqual({
        description: "Test command",
        template: "Hello from singular command"
      });
      expect(config.command?.["nested/child"]).toEqual({
        description: "Nested command",
        template: "Nested command template"
      });
    }
  });
});
test("loads commands from .closedcode/commands (plural)", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const closedcodeDir = path.join(dir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      const commandsDir = path.join(closedcodeDir, "commands");
      await fs.mkdir(path.join(commandsDir, "nested"), {
        recursive: true
      });
      await Filesystem.write(path.join(commandsDir, "hello.md"), `---
description: Test command
---
Hello from plural commands`);
      await Filesystem.write(path.join(commandsDir, "nested", "child.md"), `---
description: Nested command
---
Nested command template`);
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.command?.["hello"]).toEqual({
        description: "Test command",
        template: "Hello from plural commands"
      });
      expect(config.command?.["nested/child"]).toEqual({
        description: "Nested command",
        template: "Nested command template"
      });
    }
  });
});
test("updates config and writes to file", async () => {
  await using tmp = await tmpdir();
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const newConfig = {
        model: "updated/model"
      };
      await save(newConfig);
      const writtenConfig = await Filesystem.readJson(path.join(tmp.path, "config.json"));
      expect(writtenConfig.model).toBe("updated/model");
    }
  });
});
test("gets config directories", async () => {
  await using tmp = await tmpdir();
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const dirs = await listDirs();
      expect(dirs.length).toBeGreaterThanOrEqual(1);
    }
  });
});
test("does not try to install dependencies in read-only CLOSEDCODE_CONFIG_DIR", async () => {
  if (process.platform === "win32") return;
  await using tmp = await tmpdir({
    init: async dir => {
      const ro = path.join(dir, "readonly");
      await fs.mkdir(ro, {
        recursive: true
      });
      await fs.chmod(ro, 0o555);
      return ro;
    },
    dispose: async dir => {
      const ro = path.join(dir, "readonly");
      await fs.chmod(ro, 0o755).catch(() => {});
      return ro;
    }
  });
  const prev = process.env.CLOSEDCODE_CONFIG_DIR;
  process.env.CLOSEDCODE_CONFIG_DIR = tmp.extra;
  try {
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        await load();
      }
    });
  } finally {
    if (prev === undefined) delete process.env.CLOSEDCODE_CONFIG_DIR;else process.env.CLOSEDCODE_CONFIG_DIR = prev;
  }
});
test("installs dependencies in writable CLOSEDCODE_CONFIG_DIR", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const cfg = path.join(dir, "configdir");
      await fs.mkdir(cfg, {
        recursive: true
      });
      return cfg;
    }
  });
  const prev = process.env.CLOSEDCODE_CONFIG_DIR;
  process.env.CLOSEDCODE_CONFIG_DIR = tmp.extra;
  const testLayer = Config.layer.pipe(Layer.provide(testFlock), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Env.defaultLayer), Layer.provide(emptyAuth), Layer.provide(emptyAccount), Layer.provideMerge(infra), Layer.provide(noopNpm));
  try {
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        await Effect.runPromise(Config.Service.use(svc => svc.get()).pipe(Effect.scoped, Effect.provide(testLayer)));
        await Effect.runPromise(Config.Service.use(svc => svc.waitForDependencies()).pipe(Effect.scoped, Effect.provide(testLayer)));
      }
    });

    // TODO: this is a hack to wait for backgruounded gitignore
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(await Filesystem.exists(path.join(tmp.extra, ".gitignore"))).toBe(true);
    expect(await Filesystem.readText(path.join(tmp.extra, ".gitignore"))).toContain("package-lock.json");
  } finally {
    if (prev === undefined) delete process.env.CLOSEDCODE_CONFIG_DIR;else process.env.CLOSEDCODE_CONFIG_DIR = prev;
  }
});

// Note: deduplication and serialization of npm installs is now handled by the
// core Npm.Service (via EffectFlock). Those behaviors are tested in the core
// package's npm tests, not here.

test("resolves scoped npm plugins in config", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const pluginDir = path.join(dir, "node_modules", "@scope", "plugin");
      await fs.mkdir(pluginDir, {
        recursive: true
      });
      await Filesystem.write(path.join(dir, "package.json"), JSON.stringify({
        name: "config-fixture",
        version: "1.0.0",
        type: "module"
      }, null, 2));
      await Filesystem.write(path.join(pluginDir, "package.json"), JSON.stringify({
        name: "@scope/plugin",
        version: "1.0.0",
        type: "module",
        main: "./index.js"
      }, null, 2));
      await Filesystem.write(path.join(pluginDir, "index.js"), "export default {}\n");
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        plugin: ["@scope/plugin"]
      }, null, 2));
    }
  });
  await provideTestInstance({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      const pluginEntries = config.plugin ?? [];
      expect(pluginEntries).toContain("@scope/plugin");
    }
  });
});
test("merges plugin arrays from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      // Create a nested project structure with local .closedcode config
      const projectDir = path.join(dir, "project");
      const closedcodeDir = path.join(projectDir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });

      // Global config with plugins
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        plugin: ["global-plugin-1", "global-plugin-2"]
      }));

      // Local .closedcode config with different plugins
      await Filesystem.write(path.join(closedcodeDir, "closedcode.json"), JSON.stringify({
        plugin: ["local-plugin-1"]
      }));
    }
  });
  await provideTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async () => {
      const config = await load();
      const plugins = config.plugin ?? [];

      // Should contain both global and local plugins
      expect(plugins.some(p => p.includes("global-plugin-1"))).toBe(true);
      expect(plugins.some(p => p.includes("global-plugin-2"))).toBe(true);
      expect(plugins.some(p => p.includes("local-plugin-1"))).toBe(true);

      // Should have all 3 plugins (not replaced, but merged)
      const pluginNames = plugins.filter(p => p.includes("global-plugin") || p.includes("local-plugin"));
      expect(pluginNames.length).toBeGreaterThanOrEqual(3);
    }
  });
});
test("does not error when only custom agent is a subagent", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const closedcodeDir = path.join(dir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      const agentDir = path.join(closedcodeDir, "agent");
      await fs.mkdir(agentDir, {
        recursive: true
      });
      await Filesystem.write(path.join(agentDir, "helper.md"), `---
model: test/model
mode: subagent
---
Helper subagent prompt`);
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["helper"]).toMatchObject({
        name: "helper",
        model: "test/model",
        mode: "subagent",
        prompt: "Helper subagent prompt"
      });
    }
  });
});
test("merges instructions arrays from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const projectDir = path.join(dir, "project");
      const closedcodeDir = path.join(projectDir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        instructions: ["global-instructions.md", "shared-rules.md"]
      }));
      await Filesystem.write(path.join(closedcodeDir, "closedcode.json"), JSON.stringify({
        instructions: ["local-instructions.md"]
      }));
    }
  });
  await WithInstance.provide({
    directory: path.join(tmp.path, "project"),
    fn: async () => {
      const config = await load();
      const instructions = config.instructions ?? [];
      expect(instructions).toContain("global-instructions.md");
      expect(instructions).toContain("shared-rules.md");
      expect(instructions).toContain("local-instructions.md");
      expect(instructions.length).toBe(3);
    }
  });
});
test("deduplicates duplicate instructions from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const projectDir = path.join(dir, "project");
      const closedcodeDir = path.join(projectDir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        instructions: ["duplicate.md", "global-only.md"]
      }));
      await Filesystem.write(path.join(closedcodeDir, "closedcode.json"), JSON.stringify({
        instructions: ["duplicate.md", "local-only.md"]
      }));
    }
  });
  await WithInstance.provide({
    directory: path.join(tmp.path, "project"),
    fn: async () => {
      const config = await load();
      const instructions = config.instructions ?? [];
      expect(instructions).toContain("global-only.md");
      expect(instructions).toContain("local-only.md");
      expect(instructions).toContain("duplicate.md");
      const duplicates = instructions.filter(i => i === "duplicate.md");
      expect(duplicates.length).toBe(1);
      expect(instructions.length).toBe(3);
    }
  });
});
test("deduplicates duplicate plugins from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      // Create a nested project structure with local .closedcode config
      const projectDir = path.join(dir, "project");
      const closedcodeDir = path.join(projectDir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });

      // Global config with plugins
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        plugin: ["duplicate-plugin", "global-plugin-1"]
      }));

      // Local .closedcode config with some overlapping plugins
      await Filesystem.write(path.join(closedcodeDir, "closedcode.json"), JSON.stringify({
        plugin: ["duplicate-plugin", "local-plugin-1"]
      }));
    }
  });
  await provideTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async () => {
      const config = await load();
      const plugins = config.plugin ?? [];

      // Should contain all unique plugins
      expect(plugins.some(p => p.includes("global-plugin-1"))).toBe(true);
      expect(plugins.some(p => p.includes("local-plugin-1"))).toBe(true);
      expect(plugins.some(p => p.includes("duplicate-plugin"))).toBe(true);

      // Should deduplicate the duplicate plugin
      const duplicatePlugins = plugins.filter(p => p.includes("duplicate-plugin"));
      expect(duplicatePlugins.length).toBe(1);

      // Should have exactly 3 unique plugins
      const pluginNames = plugins.filter(p => p.includes("global-plugin") || p.includes("local-plugin") || p.includes("duplicate-plugin"));
      expect(pluginNames.length).toBe(3);
    }
  });
});
test("keeps plugin origins aligned with merged plugin list", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const project = path.join(dir, "project");
      const local = path.join(project, ".closedcode");
      await fs.mkdir(local, {
        recursive: true
      });
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        plugin: [["shared-plugin@1.0.0", {
          source: "global"
        }], "global-only@1.0.0"]
      }));
      await Filesystem.write(path.join(local, "closedcode.json"), JSON.stringify({
        plugin: [["shared-plugin@2.0.0", {
          source: "local"
        }], "local-only@1.0.0"]
      }));
    }
  });
  await provideTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async () => {
      const cfg = await load();
      const plugins = cfg.plugin ?? [];
      const origins = cfg.plugin_origins ?? [];
      const names = plugins.map(item => ConfigPlugin.pluginSpecifier(item));
      expect(names).toContain("shared-plugin@2.0.0");
      expect(names).not.toContain("shared-plugin@1.0.0");
      expect(names).toContain("global-only@1.0.0");
      expect(names).toContain("local-only@1.0.0");
      expect(origins.map(item => item.spec)).toEqual(plugins);
      const hit = origins.find(item => ConfigPlugin.pluginSpecifier(item.spec) === "shared-plugin@2.0.0");
      expect(hit?.scope).toBe("local");
    }
  });
});

// Legacy tools migration tests

test("migrates legacy tools config to permissions - allow", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        agent: {
          test: {
            tools: {
              bash: true,
              read: true
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]?.permission).toEqual({
        bash: "allow",
        read: "allow"
      });
    }
  });
});
test("migrates legacy tools config to permissions - deny", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        agent: {
          test: {
            tools: {
              bash: false,
              webfetch: false
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]?.permission).toEqual({
        bash: "deny",
        webfetch: "deny"
      });
    }
  });
});
test("migrates legacy write tool to edit permission", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        agent: {
          test: {
            tools: {
              write: true
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]?.permission).toEqual({
        edit: "allow"
      });
    }
  });
});

// Managed settings tests
// Note: preload.ts sets CLOSEDCODE_TEST_MANAGED_CONFIG which Global.Path.managedConfig uses

test("managed settings override user settings", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        model: "user/model",
        share: "auto",
        username: "testuser"
      });
    }
  });
  await writeManagedSettings({
    model: "managed/model",
    share: "disabled"
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.model).toBe("managed/model");
      expect(config.share).toBe("disabled");
      expect(config.username).toBe("testuser");
    }
  });
});
test("managed settings override project settings", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        autoupdate: true,
        disabled_providers: []
      });
    }
  });
  await writeManagedSettings({
    autoupdate: false,
    disabled_providers: ["openai"]
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.autoupdate).toBe(false);
      expect(config.disabled_providers).toEqual(["openai"]);
    }
  });
});
test("missing managed settings file is not an error", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeConfig(dir, {
        model: "user/model"
      });
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.model).toBe("user/model");
    }
  });
});
test("migrates legacy edit tool to edit permission", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        agent: {
          test: {
            tools: {
              edit: false
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]?.permission).toEqual({
        edit: "deny"
      });
    }
  });
});
test("migrates legacy patch tool to edit permission", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        agent: {
          test: {
            tools: {
              patch: true
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]?.permission).toEqual({
        edit: "allow"
      });
    }
  });
});
test("migrates mixed legacy tools config", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        agent: {
          test: {
            tools: {
              bash: true,
              write: true,
              read: false,
              webfetch: true
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]?.permission).toEqual({
        bash: "allow",
        edit: "allow",
        read: "deny",
        webfetch: "allow"
      });
    }
  });
});
test("merges legacy tools with existing permission config", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        agent: {
          test: {
            permission: {
              glob: "allow"
            },
            tools: {
              bash: true
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.agent?.["test"]?.permission).toEqual({
        glob: "allow",
        bash: "allow"
      });
    }
  });
});
test("permission config preserves user key order", async () => {
  // Permission precedence follows the order users write in config, so parsing
  // must not canonicalise known keys ahead of wildcard or custom keys.
  await using tmp = await tmpdir({
    init: async dir => {
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        permission: {
          "*": "deny",
          edit: "ask",
          write: "ask",
          external_directory: "ask",
          read: "allow",
          todowrite: "allow",
          "thoughts_*": "allow",
          "reasoning_model_*": "allow",
          "tools_*": "allow",
          "pr_comments_*": "allow"
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(Object.keys(config.permission)).toEqual(["*", "edit", "write", "external_directory", "read", "todowrite", "thoughts_*", "reasoning_model_*", "tools_*", "pr_comments_*"]);
    }
  });
});
test("Effect config parser preserves permission order while rejecting unknown top-level keys", () => {
  const config = ConfigParse.effectSchema(Config.Info, {
    permission: {
      bash: "allow",
      "*": "deny",
      edit: "ask"
    }
  }, "test");
  expect(Object.keys(config.permission)).toEqual(["bash", "*", "edit"]);
  try {
    ConfigParse.effectSchema(Config.Info, {
      invalid_field: true
    }, "test");
    throw new Error("expected config parse to fail");
  } catch (err) {
    const error = err;
    expect(error.data?.issues?.[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["invalid_field"],
      path: []
    });
  }
});

// MCP config merging tests

test("project config can override MCP server enabled status", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      // Simulates a base config (like from remote .well-known) with disabled MCP
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        mcp: {
          jira: {
            type: "remote",
            url: "https://jira.example.com/mcp",
            enabled: false
          },
          wiki: {
            type: "remote",
            url: "https://wiki.example.com/mcp",
            enabled: false
          }
        }
      }));
      // Project config enables just jira
      await Filesystem.write(path.join(dir, "closedcode.jsonc"), JSON.stringify({
        mcp: {
          jira: {
            type: "remote",
            url: "https://jira.example.com/mcp",
            enabled: true
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      // jira should be enabled (overridden by project config)
      expect(config.mcp?.jira).toEqual({
        type: "remote",
        url: "https://jira.example.com/mcp",
        enabled: true
      });
      // wiki should still be disabled (not overridden)
      expect(config.mcp?.wiki).toEqual({
        type: "remote",
        url: "https://wiki.example.com/mcp",
        enabled: false
      });
    }
  });
});
test("MCP config deep merges preserving base config properties", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      // Base config with full MCP definition
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        mcp: {
          myserver: {
            type: "remote",
            url: "https://myserver.example.com/mcp",
            enabled: false,
            headers: {
              "X-Custom-Header": "value"
            }
          }
        }
      }));
      // Override just enables it, should preserve other properties
      await Filesystem.write(path.join(dir, "closedcode.jsonc"), JSON.stringify({
        mcp: {
          myserver: {
            type: "remote",
            url: "https://myserver.example.com/mcp",
            enabled: true
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.mcp?.myserver).toEqual({
        type: "remote",
        url: "https://myserver.example.com/mcp",
        enabled: true,
        headers: {
          "X-Custom-Header": "value"
        }
      });
    }
  });
});
test("local .closedcode config can override MCP from project config", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      // Project config with disabled MCP
      await Filesystem.write(path.join(dir, "closedcode.json"), JSON.stringify({
        mcp: {
          docs: {
            type: "remote",
            url: "https://docs.example.com/mcp",
            enabled: false
          }
        }
      }));
      // Local .closedcode directory config enables it
      const closedcodeDir = path.join(dir, ".closedcode");
      await fs.mkdir(closedcodeDir, {
        recursive: true
      });
      await Filesystem.write(path.join(closedcodeDir, "closedcode.json"), JSON.stringify({
        mcp: {
          docs: {
            type: "remote",
            url: "https://docs.example.com/mcp",
            enabled: true
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await load();
      expect(config.mcp?.docs?.enabled).toBe(true);
    }
  });
});
test("parseManagedPlist strips MDM metadata keys", async () => {
  const config = ConfigParse.effectSchema(Config.Info, ConfigParse.jsonc(await ConfigManaged.parseManagedPlist(JSON.stringify({
    PayloadDisplayName: "ClosedCode Managed",
    // PayloadIdentifier/PayloadType use legacy ai.opencode.managed domain intentionally
    PayloadIdentifier: "ai.opencode.managed.test",
    PayloadType: "ai.opencode.managed",
    PayloadUUID: "AAAA-BBBB-CCCC",
    PayloadVersion: 1,
    _manualProfile: true,
    share: "disabled",
    model: "mdm/model"
  })), "test:mobileconfig"), "test:mobileconfig");
  expect(config.share).toBe("disabled");
  expect(config.model).toBe("mdm/model");
  // MDM keys must not leak into the parsed config
  expect(config.PayloadUUID).toBeUndefined();
  expect(config.PayloadType).toBeUndefined();
  expect(config._manualProfile).toBeUndefined();
});
test("parseManagedPlist parses server settings", async () => {
  const config = ConfigParse.effectSchema(Config.Info, ConfigParse.jsonc(await ConfigManaged.parseManagedPlist(JSON.stringify({
    server: {
      hostname: "127.0.0.1",
      mdns: false
    },
    autoupdate: true
  })), "test:mobileconfig"), "test:mobileconfig");
  expect(config.server?.hostname).toBe("127.0.0.1");
  expect(config.server?.mdns).toBe(false);
  expect(config.autoupdate).toBe(true);
});
test("parseManagedPlist parses permission rules", async () => {
  const config = ConfigParse.effectSchema(Config.Info, ConfigParse.jsonc(await ConfigManaged.parseManagedPlist(JSON.stringify({
    permission: {
      "*": "ask",
      bash: {
        "*": "ask",
        "rm -rf *": "deny",
        "curl *": "deny"
      },
      grep: "allow",
      glob: "allow",
      webfetch: "ask",
      "~/.ssh/*": "deny"
    }
  })), "test:mobileconfig"), "test:mobileconfig");
  expect(config.permission?.["*"]).toBe("ask");
  expect(config.permission?.grep).toBe("allow");
  expect(config.permission?.webfetch).toBe("ask");
  expect(config.permission?.["~/.ssh/*"]).toBe("deny");
  const bash = config.permission?.bash;
  expect(bash?.["rm -rf *"]).toBe("deny");
  expect(bash?.["curl *"]).toBe("deny");
});
test("parseManagedPlist parses enabled_providers", async () => {
  const config = ConfigParse.effectSchema(Config.Info, ConfigParse.jsonc(await ConfigManaged.parseManagedPlist(JSON.stringify({
    enabled_providers: ["anthropic", "google"]
  })), "test:mobileconfig"), "test:mobileconfig");
  expect(config.enabled_providers).toEqual(["anthropic", "google"]);
});
test("parseManagedPlist handles empty config", async () => {
  const config = ConfigParse.effectSchema(Config.Info, ConfigParse.jsonc(await ConfigManaged.parseManagedPlist(JSON.stringify({
    enabled_providers: ["anthropic"]
  })), "test:mobileconfig"), "test:mobileconfig");
  expect(config.enabled_providers).toEqual(["anthropic"]);
});